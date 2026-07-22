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
        val array = JSONArray()
        for (ep in episodes) {
            val status = when {
                ep.localPath != null -> "complete"
                ep.error -> "error"
                ep.downloadProgress > 0 -> "downloading"
                else -> "pending"
            }
            val progress = when {
                ep.localPath != null -> 100
                ep.error -> 0
                else -> ep.downloadProgress
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
