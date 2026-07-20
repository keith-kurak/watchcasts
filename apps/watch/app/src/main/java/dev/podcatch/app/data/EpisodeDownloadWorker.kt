package dev.podcatch.app.data

import android.content.Context
import android.util.Log
import androidx.work.CoroutineWorker
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
                .firstOrNull { it.localPath == null && it.audioUrl.isNotBlank() }
                ?: break // All done

            Log.d(TAG, "Downloading episode ${episode.guid}")
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
                                }
                            }
                        }
                    }
                }

                SyncedWatchEpisodes.markDownloaded(episode.guid, outFile.absolutePath)
                Log.d(TAG, "Downloaded episode ${episode.guid} to ${outFile.absolutePath}")
            } catch (e: Exception) {
                Log.e(TAG, "Failed to download episode ${episode.guid}", e)
                // Retry the whole worker (will pick up where it left off)
                return@withContext Result.retry()
            }
        }

        Log.d(TAG, "All episodes downloaded")
        Result.success()
    }

    companion object {
        private const val TAG = "EpisodeDownload"
        const val UNIQUE_WORK_NAME = "episode-downloads"
    }
}
