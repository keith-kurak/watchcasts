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
) {
    /** 0f..1f, or 0f when the duration is not known yet. */
    val fraction: Float
        get() = if (durationMs > 0L) (positionMs.toFloat() / durationMs).coerceIn(0f, 1f) else 0f
}

/** Playback status shown in the episode list. */
enum class EpisodeStatus { NEW, IN_PROGRESS, COMPLETE }

/**
 * Singleton that tracks the currently playing episode guid and persists
 * playback positions across episode switches and app restarts.
 */
object PlaybackState {
    /** Within this distance of the end, an episode counts as finished. */
    private const val COMPLETE_THRESHOLD_MS = 15_000L

    /** Below this position, an episode still counts as unplayed. */
    const val STARTED_THRESHOLD_MS = 5_000L

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

    fun init(context: Context) {
        if (prefs != null) return
        val p = context.applicationContext.getSharedPreferences("playback", Context.MODE_PRIVATE)
        prefs = p
        _currentGuid.value = p.getString("currentGuid", null)
        _progress.value = readAllProgress(p)
    }

    private fun readAllProgress(p: SharedPreferences): Map<String, EpisodeProgress> {
        val map = mutableMapOf<String, EpisodeProgress>()
        for ((key, value) in p.all) {
            val guid = when {
                key.startsWith("position:") -> key.removePrefix("position:")
                key.startsWith("duration:") -> key.removePrefix("duration:")
                key.startsWith("completed:") -> key.removePrefix("completed:")
                else -> continue
            }
            val current = map[guid] ?: EpisodeProgress()
            map[guid] = when {
                key.startsWith("position:") -> current.copy(positionMs = value as? Long ?: 0L)
                key.startsWith("duration:") -> current.copy(durationMs = value as? Long ?: 0L)
                else -> current.copy(completed = value as? Boolean ?: false)
            }
        }
        return map
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

    fun savePosition(guid: String, positionMs: Long, durationMs: Long = 0L) {
        if (positionMs <= 0L) return
        val previous = _progress.value[guid] ?: EpisodeProgress()
        val duration = if (durationMs > 0L) durationMs else previous.durationMs
        val completed = previous.completed ||
            (duration > 0L && positionMs >= duration - COMPLETE_THRESHOLD_MS)
        prefs?.edit()
            ?.also { editor ->
                editor.putLong("position:$guid", positionMs)
                if (duration > 0L) editor.putLong("duration:$guid", duration)
                if (completed) editor.putBoolean("completed:$guid", true)
            }
            ?.apply()
        _progress.value = _progress.value + (guid to EpisodeProgress(positionMs, duration, completed))
    }

    fun markCompleted(guid: String, durationMs: Long) {
        val previous = _progress.value[guid] ?: EpisodeProgress()
        val duration = if (durationMs > 0L) durationMs else previous.durationMs
        val position = if (duration > 0L) duration else previous.positionMs
        prefs?.edit()
            ?.also { editor ->
                editor.putBoolean("completed:$guid", true)
                if (duration > 0L) {
                    editor.putLong("duration:$guid", duration)
                    editor.putLong("position:$guid", duration)
                }
            }
            ?.apply()
        _progress.value = _progress.value + (guid to EpisodeProgress(position, duration, true))
    }

    fun getSavedPosition(guid: String): Long = _progress.value[guid]?.positionMs ?: 0L

    fun getProgress(guid: String): EpisodeProgress = _progress.value[guid] ?: EpisodeProgress()

    /** Drop stored progress for episodes no longer on the watch. */
    fun forget(guid: String) {
        prefs?.edit()
            ?.remove("position:$guid")
            ?.remove("duration:$guid")
            ?.remove("completed:$guid")
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
