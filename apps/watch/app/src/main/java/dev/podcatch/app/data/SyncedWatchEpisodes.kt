package dev.podcatch.app.data

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
)

object SyncedWatchEpisodes {
    private val _episodes = MutableStateFlow<List<WatchEpisode>>(emptyList())
    val episodes: StateFlow<List<WatchEpisode>> = _episodes.asStateFlow()

    fun update(json: String?) {
        if (json == null) return
        val list = mutableListOf<WatchEpisode>()
        val array = JSONArray(json)
        for (i in 0 until array.length()) {
            val obj = array.optJSONObject(i) ?: continue
            list.add(
                WatchEpisode(
                    guid = obj.optString("guid", ""),
                    title = obj.optString("title", ""),
                    podcastTitle = obj.optString("podcastTitle", ""),
                    podcastId = obj.optString("podcastId", ""),
                    audioUrl = obj.optString("audioUrl", ""),
                    duration = obj.optString("duration", ""),
                    pubDate = obj.optString("pubDate", ""),
                    artworkUrl = obj.optString("artworkUrl", ""),
                )
            )
        }
        _episodes.value = list
    }
}
