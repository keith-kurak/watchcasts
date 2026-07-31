package dev.podcatch.app.data

import dev.podcatch.app.playback.PlaybackState
import java.io.File
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import org.json.JSONArray

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

object SyncedWatchEpisodes {
    private val _episodes = MutableStateFlow<List<WatchEpisode>>(emptyList())
    val episodes: StateFlow<List<WatchEpisode>> = _episodes.asStateFlow()

    /** Directory where episode audio files are downloaded. Must be set before [update]. */
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
                )
            )
        }
        // Delete downloaded files for episodes removed from the watch list
        val keptArtwork = list.mapNotNull { it.artworkPath }.toSet()
        for ((guid, ep) in existing) {
            if (guid in newGuids) continue
            ep.localPath?.let { File(it).delete() }
            ep.artworkPath?.let { if (it !in keptArtwork) File(it).delete() }
            PlaybackState.forget(guid)
        }
        _episodes.value = list
    }

    fun updateProgress(guid: String, progress: Int) {
        _episodes.value = _episodes.value.map {
            if (it.guid == guid) it.copy(downloadProgress = progress) else it
        }
    }

    fun markDownloaded(guid: String, localPath: String) {
        _episodes.value = _episodes.value.map {
            if (it.guid == guid) it.copy(downloadProgress = 100, localPath = localPath, error = false) else it
        }
    }

    /** Point every episode using [artworkUrl] at the cached file. */
    fun markArtworkDownloaded(artworkUrl: String, path: String) {
        _episodes.value = _episodes.value.map {
            if (it.artworkUrl == artworkUrl) it.copy(artworkPath = path) else it
        }
    }

    fun markError(guid: String) {
        _episodes.value = _episodes.value.map {
            if (it.guid == guid) it.copy(error = true) else it
        }
    }
}
