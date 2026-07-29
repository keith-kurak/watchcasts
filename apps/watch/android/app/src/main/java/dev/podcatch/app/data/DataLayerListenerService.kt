package dev.podcatch.app.data

import android.util.Log
import androidx.work.Constraints
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import com.google.android.gms.wearable.DataEvent
import com.google.android.gms.wearable.DataEventBuffer
import com.google.android.gms.wearable.DataMapItem
import com.google.android.gms.wearable.MessageEvent
import com.google.android.gms.wearable.WearableListenerService
import java.io.File

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
                    SyncedWatchEpisodes.episodesDir = File(applicationContext.filesDir, "episodes")
                    SyncedWatchEpisodes.update(json)
                    WatchDownloadStatusReporter.reportStatus(applicationContext)
                    enqueueDownloads()
                }
            }
        }
    }

    override fun onMessageReceived(messageEvent: MessageEvent) {
        when (messageEvent.path) {
            DataLayerContract.PATH_REQUEST_SYNC -> {
                Log.d(TAG, "Received force-download request from phone")
                SyncedWatchEpisodes.episodesDir = File(applicationContext.filesDir, "episodes")
                WatchDownloadStatusReporter.reportStatus(applicationContext)
                enqueueDownloads()
            }
            DataLayerContract.PATH_REQUEST_DOWNLOAD_STATUS -> {
                Log.d(TAG, "Received download status request from phone")
                SyncedWatchEpisodes.episodesDir = File(applicationContext.filesDir, "episodes")
                WatchDownloadStatusReporter.reportStatus(applicationContext)
            }
        }
    }

    private fun enqueueDownloads() {
        val hasUndownloaded = SyncedWatchEpisodes.episodes.value
            .any { it.localPath == null && it.audioUrl.isNotBlank() }
        if (!hasUndownloaded) return

        val constraints = Constraints.Builder()
            .setRequiredNetworkType(NetworkType.CONNECTED)
            .build()

        val request = OneTimeWorkRequestBuilder<EpisodeDownloadWorker>()
            .setConstraints(constraints)
            .setExpedited(androidx.work.OutOfQuotaPolicy.RUN_AS_NON_EXPEDITED_WORK_REQUEST)
            .build()

        WorkManager.getInstance(applicationContext).enqueueUniqueWork(
            EpisodeDownloadWorker.UNIQUE_WORK_NAME,
            ExistingWorkPolicy.KEEP,
            request,
        )
        Log.d(TAG, "Enqueued episode download worker")
    }

    companion object {
        private const val TAG = "PodcatchDataLayer"
    }
}
