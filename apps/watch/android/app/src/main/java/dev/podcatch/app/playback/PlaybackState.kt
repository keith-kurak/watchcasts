package dev.podcatch.app.playback

import android.content.Context
import android.content.SharedPreferences
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/** Listen progress for a single episode, persisted across app restarts. */
data class EpisodeProgress(
    val positionMs: Long = 0L,
    val durationMs: Long = 0L,
    val completed: Boolean = false,
    /**
     * When this position was recorded, in epoch milliseconds.
     *
     * Decides which side wins when the watch and the phone have both listened to the same
     * episode. See docs/watch-sync.md.
     */
    val updatedAt: Long = 0L,
) {
    /** 0f..1f, or 0f when the duration is not known yet. */
    val fraction: Float
        get() = if (durationMs > 0L) (positionMs.toFloat() / durationMs).coerceIn(0f, 1f) else 0f
}

/** Playback status shown in the episode list. */
enum class EpisodeStatus { NEW, IN_PROGRESS, COMPLETE }

/** One episode's listen position as recorded on the phone. Milliseconds. */
data class RemoteProgress(
    val guid: String,
    val positionMs: Long,
    val durationMs: Long,
    val updatedAt: Long,
)

/** Move the loaded player to a position that arrived from the phone. */
data class SeekRequest(val guid: String, val positionMs: Long)

/**
 * Singleton that tracks the currently playing episode guid and persists
 * playback positions across episode switches and app restarts.
 */
object PlaybackState {
    /** Within this distance of the end, an episode counts as finished. */
    private const val COMPLETE_THRESHOLD_MS = 15_000L

    /** Below this position, an episode still counts as unplayed. */
    const val STARTED_THRESHOLD_MS = 5_000L

    /**
     * Below this much movement, a save is treated as recording nothing new.
     *
     * The player screen autosaves on a timer, so a paused player writes the same position
     * over and over. Each of those used to take a fresh timestamp, which made this watch
     * look like the most recent listener for a position it may have just been given by
     * the phone — and pushed it straight back. Left running, the two sides re-sent one
     * stale position to each other every 30s forever.
     */
    private const val UNCHANGED_POSITION_MS = 1_000L

    private var prefs: SharedPreferences? = null

    private val _progress = MutableStateFlow<Map<String, EpisodeProgress>>(emptyMap())

    /** Listen progress by episode guid. Emits whenever a position is saved. */
    val progress: StateFlow<Map<String, EpisodeProgress>> = _progress.asStateFlow()

    private val _playingGuid = MutableStateFlow<String?>(null)

    /** Guid of the episode the player is playing right now, or null when paused. */
    val playingGuid: StateFlow<String?> = _playingGuid.asStateFlow()

    private val _currentGuid = MutableStateFlow<String?>(null)

    /** Guid of the episode loaded in the player, whether playing or paused. */
    val currentGuid: String?
        get() = _currentGuid.value

    private val _seekRequest = MutableStateFlow<SeekRequest?>(null)

    /**
     * A position that arrived from the phone for the episode currently loaded in the
     * player, paused. [dev.podcatch.app.playback.PlaybackService] moves the player to it.
     *
     * Without this the merge would not survive: a paused player writes its own position
     * on pause and on teardown, and that write is newer than the phone's, so it would put
     * the old position straight back.
     */
    val seekRequest: StateFlow<SeekRequest?> = _seekRequest.asStateFlow()

    /** Called by the service once it has moved the player. */
    fun clearSeekRequest() {
        _seekRequest.value = null
    }

    /** Notified whenever a position is written, so it can be published to the phone. */
    private var onProgressSaved: (() -> Unit)? = null

    fun setOnProgressSaved(listener: (() -> Unit)?) {
        onProgressSaved = listener
    }

    fun init(context: Context) {
        if (prefs != null) return
        val p = context.applicationContext.getSharedPreferences("playback", Context.MODE_PRIVATE)
        prefs = p
        _currentGuid.value = p.getString("currentGuid", null)
        _progress.value = readAllProgress(p)
    }

    /**
     * Timestamp used for positions recorded before progress sync existed.
     *
     * Those entries have no stored `updatedAt`. Treating them as 0 would mean the first
     * sync after upgrading rewound every episode to whatever the phone had. Stamped once,
     * so they all share one plausible recording time — older than anything recorded from
     * now on, and newer than nothing.
     */
    private fun legacyEpoch(p: SharedPreferences): Long {
        val stored = p.getLong("legacyProgressEpoch", 0L)
        if (stored != 0L) return stored
        val now = System.currentTimeMillis()
        p.edit().putLong("legacyProgressEpoch", now).apply()
        return now
    }

    private fun readAllProgress(p: SharedPreferences): Map<String, EpisodeProgress> {
        val map = mutableMapOf<String, EpisodeProgress>()
        for ((key, value) in p.all) {
            val guid = when {
                key.startsWith("position:") -> key.removePrefix("position:")
                key.startsWith("duration:") -> key.removePrefix("duration:")
                key.startsWith("completed:") -> key.removePrefix("completed:")
                key.startsWith("updatedAt:") -> key.removePrefix("updatedAt:")
                else -> continue
            }
            val current = map[guid] ?: EpisodeProgress()
            map[guid] = when {
                key.startsWith("position:") -> current.copy(positionMs = value as? Long ?: 0L)
                key.startsWith("duration:") -> current.copy(durationMs = value as? Long ?: 0L)
                key.startsWith("updatedAt:") -> current.copy(updatedAt = value as? Long ?: 0L)
                else -> current.copy(completed = value as? Boolean ?: false)
            }
        }
        val epoch = legacyEpoch(p)
        return map.mapValues { (_, progress) ->
            if (progress.updatedAt == 0L) progress.copy(updatedAt = epoch) else progress
        }
    }

    fun setCurrentEpisode(guid: String) {
        _currentGuid.value = guid
        if (_playingGuid.value != null) _playingGuid.value = guid
        prefs?.edit()?.putString("currentGuid", guid)?.apply()
    }

    /** Called by the playback service whenever the player starts or stops. */
    fun setPlaying(isPlaying: Boolean) {
        _playingGuid.value = if (isPlaying) _currentGuid.value else null
    }

    /**
     * Update the in-memory position without writing to disk.
     *
     * Used to drive live progress UI while audio plays. Kept separate from [savePosition]
     * because the UI wants a tick every second and SharedPreferences does not.
     */
    fun publishPosition(guid: String, positionMs: Long, durationMs: Long = 0L) {
        if (positionMs <= 0L) return
        val previous = _progress.value[guid] ?: EpisodeProgress()
        val duration = if (durationMs > 0L) durationMs else previous.durationMs
        _progress.value = _progress.value + (
            guid to EpisodeProgress(
                positionMs,
                duration,
                isCompleteAt(positionMs, duration),
                // Carried through, not re-stamped. This is a UI tick, not a recorded
                // position — claiming "recorded now" without writing anything would let
                // an unsaved tick outrank the phone in a merge.
                previous.updatedAt,
            )
            )
    }

    fun savePosition(guid: String, positionMs: Long, durationMs: Long = 0L) {
        if (positionMs <= 0L) return
        val previous = _progress.value[guid] ?: EpisodeProgress()
        val duration = if (durationMs > 0L) durationMs else previous.durationMs
        val completed = isCompleteAt(positionMs, duration)
        // Nothing new to record, and re-stamping it would start a sync ping-pong.
        // See [UNCHANGED_POSITION_MS].
        //
        // Compared against the PERSISTED position, not the in-memory one. [publishPosition]
        // advances the in-memory value every second without recording it, so comparing
        // there made every save look like a no-op and stopped persisting entirely.
        val savedPosition = prefs?.getLong("position:$guid", -1L) ?: -1L
        val savedUpdatedAt = prefs?.getLong("updatedAt:$guid", 0L) ?: 0L
        val moved = savedPosition < 0L ||
            kotlin.math.abs(positionMs - savedPosition) >= UNCHANGED_POSITION_MS
        if (!moved && savedUpdatedAt > 0L && duration == previous.durationMs) return
        val now = System.currentTimeMillis()
        prefs?.edit()
            ?.also { editor ->
                editor.putLong("position:$guid", positionMs)
                editor.putLong("updatedAt:$guid", now)
                if (duration > 0L) editor.putLong("duration:$guid", duration)
                // Written both ways, not just when true. The flag used to be sticky —
                // OR'd with its previous value — which permanently broke resume for any
                // episode you had ever finished: the player restarts a completed episode
                // from 0, so re-listening saved a position that was then always ignored.
                if (completed) {
                    editor.putBoolean("completed:$guid", true)
                } else {
                    editor.remove("completed:$guid")
                }
            }
            ?.apply()
        _progress.value =
            _progress.value + (guid to EpisodeProgress(positionMs, duration, completed, now))
        onProgressSaved?.invoke()
    }

    /**
     * Completion is derived from the position, never latched. Re-listening to a finished
     * episode therefore clears the flag on the first save, which is what lets it resume
     * normally from then on.
     */
    private fun isCompleteAt(positionMs: Long, durationMs: Long): Boolean =
        durationMs > 0L && positionMs >= durationMs - COMPLETE_THRESHOLD_MS

    fun markCompleted(guid: String, durationMs: Long) {
        val previous = _progress.value[guid] ?: EpisodeProgress()
        val duration = if (durationMs > 0L) durationMs else previous.durationMs
        val position = if (duration > 0L) duration else previous.positionMs
        val now = System.currentTimeMillis()
        prefs?.edit()
            ?.also { editor ->
                editor.putBoolean("completed:$guid", true)
                editor.putLong("updatedAt:$guid", now)
                if (duration > 0L) {
                    editor.putLong("duration:$guid", duration)
                    editor.putLong("position:$guid", duration)
                }
            }
            ?.apply()
        _progress.value =
            _progress.value + (guid to EpisodeProgress(position, duration, true, now))
        onProgressSaved?.invoke()
    }

    /**
     * Apply listen positions recorded on the phone, newest-wins per episode.
     *
     * Two things are deliberately not overwritten:
     *
     * - **The episode playing right now.** Its position is advancing and is only written
     *   to disk every so often, so any stored value is stale by construction. Applying an
     *   incoming one would jump the audio the user is listening to.
     * - **Anything the watch recorded more recently.** That is the whole conflict rule.
     *
     * The incoming timestamp is stored as-is rather than re-stamped. Re-stamping would
     * make this watch look like the more recent listener and push the phone's own
     * position straight back to it on the next publish.
     *
     * @return true when at least one position changed.
     */
    fun applyRemoteProgress(entries: List<RemoteProgress>): Boolean {
        val playing = _playingGuid.value
        var changed = false
        var seek: SeekRequest? = null
        for (entry in entries) {
            if (entry.guid.isBlank() || entry.positionMs <= 0L) continue
            if (entry.guid == playing) continue
            val previous = _progress.value[entry.guid]
            if (previous != null && previous.updatedAt >= entry.updatedAt) continue
            val duration =
                if (entry.durationMs > 0L) entry.durationMs else previous?.durationMs ?: 0L
            val completed = isCompleteAt(entry.positionMs, duration)
            prefs?.edit()
                ?.also { editor ->
                    editor.putLong("position:${entry.guid}", entry.positionMs)
                    editor.putLong("updatedAt:${entry.guid}", entry.updatedAt)
                    if (duration > 0L) editor.putLong("duration:${entry.guid}", duration)
                    if (completed) {
                        editor.putBoolean("completed:${entry.guid}", true)
                    } else {
                        editor.remove("completed:${entry.guid}")
                    }
                }
                ?.apply()
            _progress.value = _progress.value + (
                entry.guid to EpisodeProgress(
                    entry.positionMs,
                    duration,
                    completed,
                    entry.updatedAt,
                )
                )
            changed = true
            // Loaded but paused: the player still holds the old position and would write
            // it back. Ask the service to move it.
            if (entry.guid == _currentGuid.value) {
                seek = SeekRequest(entry.guid, entry.positionMs)
            }
        }
        if (seek != null) _seekRequest.value = seek
        return changed
    }

    fun getProgress(guid: String): EpisodeProgress = _progress.value[guid] ?: EpisodeProgress()

    /**
     * Persisted positions only, for publishing to the phone.
     *
     * Not [progress], which the once-a-second UI ticker advances without recording. Reading
     * that published a live position carrying the timestamp of a much older save, so the
     * receiving side judged a fresh position by a stale clock.
     */
    fun savedProgressSnapshot(): Map<String, EpisodeProgress> {
        val p = prefs ?: return emptyMap()
        return readAllProgress(p)
    }

    /** Drop stored progress for episodes no longer on the watch. */
    fun forget(guid: String) {
        prefs?.edit()
            ?.remove("position:$guid")
            ?.remove("duration:$guid")
            ?.remove("completed:$guid")
            ?.remove("updatedAt:$guid")
            ?.apply()
        _progress.value = _progress.value - guid
    }

    fun saveSpeed(speed: Float) {
        prefs?.edit()?.putFloat("playbackSpeed", speed)?.apply()
    }

    fun getSavedSpeed(): Float {
        return prefs?.getFloat("playbackSpeed", 1.0f) ?: 1.0f
    }
}

fun statusOf(progress: EpisodeProgress?): EpisodeStatus = when {
    progress == null -> EpisodeStatus.NEW
    progress.completed -> EpisodeStatus.COMPLETE
    progress.positionMs > PlaybackState.STARTED_THRESHOLD_MS -> EpisodeStatus.IN_PROGRESS
    else -> EpisodeStatus.NEW
}
