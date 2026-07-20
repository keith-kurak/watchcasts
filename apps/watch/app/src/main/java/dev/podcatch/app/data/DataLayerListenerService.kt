package dev.podcatch.app.data

import android.util.Log
import com.google.android.gms.wearable.DataEvent
import com.google.android.gms.wearable.DataEventBuffer
import com.google.android.gms.wearable.DataMapItem
import com.google.android.gms.wearable.WearableListenerService

/**
 * Entry point for everything the phone app pushes over the Data Layer.
 *
 * When the phone updates the subscription DataItem, onDataChanged fires here
 * (even if the watch app isn't in the foreground). This is where you'd persist
 * the synced subscriptions to Room and, separately, enqueue a WorkManager job to
 * download new episodes while the watch is on Wi-Fi + charging.
 */
class DataLayerListenerService : WearableListenerService() {

    override fun onDataChanged(events: DataEventBuffer) {
        for (event in events) {
            if (event.type != DataEvent.TYPE_CHANGED) continue
            val item = event.dataItem
            val dataMap = DataMapItem.fromDataItem(item).dataMap
            val json = dataMap.getString(DataLayerContract.KEY_ITEMS)
            val updatedAt = dataMap.getLong(DataLayerContract.KEY_UPDATED_AT)
            when (item.uri.path) {
                DataLayerContract.PATH_SUBSCRIPTIONS -> {
                    Log.d(TAG, "Subscriptions synced (updatedAt=$updatedAt)")
                    SyncedSubscriptions.update(json)
                }
                DataLayerContract.PATH_WATCH_EPISODES -> {
                    Log.d(TAG, "Watch episodes synced (updatedAt=$updatedAt)")
                    SyncedWatchEpisodes.update(json)
                }
            }
        }
    }

    companion object {
        private const val TAG = "PodcatchDataLayer"
    }
}
