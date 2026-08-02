package dev.podcatch.app.data

import android.content.Context
import android.content.SharedPreferences
import dev.podcatch.app.playback.PlaybackState
import java.io.File
import java.util.concurrent.ConcurrentHashMap
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import org.json.JSONArray
import org.json.JSONObject

data class WatchEpisode(
    val guid: String,
    val title: String,
    val podcastTitle: String,
    val podcastId: String,
    val audioUrl: String,
    val duration: String,
    val pubDate: String,
    val artworkUrl: String,
    val downloadProgress: Int = 0,
    val localPath: String? = null,
    /** Cached artwork file on disk, so the list renders offline. */
    val artworkPath: String? = null,
    val error: Boolean = false,
)

/**
 * The watch's view of the episodes the phone has queued for it.
 *
 * Backed by [SharedPreferences]. Wear OS kills app processes aggressively, and
 * WorkManager will start a fresh process to run a worker — so treat process death
 * as the normal case. Anything that reads this state must call [load] first, or it
 * will see an empty list and conclude there is nothing to download.
 */
object SyncedWatchEpisodes {
    private const val PREFS_NAME = "watch-episodes"
    private const val KEY_EPISODES = "episodes"

    /** While a download runs, write progress to disk at most every this many percent. */
    private const val PROGRESS_PERSIST_STEP = 5

    private var prefs: SharedPreferences? = null

    /** True once [load] has run in this process, whether or not it found anything. */
    @Volatile
    private var loaded = false

    /**
     * True when a stored list was found on disk. Distinguishes "the watch has nothing
     * queued" from "this process has no idea what is queued" — the two look identical
     * in [episodes] but mean very different things to a caller.
     */
    @Volatile
    var hasStoredList = false
        private set

    /**
     * Last percent written to disk per guid, so progress updates do not thrash it.
     * Concurrent: the download worker writes from an IO thread while Data Layer
     * callbacks mutate it from the main thread.
     */
    private val lastPersistedProgress = ConcurrentHashMap<String, Int>()

    private val _episodes = MutableStateFlow<List<WatchEpisode>>(emptyList())
    val episodes: StateFlow<List<WatchEpisode>> = _episodes.asStateFlow()

    /** Directory where episode audio files are downloaded. Set by [init]. */
    var episodesDir: File? = null

    /** Directory where podcast artwork is cached. Defaults to [episodesDir]/artwork. */
    val artworkDir: File?
        get() = episodesDir?.let { File(it, "artwork") }

    /** Stable on-disk name for an artwork URL, shared by episodes of the same podcast. */
    fun artworkFile(artworkUrl: String): File? {
        if (artworkUrl.isBlank()) return null
        val name = Integer.toHexString(artworkUrl.hashCode()) + ".img"
        return artworkDir?.let { File(it, name) }
    }

    /** Wire up preferences and the episodes directory. Cheap and idempotent. */
    fun init(context: Context) {
        val app = context.applicationContext
        if (prefs == null) {
            prefs = app.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        }
        if (episodesDir == null) {
            episodesDir = File(app.filesDir, "episodes")
        }
    }

    /**
     * Restore the episode list from disk if this process has not done so yet.
     *
     * The first call wins. A later call cannot clobber a live in-memory list with a
     * staler copy from disk.
     */
    @Synchronized
    fun load(context: Context) {
        init(context)
        if (loaded) return
        loaded = true

        val raw = prefs?.getString(KEY_EPISODES, null) ?: return
        hasStoredList = true

        val restored = mutableListOf<WatchEpisode>()
        val array = JSONArray(raw)
        for (i in 0 until array.length()) {
            val obj = array.optJSONObject(i) ?: continue
            restored.add(storedEpisode(obj))
        }
        // Only adopt the stored list if nothing has populated us in the meantime —
        // a Data Layer event racing this load holds fresher data than disk does.
        if (_episodes.value.isEmpty()) {
            _episodes.value = restored
        }
    }

    /** Read a full record, including download state, as written by [persist]. */
    private fun storedEpisode(obj: JSONObject): WatchEpisode {
        // A file can be deleted out from under us (cache clear, manual removal), so a
        // stored path is only trusted when it still exists.
        val storedPath = obj.optString("localPath", "").takeIf { it.isNotBlank() }
        val localPath = storedPath?.takeIf { File(it).exists() }
        val storedArtwork = obj.optString("artworkPath", "").takeIf { it.isNotBlank() }
        val artworkPath = storedArtwork?.takeIf { File(it).exists() }
        val storedProgress = obj.optInt("downloadProgress", 0)
        val progress = when {
            localPath != null -> 100
            // The record claimed a finished file that is no longer there. Its stored
            // 100% is meaningless now, and reporting it would show the phone a
            // completed download that does not exist.
            storedPath != null -> 0
            else -> storedProgress
        }
        return WatchEpisode(
            guid = obj.optString("guid", ""),
            title = obj.optString("title", ""),
            podcastTitle = obj.optString("podcastTitle", ""),
            podcastId = obj.optString("podcastId", ""),
            audioUrl = obj.optString("audioUrl", ""),
            duration = obj.optString("duration", ""),
            pubDate = obj.optString("pubDate", ""),
            artworkUrl = obj.optString("artworkUrl", ""),
            downloadProgress = progress,
            localPath = localPath,
            artworkPath = artworkPath,
            error = obj.optBoolean("error", false),
        )
    }

    private fun WatchEpisode.toStoredJson(): JSONObject = JSONObject().apply {
        put("guid", guid)
        put("title", title)
        put("podcastTitle", podcastTitle)
        put("podcastId", podcastId)
        put("audioUrl", audioUrl)
        put("duration", duration)
        put("pubDate", pubDate)
        put("artworkUrl", artworkUrl)
        put("downloadProgress", downloadProgress)
        put("localPath", localPath ?: "")
        put("artworkPath", artworkPath ?: "")
        put("error", error)
    }

    @Synchronized
    private fun persist() {
        val p = prefs ?: return
        val array = JSONArray()
        for (episode in _episodes.value) array.put(episode.toStoredJson())
        p.edit().putString(KEY_EPISODES, array.toString()).apply()
        hasStoredList = true
    }

    /** Apply a fresh episode list pushed from the phone. */
    fun update(json: String?) {
        if (json == null) return
        val existing = _episodes.value.associateBy { it.guid }
        val list = mutableListOf<WatchEpisode>()
        val newGuids = mutableSetOf<String>()
        val array = JSONArray(json)
        for (i in 0 until array.length()) {
            val obj = array.optJSONObject(i) ?: continue
            val guid = obj.optString("guid", "")
            newGuids.add(guid)
            val prev = existing[guid]
            // Check in-memory state first, then fall back to checking disk
            val localPath = prev?.localPath ?: run {
                val file = episodesDir?.let { File(it, "$guid.mp3") }
                if (file?.exists() == true) file.absolutePath else null
            }
            val artworkUrl = obj.optString("artworkUrl", "")
            val artworkPath = prev?.artworkPath ?: run {
                val file = artworkFile(artworkUrl)
                if (file?.exists() == true) file.absolutePath else null
            }
            list.add(
                WatchEpisode(
                    guid = guid,
                    title = obj.optString("title", ""),
                    podcastTitle = obj.optString("podcastTitle", ""),
                    podcastId = obj.optString("podcastId", ""),
                    audioUrl = obj.optString("audioUrl", ""),
                    duration = obj.optString("duration", ""),
                    pubDate = obj.optString("pubDate", ""),
                    artworkUrl = artworkUrl,
                    downloadProgress = if (localPath != null) 100 else (prev?.downloadProgress ?: 0),
                    localPath = localPath,
                    artworkPath = artworkPath,
                    // A failure is sticky. Clearing it here would silently re-arm a
                    // failed episode on every sync from the phone; retry is manual.
                    error = prev?.error ?: false,
                )
            )
        }
        // Delete downloaded files for episodes removed from the watch list
        val keptArtwork = list.mapNotNull { it.artworkPath }.toSet()
        for ((guid, ep) in existing) {
            if (guid in newGuids) continue
            ep.localPath?.let { File(it).delete() }
            ep.artworkPath?.let { if (it !in keptArtwork) File(it).delete() }
            // Partial downloads are kept across attempts so they can resume, so a
            // removed episode has to take its .tmp with it.
            episodesDir?.let { File(it, "$guid.mp3.tmp").delete() }
            PlaybackState.forget(guid)
            lastPersistedProgress.remove(guid)
        }
        _episodes.value = list
        persist()
    }

    fun updateProgress(guid: String, progress: Int) {
        _episodes.update { list ->
            list.map { if (it.guid == guid) it.copy(downloadProgress = progress) else it }
        }
        // Persisting every whole percent would mean hundreds of writes per episode.
        val last = lastPersistedProgress[guid] ?: -1
        if (last < 0 || progress / PROGRESS_PERSIST_STEP != last / PROGRESS_PERSIST_STEP) {
            lastPersistedProgress[guid] = progress
            persist()
        }
    }

    fun markDownloaded(guid: String, localPath: String) {
        _episodes.update { list ->
            list.map {
                if (it.guid == guid) {
                    it.copy(downloadProgress = 100, localPath = localPath, error = false)
                } else {
                    it
                }
            }
        }
        lastPersistedProgress.remove(guid)
        persist()
    }

    /** Point every episode using [artworkUrl] at the cached file. */
    fun markArtworkDownloaded(artworkUrl: String, path: String) {
        _episodes.update { list ->
            list.map { if (it.artworkUrl == artworkUrl) it.copy(artworkPath = path) else it }
        }
        persist()
    }

    fun markError(guid: String) {
        _episodes.update { list ->
            list.map { if (it.guid == guid) it.copy(error = true) else it }
        }
        lastPersistedProgress.remove(guid)
        persist()
    }
}
