package dev.podcatch.app.data

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
    val error: Boolean = false,
)

object SyncedWatchEpisodes {
    private val _episodes = MutableStateFlow<List<WatchEpisode>>(emptyList())
    val episodes: StateFlow<List<WatchEpisode>> = _episodes.asStateFlow()

    /** Directory where episode audio files are downloaded. Must be set before [update]. */
    var episodesDir: File? = null

    fun update(json: String?) {
        if (json == null) return
        val existing = _episodes.value.associateBy { it.guid }
        val list = mutableListOf<WatchEpisode>()
        val array = JSONArray(json)
        for (i in 0 until array.length()) {
            val obj = array.optJSONObject(i) ?: continue
            val guid = obj.optString("guid", "")
            val prev = existing[guid]
            // Check in-memory state first, then fall back to checking disk
            val localPath = prev?.localPath ?: run {
                val file = episodesDir?.let { File(it, "$guid.mp3") }
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
                    artworkUrl = obj.optString("artworkUrl", ""),
                    downloadProgress = if (localPath != null) 100 else (prev?.downloadProgress ?: 0),
                    localPath = localPath,
                )
            )
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

    fun markError(guid: String) {
        _episodes.value = _episodes.value.map {
            if (it.guid == guid) it.copy(error = true) else it
        }
    }
}
