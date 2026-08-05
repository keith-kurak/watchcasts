package dev.podcatch.app.data

import android.content.Context
import android.util.Log
import com.google.android.gms.wearable.Wearable

/**
 * Messages the watch sends to the phone to ask it to change phone-owned state.
 *
 * The phone owns the watch queue, so the watch cannot edit it directly — it asks, and the
 * phone republishes the list.
 *
 * Every send here can be lost, and in two different ways: the phone may be out of Bluetooth
 * range, or it may be in range with its app closed — the handler for these messages lives in
 * the phone's JS app and only runs while that app is open. So delivery is retried rather than
 * assumed. [SyncedWatchEpisodes.pendingRemovals] holds the durable record, and
 * [resendPendingRemovals] drains it.
 */
object PhoneRequests {
    private const val TAG = "PhoneRequests"

    /**
     * Re-ask the phone to drop every removal it has not acknowledged yet.
     *
     * Cheap and idempotent: the set is empty in the normal case, and a duplicate request
     * for an episode the phone already dropped is a no-op on its side. Call it whenever the
     * phone has just proved it is reachable — a list arriving, or the app being opened.
     */
    fun resendPendingRemovals(context: Context) {
        val pending = SyncedWatchEpisodes.pendingRemovals
        if (pending.isEmpty()) return
        Log.d(TAG, "Re-sending ${pending.size} unacknowledged removal(s)")
        for (guid in pending) removeWatchEpisode(context, guid)
    }

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
