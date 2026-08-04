package dev.podcatch.app.data

import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.NetworkRequest
import android.util.Log
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.coroutines.resume
import kotlinx.coroutines.suspendCancellableCoroutine

/**
 * Gets a real Wi-Fi (or cellular) network for episode downloads.
 *
 * Wear OS keeps Wi-Fi off while the watch holds a Bluetooth link to the phone, and proxies
 * all internet traffic over that link. The proxy runs at a few hundred kbit/s, which turns a
 * 100 MB episode into an hours-long download.
 *
 * Worse, the proxy reports `NOT_METERED`. WorkManager's `UNMETERED` constraint is therefore
 * satisfied, so [EpisodeDownloadWorker] used to start happily and then crawl. Every fix in
 * Phase 1-3 addressed a stall or a restart; none of them made bytes arrive faster, because
 * the transport was the problem.
 *
 * The only way out is to name the transport. [requestNetwork] with `TRANSPORT_WIFI` brings
 * Wi-Fi up when a known network is in range, and the returned [Network] must be used to open
 * the connection — the process default stays the Bluetooth proxy.
 *
 * The lease **must** be released. An unreleased request keeps Wi-Fi awake and drains a
 * battery measured in a couple of days.
 */
object HighBandwidthNetwork {
    private const val TAG = "HighBandwidthNet"

    /**
     * Bringing Wi-Fi up from cold on a watch takes real time: radio on, associate, DHCP,
     * captive-portal validation. A short timeout reports "no Wi-Fi" while it is still
     * connecting.
     */
    private const val ACQUIRE_TIMEOUT_MS = 45_000

    /**
     * True when the last [acquire] call could not get a high-bandwidth network.
     *
     * Read by [WatchDownloadStatusReporter] so the phone can say *why* nothing is
     * downloading. In-memory and process-scoped on purpose: it describes what this process
     * just tried, not a durable fact about the watch. A fresh process reports `false`,
     * which reads as "pending" — honest, since it has not tried yet.
     */
    @Volatile
    var lastAcquireFailed = false
        private set

    /**
     * A held network request. Keeping it registered is what keeps Wi-Fi up, so it lives as
     * long as the download run and not one episode.
     */
    class Lease internal constructor(
        private val manager: ConnectivityManager,
        private val callback: ConnectivityManager.NetworkCallback,
        val network: Network,
    ) {
        private val released = AtomicBoolean(false)

        /** Idempotent, so a `finally` and an error path can both call it. */
        fun release() {
            if (!released.compareAndSet(false, true)) return
            runCatching { manager.unregisterNetworkCallback(callback) }
                .onFailure { Log.w(TAG, "Failed to unregister network callback", it) }
            Log.d(TAG, "Released high-bandwidth network")
        }
    }

    /**
     * Ask for a high-bandwidth network, suspending until one is up.
     *
     * @param allowMetered accept cellular as well as Wi-Fi. Follows the phone's
     * Wi-Fi-only setting — see [SyncedSettings].
     * @return a held [Lease], or `null` when none became available within
     * [ACQUIRE_TIMEOUT_MS]. A caller must not fall back to the default network without
     * checking [isDefaultHighBandwidth] first, or it is back to crawling over Bluetooth.
     */
    suspend fun acquire(context: Context, allowMetered: Boolean): Lease? {
        val manager = context.applicationContext
            .getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager
            ?: return null

        val request = NetworkRequest.Builder()
            .addCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
            // Naming the transports is what excludes the Bluetooth companion proxy. There
            // is no capability for "fast", so the transport list is the whole mechanism.
            .addTransportType(NetworkCapabilities.TRANSPORT_WIFI)
            .apply {
                if (allowMetered) addTransportType(NetworkCapabilities.TRANSPORT_CELLULAR)
            }
            .build()

        return suspendCancellableCoroutine { continuation ->
            // onAvailable can fire more than once as networks come and go, and the timeout
            // path can race it. Resume exactly once.
            val settled = AtomicBoolean(false)

            val callback = object : ConnectivityManager.NetworkCallback() {
                override fun onAvailable(network: Network) {
                    if (!settled.compareAndSet(false, true)) return
                    Log.d(TAG, "Acquired high-bandwidth network")
                    lastAcquireFailed = false
                    // The callback stays registered: unregistering here would drop the
                    // network we just asked for. The Lease owns it now.
                    continuation.resume(Lease(manager, this, network))
                }

                override fun onUnavailable() {
                    if (!settled.compareAndSet(false, true)) return
                    Log.w(TAG, "No high-bandwidth network became available")
                    lastAcquireFailed = true
                    runCatching { manager.unregisterNetworkCallback(this) }
                    continuation.resume(null)
                }
            }

            try {
                manager.requestNetwork(request, callback, ACQUIRE_TIMEOUT_MS)
            } catch (e: SecurityException) {
                // CHANGE_NETWORK_STATE is missing from the manifest.
                if (settled.compareAndSet(false, true)) {
                    Log.e(TAG, "requestNetwork denied; CHANGE_NETWORK_STATE not granted", e)
                    lastAcquireFailed = true
                    continuation.resume(null)
                }
                return@suspendCancellableCoroutine
            }

            continuation.invokeOnCancellation {
                // Only unregister if no Lease was handed out. Once one exists it owns the
                // callback, and the worker's `finally` releases it.
                if (settled.compareAndSet(false, true)) {
                    runCatching { manager.unregisterNetworkCallback(callback) }
                }
            }
        }
    }

    /**
     * True when the process default network is already a fast one.
     *
     * Two cases matter. A watch with no phone in range routes straight over its own Wi-Fi,
     * and an emulator's default network is Wi-Fi. In both, [acquire] may return `null`
     * simply because there is nothing to bring up — downloading on the default network is
     * correct there, and is *not* the Bluetooth crawl this class exists to prevent.
     */
    fun isDefaultHighBandwidth(context: Context, allowMetered: Boolean): Boolean {
        val manager = context.applicationContext
            .getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager
            ?: return false
        val capabilities = manager.getNetworkCapabilities(manager.activeNetwork) ?: return false
        if (!capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)) return false
        // Explicit: the companion proxy is exactly what must not qualify.
        if (capabilities.hasTransport(NetworkCapabilities.TRANSPORT_BLUETOOTH)) return false
        return capabilities.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) ||
            (allowMetered && capabilities.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR))
    }
}
