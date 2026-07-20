package expo.modules.weardatalayer

import android.util.Log
import com.google.android.gms.wearable.Node
import com.google.android.gms.wearable.PutDataMapRequest
import com.google.android.gms.wearable.Wearable
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.Promise

class WearDataLayerModule : Module() {
    override fun definition() = ModuleDefinition {
        Name("WearDataLayerModule")

        AsyncFunction("syncSubscriptions") { json: String, promise: Promise ->
            val context = appContext.reactContext
                ?: return@AsyncFunction promise.reject("ERR", "No context", null)
            val dataClient = Wearable.getDataClient(context)
            val request = PutDataMapRequest.create(PATH_SUBSCRIPTIONS).apply {
                dataMap.putString(KEY_ITEMS, json)
                dataMap.putLong(KEY_UPDATED_AT, System.currentTimeMillis())
            }.asPutDataRequest().setUrgent()
            dataClient.putDataItem(request)
                .addOnSuccessListener {
                    Log.d(TAG, "Subscriptions synced to Data Layer")
                    promise.resolve(null)
                }
                .addOnFailureListener { e ->
                    promise.reject("ERR", e.message ?: "putDataItem failed", e)
                }
        }

        AsyncFunction("syncWatchEpisodes") { json: String, promise: Promise ->
            val context = appContext.reactContext
                ?: return@AsyncFunction promise.reject("ERR", "No context", null)
            val dataClient = Wearable.getDataClient(context)
            val request = PutDataMapRequest.create(PATH_WATCH_EPISODES).apply {
                dataMap.putString(KEY_ITEMS, json)
                dataMap.putLong(KEY_UPDATED_AT, System.currentTimeMillis())
            }.asPutDataRequest().setUrgent()
            dataClient.putDataItem(request)
                .addOnSuccessListener {
                    Log.d(TAG, "Watch episodes synced to Data Layer")
                    promise.resolve(null)
                }
                .addOnFailureListener { e ->
                    promise.reject("ERR", e.message ?: "putDataItem failed", e)
                }
        }

        AsyncFunction("sendForceDownload") { promise: Promise ->
            val context = appContext.reactContext
                ?: return@AsyncFunction promise.reject("ERR", "No context", null)
            val nodeClient = Wearable.getNodeClient(context)
            val messageClient = Wearable.getMessageClient(context)
            nodeClient.connectedNodes
                .addOnSuccessListener { nodes: MutableList<Node> ->
                    if (nodes.isEmpty()) {
                        promise.resolve(null)
                        return@addOnSuccessListener
                    }
                    var pending = nodes.size
                    for (node in nodes) {
                        messageClient.sendMessage(node.id, PATH_REQUEST_SYNC, ByteArray(0))
                            .addOnSuccessListener {
                                Log.d(TAG, "Sent force-download message to ${node.displayName}")
                                if (--pending == 0) promise.resolve(null)
                            }
                            .addOnFailureListener { e ->
                                Log.e(TAG, "Failed to send message to ${node.displayName}", e)
                                if (--pending == 0) promise.resolve(null)
                            }
                    }
                }
                .addOnFailureListener { e ->
                    promise.reject("ERR", e.message ?: "getConnectedNodes failed", e)
                }
        }

        AsyncFunction("getConnectedNodes") { promise: Promise ->
            val context = appContext.reactContext
                ?: return@AsyncFunction promise.reject("ERR", "No context", null)
            val nodeClient = Wearable.getNodeClient(context)
            nodeClient.connectedNodes
                .addOnSuccessListener { nodes: MutableList<Node> ->
                    val result = nodes.map { node ->
                        mapOf("id" to node.id, "displayName" to node.displayName)
                    }
                    promise.resolve(result)
                }
                .addOnFailureListener { e ->
                    promise.reject("ERR", e.message ?: "getConnectedNodes failed", e)
                }
        }
    }

    companion object {
        private const val TAG = "WearDataLayer"
        private const val PATH_SUBSCRIPTIONS = "/podcatch/subscriptions"
        private const val PATH_WATCH_EPISODES = "/podcatch/watch-episodes"
        private const val PATH_REQUEST_SYNC = "/podcatch/request-sync"
        private const val KEY_ITEMS = "items"
        private const val KEY_UPDATED_AT = "updatedAt"
    }
}
