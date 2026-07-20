package dev.podcatch.app.data

import android.util.Log
import androidx.work.Constraints
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.workDataOf
import com.google.android.gms.wearable.DataEvent
import com.google.android.gms.wearable.DataEventBuffer
import com.google.android.gms.wearable.DataMapItem
import com.google.android.gms.wearable.WearableListenerService

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
                    enqueueDownloads()
                }
            }
        }
    }

    private fun enqueueDownloads() {
        val constraints = Constraints.Builder()
            .setRequiredNetworkType(NetworkType.CONNECTED)
            .build()

        for (episode in SyncedWatchEpisodes.episodes.value) {
            if (episode.localPath != null) continue
            if (episode.audioUrl.isBlank()) continue

            val request = OneTimeWorkRequestBuilder<EpisodeDownloadWorker>()
                .setInputData(
                    workDataOf(
                        EpisodeDownloadWorker.KEY_GUID to episode.guid,
                        EpisodeDownloadWorker.KEY_AUDIO_URL to episode.audioUrl,
                    )
                )
                .setConstraints(constraints)
                .build()

            WorkManager.getInstance(applicationContext).enqueueUniqueWork(
                "download-${episode.guid}",
                ExistingWorkPolicy.KEEP,
                request,
            )
            Log.d(TAG, "Enqueued download for ${episode.guid}")
        }
    }

    companion object {
        private const val TAG = "PodcatchDataLayer"
    }
}
