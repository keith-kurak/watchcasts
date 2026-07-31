package dev.podcatch.app.playback

import android.content.Context
import android.content.SharedPreferences

/**
 * Singleton that tracks the currently playing episode guid and persists
 * playback positions across episode switches and app restarts.
 */
object PlaybackState {
    @Volatile
    var currentGuid: String? = null
        private set

    private var prefs: SharedPreferences? = null

    fun init(context: Context) {
        if (prefs == null) {
            prefs = context.getSharedPreferences("playback", Context.MODE_PRIVATE)
        }
    }

    fun setCurrentEpisode(guid: String) {
        currentGuid = guid
    }

    fun savePosition(guid: String, positionMs: Long) {
        if (positionMs > 0L) {
            prefs?.edit()?.putLong("position:$guid", positionMs)?.apply()
        }
    }

    fun getSavedPosition(guid: String): Long {
        return prefs?.getLong("position:$guid", 0L) ?: 0L
    }

    fun saveSpeed(speed: Float) {
        prefs?.edit()?.putFloat("playbackSpeed", speed)?.apply()
    }

    fun getSavedSpeed(): Float {
        return prefs?.getFloat("playbackSpeed", 1.0f) ?: 1.0f
    }
}
