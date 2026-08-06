package dev.podcatch.app.data

import android.content.Context
import android.util.Log
import com.google.android.gms.wearable.Wearable
import java.io.File
import org.json.JSONArray
import org.json.JSONObject

/**
 * Reports watch episode download statuses back to the phone via MessageClient.
 * Reads the current state from [SyncedWatchEpisodes] and sends a JSON message
 * to all connected nodes on [DataLayerContract.PATH_WATCH_DOWNLOAD_STATUS].
 */
object WatchDownloadStatusReporter {
    private const val TAG = "WatchDLStatus"

    fun reportStatus(context: Context) {
        val episodes = SyncedWatchEpisodes.episodes.value
        // The phone replaces its whole status map with whatever we send, so an empty
        // report wipes its UI. An empty list here means either "nothing queued" — in
        // which case the phone already shows nothing — or "state not loaded yet",
        // which must never be broadcast as fact.
        if (episodes.isEmpty()) {
            Log.d(TAG, "No episodes to report; skipping status broadcast")
            return
        }

        // Computed once: it hits ConnectivityManager and cannot change mid-report.
        SyncedSettings.load(context)
        // Two different ways to be stuck without usable network, both of which the user
        // fixes the same way — get on Wi-Fi:
        //   1. The Wi-Fi-only setting is on and the active network is metered.
        //   2. The download worker asked for a high-bandwidth network and got none. The
        //      Bluetooth proxy reports NOT_METERED, so case 1 does *not* catch this.
        val waitingForWifi = SyncedSettings.isWaitingForWifi(context) ||
            HighBandwidthNetwork.lastAcquireFailed

        val array = JSONArray()
        for (ep in episodes) {
            val status = when {
                ep.localPath != null -> "complete"
                ep.error -> "error"
                // Non-zero covers EpisodeDownloadWorker.INDETERMINATE (-1), which means
                // "downloading, total size unknown".
                ep.downloadProgress != 0 -> "downloading"
                // Say *why* nothing is happening rather than a bare "pending".
                waitingForWifi -> "waiting-wifi"
                else -> "pending"
            }
            val progress = when {
                ep.localPath != null -> 100
                ep.error -> 0
                // The phone renders a percentage only when this is > 0, so an
                // indeterminate download shows as "Downloading…" with no number.
                else -> ep.downloadProgress.coerceAtLeast(0)
            }
            // Measured size of what is actually on this watch. Only a finished download
            // has one — a queued episode has no file yet, so the phone falls back to the
            // size the feed declared. 0 means "unknown", never "an empty episode".
            val sizeBytes = ep.localPath
                ?.let { path -> runCatching { File(path).length() }.getOrDefault(0L) }
                ?.takeIf { it > 0L }
                ?: 0L

            array.put(JSONObject().apply {
                put("guid", ep.guid)
                put("status", status)
                put("progress", progress)
                put("sizeBytes", sizeBytes)
            })
        }

        val payload = array.toString().toByteArray()
        val nodeClient = Wearable.getNodeClient(context)
        val messageClient = Wearable.getMessageClient(context)

        nodeClient.connectedNodes
            .addOnSuccessListener { nodes ->
                for (node in nodes) {
                    messageClient.sendMessage(
                        node.id,
                        DataLayerContract.PATH_WATCH_DOWNLOAD_STATUS,
                        payload,
                    ).addOnSuccessListener {
                        Log.d(TAG, "Sent ${episodes.size} episode statuses to ${node.displayName}")
                    }.addOnFailureListener { e ->
                        Log.e(TAG, "Failed to send statuses to ${node.displayName}", e)
                    }
                }
            }
            .addOnFailureListener { e ->
                Log.e(TAG, "Failed to get connected nodes", e)
            }
    }
}
