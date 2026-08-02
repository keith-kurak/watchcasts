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
                    // Load first: update() reconciles against existing state, and in a
                    // fresh process that state only exists on disk.
                    SyncedWatchEpisodes.load(applicationContext)
                    SyncedWatchEpisodes.update(json)
                    WatchDownloadStatusReporter.reportStatus(applicationContext)
                    // Automatic and frequent — every watch-list change on the phone
                    // lands here. Not worth expedited quota.
                    enqueueDownloads(expedited = false)
                }
            }
        }
    }

    override fun onMessageReceived(messageEvent: MessageEvent) {
        when (messageEvent.path) {
            DataLayerContract.PATH_REQUEST_SYNC -> {
                Log.d(TAG, "Received force-download request from phone")
                SyncedWatchEpisodes.load(applicationContext)
                WatchDownloadStatusReporter.reportStatus(applicationContext)
                // Someone pressed sync on the phone and is watching for a result.
                enqueueDownloads(expedited = true)
            }
            DataLayerContract.PATH_REQUEST_DOWNLOAD_STATUS -> {
                Log.d(TAG, "Received download status request from phone")
                // Without this load, a fresh process reports an empty list and the
                // phone replaces its entire view of watch progress with nothing.
                SyncedWatchEpisodes.load(applicationContext)
                WatchDownloadStatusReporter.reportStatus(applicationContext)
            }
        }
    }

    /**
     * @param expedited ask the system to start the work now. Expedited quota is finite
     * and per-app, so it is reserved for triggers where a person is waiting. Spending it
     * on every automatic list sync is what leaves none for a deliberate request.
     */
    private fun enqueueDownloads(expedited: Boolean) {
        val hasUndownloaded = SyncedWatchEpisodes.episodes.value
            .any { it.localPath == null && it.audioUrl.isNotBlank() }
        if (!hasUndownloaded) return

        val constraints = Constraints.Builder()
            .setRequiredNetworkType(NetworkType.CONNECTED)
            .build()

        val request = OneTimeWorkRequestBuilder<EpisodeDownloadWorker>()
            .setConstraints(constraints)
            .apply {
                if (expedited) {
                    setExpedited(androidx.work.OutOfQuotaPolicy.RUN_AS_NON_EXPEDITED_WORK_REQUEST)
                }
            }
            .build()

        WorkManager.getInstance(applicationContext).enqueueUniqueWork(
            EpisodeDownloadWorker.UNIQUE_WORK_NAME,
            ExistingWorkPolicy.KEEP,
            request,
        )
        Log.d(TAG, "Enqueued episode download worker (expedited=$expedited)")
    }

    companion object {
        private const val TAG = "PodcatchDataLayer"
    }
}
