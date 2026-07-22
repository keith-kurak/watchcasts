package dev.podcatch.app.data

import android.content.Context
import android.util.Log
import com.google.android.gms.wearable.PutDataMapRequest
import com.google.android.gms.wearable.Wearable
import org.json.JSONArray
import org.json.JSONObject

/**
 * Reports watch episode download statuses back to the phone via the Wearable Data Layer.
 * Reads the current state from [SyncedWatchEpisodes] and writes a JSON array to the
 * [DataLayerContract.PATH_WATCH_DOWNLOAD_STATUS] DataItem.
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

        val request = PutDataMapRequest.create(DataLayerContract.PATH_WATCH_DOWNLOAD_STATUS).apply {
            dataMap.putString("statuses", array.toString())
            dataMap.putLong("updatedAt", System.currentTimeMillis())
        }.asPutDataRequest().setUrgent()

        Wearable.getDataClient(context).putDataItem(request)
            .addOnSuccessListener { Log.d(TAG, "Reported ${episodes.size} episode statuses") }
            .addOnFailureListener { e -> Log.e(TAG, "Failed to report statuses", e) }
    }
}
