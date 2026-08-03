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
    private const val KEY_PLAY_NEXT = "playNextEpisode"

    /** Matches the phone's default. Episodes are large; metered data is not free. */
    private const val DEFAULT_WIFI_ONLY = true

    /** Matches the phone's default. A queue that stops after one episode is not a queue. */
    private const val DEFAULT_PLAY_NEXT = true

    private var prefs: SharedPreferences? = null

    @Volatile
    private var loaded = false

    private val _wifiOnlyDownloads = MutableStateFlow(DEFAULT_WIFI_ONLY)
    val wifiOnlyDownloads: StateFlow<Boolean> = _wifiOnlyDownloads.asStateFlow()

    private val _playNextEpisode = MutableStateFlow(DEFAULT_PLAY_NEXT)

    /**
     * When an episode ends, start the next downloaded episode in [SyncedWatchEpisodes]
     * order. That order is set by hand on the phone.
     */
    val playNextEpisode: StateFlow<Boolean> = _playNextEpisode.asStateFlow()

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
        _playNextEpisode.value =
            prefs?.getBoolean(KEY_PLAY_NEXT, DEFAULT_PLAY_NEXT) ?: DEFAULT_PLAY_NEXT
    }

    /**
     * Apply a settings payload pushed from the phone.
     *
     * Each key is applied independently, so a payload that predates one of them leaves
     * that setting on its stored value rather than resetting it to the default.
     */
    fun update(json: String?) {
        if (json == null) return
        val obj = JSONObject(json)
        if (obj.has(KEY_WIFI_ONLY)) {
            val value = obj.optBoolean(KEY_WIFI_ONLY, DEFAULT_WIFI_ONLY)
            _wifiOnlyDownloads.value = value
            prefs?.edit()?.putBoolean(KEY_WIFI_ONLY, value)?.apply()
        }
        if (obj.has(KEY_PLAY_NEXT)) {
            val value = obj.optBoolean(KEY_PLAY_NEXT, DEFAULT_PLAY_NEXT)
            _playNextEpisode.value = value
            prefs?.edit()?.putBoolean(KEY_PLAY_NEXT, value)?.apply()
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
