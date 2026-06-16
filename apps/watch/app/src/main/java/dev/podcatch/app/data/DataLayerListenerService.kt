package dev.podcatch.app.data

import android.util.Log
import com.google.android.gms.wearable.DataEvent
import com.google.android.gms.wearable.DataEventBuffer
import com.google.android.gms.wearable.DataMapItem
import com.google.android.gms.wearable.MessageEvent
import com.google.android.gms.wearable.WearableListenerService

/**
 * Entry point for everything the phone app pushes over the Data Layer.
 *
 * Handles both MessageClient messages (real-time push) and DataClient changes
 * (persistent replication). The phone uses MessageClient for immediate delivery.
 */
class DataLayerListenerService : WearableListenerService() {

    override fun onMessageReceived(messageEvent: MessageEvent) {
        Log.d(TAG, "Message received: ${messageEvent.path}")
        if (messageEvent.path == DataLayerContract.PATH_SUBSCRIPTIONS) {
            val json = String(messageEvent.data, Charsets.UTF_8)
            Log.d(TAG, "Subscriptions received via message: $json")
            SyncedSubscriptions.update(json)
        }
    }

    override fun onDataChanged(events: DataEventBuffer) {
        for (event in events) {
            if (event.type != DataEvent.TYPE_CHANGED) continue
            val item = event.dataItem
            if (item.uri.path == DataLayerContract.PATH_SUBSCRIPTIONS) {
                val dataMap = DataMapItem.fromDataItem(item).dataMap
                val json = dataMap.getString(DataLayerContract.KEY_ITEMS)
                val updatedAt = dataMap.getLong(DataLayerContract.KEY_UPDATED_AT)
                Log.d(TAG, "Subscriptions synced via DataClient (updatedAt=$updatedAt)")
                SyncedSubscriptions.update(json)
            }
        }
    }

    companion object {
        private const val TAG = "PodcatchDataLayer"
    }
}
