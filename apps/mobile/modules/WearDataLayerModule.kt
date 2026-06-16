package dev.podcatch.app.modules

import android.util.Log
import com.google.android.gms.wearable.Node
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
            val messageClient = Wearable.getMessageClient(context)
            val nodeClient = Wearable.getNodeClient(context)
            val payload = json.toByteArray(Charsets.UTF_8)

            nodeClient.connectedNodes
                .addOnSuccessListener { nodes: MutableList<Node> ->
                    if (nodes.isEmpty()) {
                        promise.reject("ERR", "No connected watch nodes", null)
                        return@addOnSuccessListener
                    }
                    var sent = 0
                    var failed = false
                    for (node in nodes) {
                        messageClient.sendMessage(node.id, PATH_SUBSCRIPTIONS, payload)
                            .addOnSuccessListener {
                                sent++
                                Log.d(TAG, "Sent subscriptions to ${node.displayName}")
                                if (sent == nodes.size) promise.resolve(null)
                            }
                            .addOnFailureListener { e ->
                                if (!failed) {
                                    failed = true
                                    promise.reject("ERR", e.message ?: "sendMessage failed", e)
                                }
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
    }
}
