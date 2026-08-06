package dev.podcatch.app.data

import android.content.Context
import android.content.SharedPreferences
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import org.json.JSONObject

/**
 * App settings the phone owns and the watch honours.
 *
 * Pushed phone -> watch over [DataLayerContract.PATH_SETTINGS] and persisted here, so
 * a worker running in a fresh process still knows the user's choice. Same reasoning as
 * [SyncedWatchEpisodes] — see docs/watch-sync.md.
 */
object SyncedSettings {
    private const val PREFS_NAME = "watch-settings"
    private const val KEY_WIFI_ONLY = "wifiOnlyDownloads"
    private const val KEY_SYNC_PLAYBACK = "syncPlaybackProgress"

    /** Matches the phone's default. Episodes are large; metered data is not free. */
    private const val DEFAULT_WIFI_ONLY = true

    /**
     * Matches the phone's default. Continuing an episode on the other device is the
     * reason the two apps are paired, so it is on unless someone turns it off.
     */
    private const val DEFAULT_SYNC_PLAYBACK = true

    private var prefs: SharedPreferences? = null

    @Volatile
    private var loaded = false

    private val _wifiOnlyDownloads = MutableStateFlow(DEFAULT_WIFI_ONLY)
    val wifiOnlyDownloads: StateFlow<Boolean> = _wifiOnlyDownloads.asStateFlow()

    private val _syncPlaybackProgress = MutableStateFlow(DEFAULT_SYNC_PLAYBACK)

    /** Keep listen positions the same on this watch and the phone. */
    val syncPlaybackProgress: StateFlow<Boolean> = _syncPlaybackProgress.asStateFlow()

    @Synchronized
    fun load(context: Context) {
        if (prefs == null) {
            prefs = context.applicationContext.getSharedPreferences(
                PREFS_NAME,
                Context.MODE_PRIVATE,
            )
        }
        if (loaded) return
        loaded = true
        _wifiOnlyDownloads.value =
            prefs?.getBoolean(KEY_WIFI_ONLY, DEFAULT_WIFI_ONLY) ?: DEFAULT_WIFI_ONLY
        _syncPlaybackProgress.value =
            prefs?.getBoolean(KEY_SYNC_PLAYBACK, DEFAULT_SYNC_PLAYBACK) ?: DEFAULT_SYNC_PLAYBACK
    }

    /**
     * Apply a settings payload pushed from the phone.
     *
     * Each field is applied only when the payload actually carries it. A phone build
     * predating a field simply leaves this watch on its own stored value, which is what
     * lets the two sides be deployed independently.
     */
    fun update(json: String?) {
        if (json == null) return
        val obj = JSONObject(json)
        if (obj.has(KEY_WIFI_ONLY)) {
            val value = obj.optBoolean(KEY_WIFI_ONLY, DEFAULT_WIFI_ONLY)
            _wifiOnlyDownloads.value = value
            prefs?.edit()?.putBoolean(KEY_WIFI_ONLY, value)?.apply()
        }
        if (obj.has(KEY_SYNC_PLAYBACK)) {
            val value = obj.optBoolean(KEY_SYNC_PLAYBACK, DEFAULT_SYNC_PLAYBACK)
            _syncPlaybackProgress.value = value
            prefs?.edit()?.putBoolean(KEY_SYNC_PLAYBACK, value)?.apply()
        }
    }

    /**
     * True when downloads are being held back by the Wi-Fi-only setting.
     *
     * The worker's `UNMETERED` constraint is what actually enforces this; this exists so
     * the watch can say *why* nothing is downloading instead of showing a bare "waiting".
     */
    fun isWaitingForWifi(context: Context): Boolean {
        if (!_wifiOnlyDownloads.value) return false
        return !isUnmetered(context)
    }

    private fun isUnmetered(context: Context): Boolean {
        val manager = context.applicationContext
            .getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager
            ?: return false
        val capabilities = manager.getNetworkCapabilities(manager.activeNetwork)
            ?: return false
        // NOT_METERED is the same signal WorkManager's UNMETERED constraint uses, so the
        // status we report and the constraint that gates the work cannot disagree.
        return capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_NOT_METERED)
    }
}
