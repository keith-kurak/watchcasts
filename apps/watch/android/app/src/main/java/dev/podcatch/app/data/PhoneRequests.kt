package dev.podcatch.app.data

import android.content.Context
import android.util.Log
import com.google.android.gms.wearable.Wearable

/**
 * Messages the watch sends to the phone to ask it to change phone-owned state.
 *
 * The phone owns the watch queue, so the watch cannot edit it directly — it asks, and the
 * phone republishes the list. Fire and forget: if the phone is out of range the request is
 * simply lost, and the next sync restores whatever the phone still believes.
 */
object PhoneRequests {
    private const val TAG = "PhoneRequests"

    /** Ask the phone to drop [guid] from the watch queue. */
    fun removeWatchEpisode(context: Context, guid: String) {
        if (guid.isBlank()) return
        val payload = guid.toByteArray()
        val app = context.applicationContext

        Wearable.getNodeClient(app).connectedNodes
            .addOnSuccessListener { nodes ->
                if (nodes.isEmpty()) {
                    Log.w(TAG, "No connected phone; removal of $guid not sent")
                    return@addOnSuccessListener
                }
                val messageClient = Wearable.getMessageClient(app)
                for (node in nodes) {
                    messageClient.sendMessage(
                        node.id,
                        DataLayerContract.PATH_REMOVE_WATCH_EPISODE,
                        payload,
                    )
                        .addOnSuccessListener {
                            Log.d(TAG, "Asked ${node.displayName} to remove $guid")
                        }
                        .addOnFailureListener { e ->
                            Log.e(TAG, "Failed to ask ${node.displayName} to remove $guid", e)
                        }
                }
            }
            .addOnFailureListener { e ->
                Log.e(TAG, "Failed to get connected nodes", e)
            }
    }
}
