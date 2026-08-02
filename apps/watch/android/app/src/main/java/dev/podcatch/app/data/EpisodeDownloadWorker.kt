package dev.podcatch.app.data

import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.content.pm.ServiceInfo
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.work.CoroutineWorker
import androidx.work.ForegroundInfo
import androidx.work.WorkerParameters
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File
import java.io.FileOutputStream
import java.net.HttpURLConnection
import java.net.URL

/**
 * Downloads undownloaded episodes one at a time, sequentially.
 * Enqueued as unique work ("episode-downloads") with KEEP policy so only
 * one instance runs at a time. Loops until all episodes are downloaded.
 *
 * Runs as a long-running worker: [doWork] promotes itself with [setForeground] so it
 * is not subject to the ~10 minute job execution limit. Without that, a slow download
 * is killed mid-file and — with no resume — restarts at byte 0 forever.
 *
 * Partial downloads live in `<guid>.mp3.tmp` and are resumed with a `Range` header.
 * Only a fully downloaded file is renamed to `<guid>.mp3`.
 */
class EpisodeDownloadWorker(
    context: Context,
    params: WorkerParameters,
) : CoroutineWorker(context, params) {

    override suspend fun doWork(): Result = withContext(Dispatchers.IO) {
        // Promote to a foreground service for the life of this worker. Downloads on a
        // watch routinely outlast the background execution limit.
        try {
            setForeground(getForegroundInfo())
        } catch (e: Exception) {
            // Not fatal: the work still runs, just at background priority and under the
            // execution limit. Resume means a truncated attempt is no longer wasted.
            Log.w(TAG, "Could not promote to foreground; continuing in background", e)
        }

        // WorkManager may have started a fresh process to run this worker, in which
        // case the in-memory episode list is empty. Restore it from disk before
        // deciding there is nothing to do.
        SyncedWatchEpisodes.load(applicationContext)

        val dir = SyncedWatchEpisodes.episodesDir ?: File(applicationContext.filesDir, "episodes")
        dir.mkdirs()
        SyncedWatchEpisodes.artworkDir?.mkdirs()

        if (SyncedWatchEpisodes.episodes.value.isEmpty()) {
            return@withContext if (SyncedWatchEpisodes.hasStoredList) {
                Log.d(TAG, "Nothing queued for the watch")
                Result.success()
            } else {
                // Reporting success here would silently swallow every queued download.
                Log.w(TAG, "No persisted episode list; waiting for a sync from the phone")
                Result.failure()
            }
        }

        // Artwork first — it is small, and the list needs it to render offline.
        downloadArtwork()

        while (true) {
            if (isStopped) {
                Log.d(TAG, "Worker stopped; partial download preserved for resume")
                return@withContext Result.retry()
            }

            val episode = SyncedWatchEpisodes.episodes.value
                .firstOrNull { it.localPath == null && !it.error && it.audioUrl.isNotBlank() }
                ?: break // All done

            val outFile = File(dir, "${episode.guid}.mp3")
            val tmpFile = File(dir, "${episode.guid}.mp3.tmp")
            try {
                val resumeFrom = if (tmpFile.exists()) tmpFile.length() else 0L

                val connection = (URL(episode.audioUrl).openConnection() as HttpURLConnection).apply {
                    // Both default to 0, which means "wait forever". A stalled connection
                    // would otherwise hang the queue with no error and no retry.
                    connectTimeout = CONNECT_TIMEOUT_MS
                    readTimeout = READ_TIMEOUT_MS
                    if (resumeFrom > 0) setRequestProperty("Range", "bytes=$resumeFrom-")
                }

                val status = connection.responseCode
                if (status != HttpURLConnection.HTTP_OK && status != HttpURLConnection.HTTP_PARTIAL) {
                    throw IllegalStateException("HTTP $status for ${episode.audioUrl}")
                }

                // 206 means the server honored the range. 200 means it ignored it and is
                // sending the whole body, so anything already on disk must be discarded.
                val resumed = status == HttpURLConnection.HTTP_PARTIAL
                val startBytes = if (resumed) resumeFrom else 0L
                if (resumeFrom > 0) {
                    Log.d(
                        TAG,
                        if (resumed) "Resuming ${episode.guid} at $resumeFrom bytes"
                        else "Server ignored Range for ${episode.guid}; restarting from 0",
                    )
                }

                // contentLengthLong covers the >2 GB case that the Int version silently
                // wraps. It is -1 for chunked or gzipped responses, where no percentage
                // can be computed at all.
                val remaining = connection.contentLengthLong
                val totalBytes = if (remaining > 0) startBytes + remaining else -1L

                Log.d(TAG, "Downloading episode ${episode.guid} (total=$totalBytes)")
                SyncedWatchEpisodes.updateProgress(
                    episode.guid,
                    if (totalBytes > 0) percentOf(startBytes, totalBytes) else INDETERMINATE,
                )
                WatchDownloadStatusReporter.reportStatus(applicationContext)

                var stopped = false
                connection.inputStream.use { src ->
                    FileOutputStream(tmpFile, resumed).use { dst ->
                        val buffer = ByteArray(8192)
                        var bytesRead = startBytes
                        var lastReportedProgress = -1
                        var lastReportedToPhone = -1

                        while (true) {
                            if (isStopped) {
                                stopped = true
                                break
                            }
                            val read = src.read(buffer)
                            if (read == -1) break
                            dst.write(buffer, 0, read)
                            bytesRead += read

                            if (totalBytes <= 0) continue
                            val progress = percentOf(bytesRead, totalBytes)
                            if (progress == lastReportedProgress) continue
                            lastReportedProgress = progress
                            SyncedWatchEpisodes.updateProgress(episode.guid, progress)
                            // Throttle phone reports to every 5%
                            if (progress / 5 != lastReportedToPhone / 5) {
                                lastReportedToPhone = progress
                                WatchDownloadStatusReporter.reportStatus(applicationContext)
                            }
                        }
                        dst.flush()
                    }
                }
                connection.disconnect()

                if (stopped) {
                    Log.d(TAG, "Stopped mid-download; ${tmpFile.length()} bytes kept for resume")
                    return@withContext Result.retry()
                }

                // Atomic rename — only a fully downloaded file becomes .mp3
                tmpFile.renameTo(outFile)
                SyncedWatchEpisodes.markDownloaded(episode.guid, outFile.absolutePath)
                WatchDownloadStatusReporter.reportStatus(applicationContext)
                Log.d(TAG, "Downloaded episode ${episode.guid} to ${outFile.absolutePath}")
            } catch (e: Exception) {
                Log.e(TAG, "Failed to download episode ${episode.guid}", e)
                // The partial file is deliberately kept. A manual retry resumes from it,
                // and a server that ignores Range makes us discard it anyway.
                //
                // No auto-retry: the episode is marked failed and the queue moves on. A
                // retrying worker used to back off exponentially toward a 5 hour cap
                // while KEEP silently discarded every new request in the meantime.
                // Retry is now an explicit user action — long-press the episode.
                SyncedWatchEpisodes.markError(episode.guid)
                WatchDownloadStatusReporter.reportStatus(applicationContext)
            }
        }

        Log.d(TAG, "All episodes downloaded")
        WatchDownloadStatusReporter.reportStatus(applicationContext)
        Result.success()
    }

    /**
     * Cache artwork for every episode that lacks it. Failures are non-fatal —
     * a missing image must not block or retry the audio downloads.
     */
    private fun downloadArtwork() {
        val urls = SyncedWatchEpisodes.episodes.value
            .filter { it.artworkPath == null && it.artworkUrl.isNotBlank() }
            .map { it.artworkUrl }
            .distinct()

        for (url in urls) {
            val outFile = SyncedWatchEpisodes.artworkFile(url) ?: continue
            if (outFile.exists()) {
                SyncedWatchEpisodes.markArtworkDownloaded(url, outFile.absolutePath)
                continue
            }
            try {
                val tmpFile = File(outFile.absolutePath + ".tmp")
                URL(url).openStream().use { src ->
                    tmpFile.outputStream().use { dst -> src.copyTo(dst) }
                }
                tmpFile.renameTo(outFile)
                SyncedWatchEpisodes.markArtworkDownloaded(url, outFile.absolutePath)
                Log.d(TAG, "Cached artwork $url")
            } catch (e: Exception) {
                Log.w(TAG, "Failed to cache artwork $url", e)
                File(outFile.absolutePath + ".tmp").delete()
            }
        }
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
        // The type is required from API 34 and must match the manifest declaration on
        // WorkManager's SystemForegroundService. minSdk is 30, so this always applies.
        return ForegroundInfo(
            NOTIFICATION_ID,
            notification,
            ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC,
        )
    }

    companion object {
        private const val TAG = "EpisodeDownload"
        private const val NOTIFICATION_ID = 1001
        const val UNIQUE_WORK_NAME = "episode-downloads"

        private const val CONNECT_TIMEOUT_MS = 15_000
        private const val READ_TIMEOUT_MS = 30_000

        /**
         * Progress value meaning "downloading, total size unknown". Servers using
         * chunked or gzipped transfer send no Content-Length, and no percentage can be
         * derived. Reporting 1% forever made healthy downloads look hung.
         */
        const val INDETERMINATE = -1

        /** Capped at 99 so only [SyncedWatchEpisodes.markDownloaded] can report 100. */
        private fun percentOf(bytes: Long, total: Long): Int =
            ((bytes * 100) / total).toInt().coerceIn(0, 99)
    }
}
