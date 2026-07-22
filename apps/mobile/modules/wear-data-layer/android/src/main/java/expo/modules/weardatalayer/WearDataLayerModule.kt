package expo.modules.weardatalayer

import android.util.Log
import com.google.android.gms.wearable.DataClient
import com.google.android.gms.wearable.DataEvent
import com.google.android.gms.wearable.DataEventBuffer
import com.google.android.gms.wearable.DataMapItem
import com.google.android.gms.wearable.Node
import com.google.android.gms.wearable.PutDataMapRequest
import com.google.android.gms.wearable.Wearable
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.Promise

class WearDataLayerModule : Module(), DataClient.OnDataChangedListener {
    private var dataClient: DataClient? = null

    override fun definition() = ModuleDefinition {
        Name("WearDataLayerModule")

        Events("onWatchDownloadStatus")

        OnStartObserving {
            val context = appContext.reactContext ?: return@OnStartObserving
            dataClient = Wearable.getDataClient(context).also {
                it.addListener(this@WearDataLayerModule)
            }
            Log.d(TAG, "DataClient listener registered")
        }

        OnStopObserving {
            dataClient?.removeListener(this@WearDataLayerModule)
            dataClient = null
            Log.d(TAG, "DataClient listener removed")
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

        AsyncFunction("getWatchDownloadStatus") { promise: Promise ->
            val context = appContext.reactContext
                ?: return@AsyncFunction promise.reject("ERR", "No context", null)
            val client = Wearable.getDataClient(context)
            client.getDataItems(android.net.Uri.parse("wear://*$PATH_WATCH_DOWNLOAD_STATUS"))
                .addOnSuccessListener { items ->
                    if (items.count == 0) {
                        promise.resolve(emptyList<Any>())
                        items.release()
                        return@addOnSuccessListener
                    }
                    val dataMap = DataMapItem.fromDataItem(items[0]).dataMap
                    val json = dataMap.getString("statuses") ?: "[]"
                    items.release()
                    promise.resolve(parseStatusJson(json))
                }
                .addOnFailureListener { e ->
                    promise.reject("ERR", e.message ?: "getDataItems failed", e)
                }
        }
    }

    override fun onDataChanged(dataEvents: DataEventBuffer) {
        for (event in dataEvents) {
            if (event.type != DataEvent.TYPE_CHANGED) continue
            val item = event.dataItem
            if (item.uri.path != PATH_WATCH_DOWNLOAD_STATUS) continue

            val dataMap = DataMapItem.fromDataItem(item).dataMap
            val json = dataMap.getString("statuses") ?: "[]"
            val statuses = parseStatusJson(json)
            Log.d(TAG, "Watch download status changed: ${statuses.size} episodes")
            sendEvent("onWatchDownloadStatus", mapOf("statuses" to statuses))
        }
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
        private const val PATH_SUBSCRIPTIONS = "/podcatch/subscriptions"
        private const val PATH_WATCH_EPISODES = "/podcatch/watch-episodes"
        private const val PATH_WATCH_DOWNLOAD_STATUS = "/podcatch/watch-download-status"
        private const val PATH_REQUEST_SYNC = "/podcatch/request-sync"
        private const val KEY_ITEMS = "items"
        private const val KEY_UPDATED_AT = "updatedAt"
    }
}
