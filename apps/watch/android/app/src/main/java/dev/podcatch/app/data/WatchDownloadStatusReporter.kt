package dev.podcatch.app.data

import android.content.Context
import android.util.Log
import com.google.android.gms.wearable.Wearable
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

        val array = JSONArray()
        for (ep in episodes) {
            val status = when {
                ep.localPath != null -> "complete"
                ep.error -> "error"
                // Non-zero covers EpisodeDownloadWorker.INDETERMINATE (-1), which means
                // "downloading, total size unknown".
                ep.downloadProgress != 0 -> "downloading"
                else -> "pending"
            }
            val progress = when {
                ep.localPath != null -> 100
                ep.error -> 0
                // The phone renders a percentage only when this is > 0, so an
                // indeterminate download shows as "Downloading…" with no number.
                else -> ep.downloadProgress.coerceAtLeast(0)
            }
            array.put(JSONObject().apply {
                put("guid", ep.guid)
                put("status", status)
                put("progress", progress)
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
