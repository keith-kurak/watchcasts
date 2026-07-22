package dev.podcatch.app.data

import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.work.CoroutineWorker
import androidx.work.ForegroundInfo
import androidx.work.WorkerParameters
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File
import java.net.URL

/**
 * Downloads undownloaded episodes one at a time, sequentially.
 * Enqueued as unique work ("episode-downloads") with KEEP policy so only
 * one instance runs at a time. Loops until all episodes are downloaded.
 */
class EpisodeDownloadWorker(
    context: Context,
    params: WorkerParameters,
) : CoroutineWorker(context, params) {

    override suspend fun doWork(): Result = withContext(Dispatchers.IO) {
        val dir = File(applicationContext.filesDir, "episodes")
        dir.mkdirs()

        // Initialize episodesDir so disk checks work
        SyncedWatchEpisodes.episodesDir = dir

        while (true) {
            val episode = SyncedWatchEpisodes.episodes.value
                .firstOrNull { it.localPath == null && !it.error && it.audioUrl.isNotBlank() }
                ?: break // All done

            Log.d(TAG, "Downloading episode ${episode.guid}")
            SyncedWatchEpisodes.updateProgress(episode.guid, 1)
            WatchDownloadStatusReporter.reportStatus(applicationContext)
            try {
                val outFile = File(dir, "${episode.guid}.mp3")

                val connection = URL(episode.audioUrl).openConnection()
                val totalBytes = connection.contentLength
                val input = connection.getInputStream()
                val output = outFile.outputStream()

                input.use { src ->
                    output.use { dst ->
                        val buffer = ByteArray(8192)
                        var bytesRead: Long = 0
                        var lastReportedProgress = -1
                        var lastReportedToPhone = -1

                        while (true) {
                            val read = src.read(buffer)
                            if (read == -1) break
                            dst.write(buffer, 0, read)
                            bytesRead += read

                            if (totalBytes > 0) {
                                val progress = ((bytesRead * 100) / totalBytes).toInt().coerceIn(0, 99)
                                if (progress != lastReportedProgress) {
                                    lastReportedProgress = progress
                                    SyncedWatchEpisodes.updateProgress(episode.guid, progress)
                                    // Throttle phone reports to every 5%
                                    if (progress / 5 != lastReportedToPhone / 5) {
                                        lastReportedToPhone = progress
                                        WatchDownloadStatusReporter.reportStatus(applicationContext)
                                    }
                                }
                            }
                        }
                    }
                }

                SyncedWatchEpisodes.markDownloaded(episode.guid, outFile.absolutePath)
                WatchDownloadStatusReporter.reportStatus(applicationContext)
                Log.d(TAG, "Downloaded episode ${episode.guid} to ${outFile.absolutePath}")
            } catch (e: Exception) {
                Log.e(TAG, "Failed to download episode ${episode.guid}", e)
                SyncedWatchEpisodes.markError(episode.guid)
                WatchDownloadStatusReporter.reportStatus(applicationContext)
                // Retry the whole worker (will pick up where it left off)
                return@withContext Result.retry()
            }
        }

        Log.d(TAG, "All episodes downloaded")
        WatchDownloadStatusReporter.reportStatus(applicationContext)
        Result.success()
    }

    override suspend fun getForegroundInfo(): ForegroundInfo {
        val channelId = "episode_downloads"
        val manager = applicationContext.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        if (manager.getNotificationChannel(channelId) == null) {
            manager.createNotificationChannel(
                NotificationChannel(channelId, "Episode Downloads", NotificationManager.IMPORTANCE_LOW)
            )
        }
        val notification = NotificationCompat.Builder(applicationContext, channelId)
            .setSmallIcon(android.R.drawable.stat_sys_download)
            .setContentTitle("Downloading episodes")
            .setSilent(true)
            .build()
        return ForegroundInfo(NOTIFICATION_ID, notification)
    }

    companion object {
        private const val TAG = "EpisodeDownload"
        private const val NOTIFICATION_ID = 1001
        const val UNIQUE_WORK_NAME = "episode-downloads"
    }
}
