package dev.podcatch.app.data

import android.content.Context
import android.util.Log
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import androidx.work.workDataOf
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File
import java.net.URL

class EpisodeDownloadWorker(
    context: Context,
    params: WorkerParameters,
) : CoroutineWorker(context, params) {

    override suspend fun doWork(): Result = withContext(Dispatchers.IO) {
        val guid = inputData.getString(KEY_GUID) ?: return@withContext Result.failure()
        val audioUrl = inputData.getString(KEY_AUDIO_URL) ?: return@withContext Result.failure()

        try {
            val dir = File(applicationContext.filesDir, "episodes")
            dir.mkdirs()
            val outFile = File(dir, "$guid.mp3")

            val connection = URL(audioUrl).openConnection()
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
                                SyncedWatchEpisodes.updateProgress(guid, progress)
                                setProgress(workDataOf(KEY_PROGRESS to progress))
                            }
                        }
                    }
                }
            }

            SyncedWatchEpisodes.markDownloaded(guid, outFile.absolutePath)
            Log.d(TAG, "Downloaded episode $guid to ${outFile.absolutePath}")
            Result.success()
        } catch (e: Exception) {
            Log.e(TAG, "Failed to download episode $guid", e)
            Result.retry()
        }
    }

    companion object {
        private const val TAG = "EpisodeDownload"
        const val KEY_GUID = "guid"
        const val KEY_AUDIO_URL = "audioUrl"
        const val KEY_PROGRESS = "progress"
    }
}
