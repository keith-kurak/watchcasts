package dev.podcatch.app.data

import android.util.Log
import androidx.work.ExistingWorkPolicy
import androidx.work.WorkManager
import com.google.android.gms.wearable.DataEvent
import com.google.android.gms.wearable.DataEventBuffer
import com.google.android.gms.wearable.DataMapItem
import com.google.android.gms.wearable.MessageEvent
import com.google.android.gms.wearable.WearableListenerService
import dev.podcatch.app.playback.PlaybackState

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
                DataLayerContract.PATH_SETTINGS -> {
                    Log.d(TAG, "Settings synced (updatedAt=$updatedAt)")
                    SyncedSettings.load(applicationContext)
                    SyncedSettings.update(json)
                    SyncedWatchEpisodes.load(applicationContext)
                    WatchDownloadStatusReporter.reportStatus(applicationContext)
                    enqueueDownloads(expedited = false, replaceExisting = true)
                    // Progress sync may have just been turned on. Publishing here means
                    // the phone gets this watch's positions without waiting for the next
                    // time something is played.
                    if (SyncedSettings.syncPlaybackProgress.value) {
                        PlaybackState.init(applicationContext)
                        PlaybackProgressSync.publish(applicationContext, force = true)
                    }
                }
                DataLayerContract.PATH_PLAYBACK_PROGRESS_PHONE -> {
                    Log.d(TAG, "Playback progress synced (updatedAt=$updatedAt)")
                    // Both are read in a possibly fresh process: the setting decides
                    // whether to apply at all, and PlaybackState holds what to merge
                    // against.
                    SyncedSettings.load(applicationContext)
                    PlaybackState.init(applicationContext)
                    PlaybackProgressSync.applyFromPhone(applicationContext, json)
                }
                DataLayerContract.PATH_WATCH_EPISODES -> {
                    Log.d(TAG, "Watch episodes synced (updatedAt=$updatedAt)")
                    // Load first: update() reconciles against existing state, and in a
                    // fresh process that state only exists on disk.
                    SyncedWatchEpisodes.load(applicationContext)
                    // Before update(), so the prune inside it has a loaded queue to work
                    // on rather than silently pruning an empty one.
                    UpNextQueue.load(applicationContext)
                    SyncedWatchEpisodes.update(json)
                    // A list just arrived, so the phone is reachable. Good moment to retry
                    // any removal it has not acknowledged.
                    PhoneRequests.resendPendingRemovals(applicationContext)
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
                // Sync is a deliberate act, so it also re-arms the crash-loop breaker.
                DownloadRunGuard.resetBreaker(applicationContext)
                // Sync is what someone reaches for when a download is stuck, so it clears
                // failures rather than skipping exactly the episodes that need attention.
                val cleared = SyncedWatchEpisodes.clearAllErrors()
                if (cleared) Log.d(TAG, "Cleared download errors ahead of forced sync")
                WatchDownloadStatusReporter.reportStatus(applicationContext)
                // Someone pressed sync on the phone and is watching for a result. REPLACE,
                // not KEEP: a pending retry backoff must not swallow a deliberate request.
                enqueueDownloads(expedited = true, replaceExisting = true)
            }
            DataLayerContract.PATH_RETRY_WATCH_EPISODE -> {
                val guid = String(messageEvent.data)
                if (guid.isBlank()) return
                Log.d(TAG, "Phone asked to retry $guid")
                SyncedWatchEpisodes.load(applicationContext)
                // Retry is as deliberate as sync; without this the freshly cleared
                // episode would hit a tripped breaker and go straight back to "halted".
                DownloadRunGuard.resetBreaker(applicationContext)
                SyncedWatchEpisodes.clearError(guid)
                WatchDownloadStatusReporter.reportStatus(applicationContext)
                enqueueDownloads(expedited = true, replaceExisting = true)
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
     * @param replaceExisting use REPLACE instead of KEEP. The network constraint is
     * baked into the request at enqueue time, so a request queued under the old
     * Wi-Fi-only setting would outlive a change to it. Replacing a running worker is
     * safe — partial downloads resume from their `.tmp`.
     */
    private fun enqueueDownloads(expedited: Boolean, replaceExisting: Boolean = false) {
        val hasUndownloaded = SyncedWatchEpisodes.episodes.value
            .any { it.localPath == null && it.audioUrl.isNotBlank() }
        if (!hasUndownloaded) return

        val policy = if (replaceExisting) ExistingWorkPolicy.REPLACE else ExistingWorkPolicy.KEEP
        WorkManager.getInstance(applicationContext).enqueueUniqueWork(
            EpisodeDownloadWorker.UNIQUE_WORK_NAME,
            policy,
            EpisodeDownloadWorker.buildRequest(applicationContext, expedited),
        )
        Log.d(TAG, "Enqueued episode download worker (expedited=$expedited, policy=$policy)")
    }

    companion object {
        private const val TAG = "PodcatchDataLayer"
    }
}
