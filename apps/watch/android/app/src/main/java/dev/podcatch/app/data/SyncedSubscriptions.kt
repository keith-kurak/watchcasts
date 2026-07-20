package dev.podcatch.app.data

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import org.json.JSONArray

/**
 * In-memory store for subscriptions synced from the phone via the Data Layer.
 *
 * This will eventually be replaced by Room, but for now it lets the UI react
 * immediately when the phone pushes a new subscription list.
 */
object SyncedSubscriptions {
    private val _titles = MutableStateFlow<List<String>>(emptyList())
    val titles: StateFlow<List<String>> = _titles.asStateFlow()

    fun update(json: String?) {
        if (json == null) return
        val list = mutableListOf<String>()
        val array = JSONArray(json)
        for (i in 0 until array.length()) {
            val obj = array.optJSONObject(i)
            // Accept either an object with a "title" field or a plain string
            val title = obj?.optString("title") ?: array.optString(i)
            if (title.isNotBlank()) list.add(title)
        }
        _titles.value = list
    }
}
