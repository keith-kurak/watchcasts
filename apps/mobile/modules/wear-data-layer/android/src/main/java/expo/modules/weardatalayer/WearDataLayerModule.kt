package expo.modules.weardatalayer

import android.util.Log
import com.google.android.gms.wearable.MessageClient
import com.google.android.gms.wearable.MessageEvent
import com.google.android.gms.wearable.Node
import com.google.android.gms.wearable.PutDataMapRequest
import com.google.android.gms.wearable.Wearable
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.Promise

class WearDataLayerModule : Module(), MessageClient.OnMessageReceivedListener {
    private var messageClient: MessageClient? = null

    override fun definition() = ModuleDefinition {
        Name("WearDataLayerModule")

        Events("onWatchDownloadStatus")

        OnStartObserving {
            val context = appContext.reactContext ?: return@OnStartObserving
            messageClient = Wearable.getMessageClient(context).also {
                it.addListener(this@WearDataLayerModule)
            }
            Log.d(TAG, "MessageClient listener registered")
        }

        OnStopObserving {
            messageClient?.removeListener(this@WearDataLayerModule)
            messageClient = null
            Log.d(TAG, "MessageClient listener removed")
        }

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

        AsyncFunction("syncSettings") { json: String, promise: Promise ->
            val context = appContext.reactContext
                ?: return@AsyncFunction promise.reject("ERR", "No context", null)
            val dataClient = Wearable.getDataClient(context)
            val request = PutDataMapRequest.create(PATH_SETTINGS).apply {
                dataMap.putString(KEY_ITEMS, json)
                dataMap.putLong(KEY_UPDATED_AT, System.currentTimeMillis())
            }.asPutDataRequest().setUrgent()
            dataClient.putDataItem(request)
                .addOnSuccessListener {
                    Log.d(TAG, "Settings synced to Data Layer")
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

        AsyncFunction("requestWatchDownloadStatus") { promise: Promise ->
            val context = appContext.reactContext
                ?: return@AsyncFunction promise.reject("ERR", "No context", null)
            val nodeClient = Wearable.getNodeClient(context)
            val msgClient = Wearable.getMessageClient(context)
            nodeClient.connectedNodes
                .addOnSuccessListener { nodes: MutableList<Node> ->
                    if (nodes.isEmpty()) {
                        promise.resolve(null)
                        return@addOnSuccessListener
                    }
                    var pending = nodes.size
                    for (node in nodes) {
                        msgClient.sendMessage(node.id, PATH_REQUEST_DOWNLOAD_STATUS, ByteArray(0))
                            .addOnSuccessListener {
                                Log.d(TAG, "Requested download status from ${node.displayName}")
                                if (--pending == 0) promise.resolve(null)
                            }
                            .addOnFailureListener { e ->
                                Log.e(TAG, "Failed to request status from ${node.displayName}", e)
                                if (--pending == 0) promise.resolve(null)
                            }
                    }
                }
                .addOnFailureListener { e ->
                    promise.reject("ERR", e.message ?: "getConnectedNodes failed", e)
                }
        }
    }

    override fun onMessageReceived(messageEvent: MessageEvent) {
        if (messageEvent.path != PATH_WATCH_DOWNLOAD_STATUS) return

        val json = String(messageEvent.data)
        val statuses = parseStatusJson(json)
        Log.d(TAG, "Watch download status received: ${statuses.size} episodes")
        sendEvent("onWatchDownloadStatus", mapOf("statuses" to statuses))
    }

    private fun parseStatusJson(json: String): List<Map<String, Any>> {
        val array = org.json.JSONArray(json)
        val result = mutableListOf<Map<String, Any>>()
        for (i in 0 until array.length()) {
            val obj = array.optJSONObject(i) ?: continue
            result.add(mapOf(
                "guid" to obj.optString("guid", ""),
                "status" to obj.optString("status", "pending"),
                "progress" to obj.optInt("progress", 0),
            ))
        }
        return result
    }

    companion object {
        private const val TAG = "WearDataLayer"
        // Mirrored by hand from packages/shared/src/datalayer.ts and
        // apps/watch/.../DataLayerContract.kt. Change all three together.
        private const val PATH_SUBSCRIPTIONS = "/podcatch/subscriptions"
        private const val PATH_WATCH_EPISODES = "/podcatch/watch-episodes"
        private const val PATH_SETTINGS = "/podcatch/settings"
        private const val PATH_REQUEST_SYNC = "/podcatch/request-sync"
        private const val PATH_REQUEST_DOWNLOAD_STATUS = "/podcatch/request-download-status"
        private const val PATH_WATCH_DOWNLOAD_STATUS = "/podcatch/watch-download-status"
        private const val KEY_ITEMS = "items"
        private const val KEY_UPDATED_AT = "updatedAt"
    }
}
