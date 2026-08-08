package dev.podcatch.app.data

import android.content.Context
import android.content.SharedPreferences
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * Episodes queued to play after the current one, in play order.
 *
 * Guids only, persisted — a worker or a fresh process must see the same queue the UI does,
 * for the same reason [SyncedWatchEpisodes] is persisted. See docs/watch-sync.md.
 *
 * **Watch-only, on purpose.** Nothing about this queue crosses the Data Layer and the phone
 * has no notion of it: it is set on the watch and seen on the watch. Queuing is a
 * decision about what to listen to next *here*, made in the moment, and routing it through
 * the phone made the feature harder to understand than the thing it was automating.
 *
 * That also keeps the contract untouched — no new path, no ownership question, nothing to
 * mirror across three files.
 */
object UpNextQueue {
    private const val PREFS_NAME = "up-next"
    private const val KEY_GUIDS = "guids"

    /**
     * A shortlist, not a playlist. Five is what fits above the rest of the list without
     * pushing it off screen, and few enough that reordering never becomes necessary —
     * removing and re-adding is quicker than any drag affordance would be on a watch.
     */
    const val MAX_SIZE = 5

    /**
     * SharedPreferences has no ordered-list type and a string set would lose the order,
     * which is the only thing a queue is. Newline-joined because a guid can contain almost
     * anything else — these come from feeds, not from us.
     */
    private const val SEPARATOR = "\n"

    private var prefs: SharedPreferences? = null

    private val _guids = MutableStateFlow<List<String>>(emptyList())

    /** Queued episode guids, front first. */
    val guids: StateFlow<List<String>> = _guids.asStateFlow()

    @Synchronized
    fun load(context: Context) {
        if (prefs != null) return
        val p = context.applicationContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        prefs = p
        val stored = p.getString(KEY_GUIDS, "").orEmpty()
        _guids.value = if (stored.isEmpty()) emptyList() else stored.split(SEPARATOR)
    }

    fun contains(guid: String): Boolean = _guids.value.contains(guid)

    val isFull: Boolean
        get() = _guids.value.size >= MAX_SIZE

    /** @return false when the queue is full or already holds this episode. */
    fun add(guid: String): Boolean {
        if (guid.isBlank() || contains(guid) || isFull) return false
        _guids.value = _guids.value + guid
        persist()
        return true
    }

    fun remove(guid: String) {
        if (!contains(guid)) return
        _guids.value = _guids.value - guid
        persist()
    }

    /**
     * Drop queued guids that are no longer on the watch list.
     *
     * A stale entry is invisible — nothing renders it — but still occupies one of the five
     * slots, which reads as a full queue with fewer than five episodes shown.
     */
    fun pruneTo(liveGuids: Set<String>) {
        val kept = _guids.value.filter { it in liveGuids }
        if (kept.size == _guids.value.size) return
        _guids.value = kept
        persist()
    }

    private fun persist() {
        prefs?.edit()?.putString(KEY_GUIDS, _guids.value.joinToString(SEPARATOR))?.apply()
    }
}
