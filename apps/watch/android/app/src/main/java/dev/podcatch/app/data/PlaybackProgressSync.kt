package dev.podcatch.app.data

import android.content.Context
import android.util.Log
import com.google.android.gms.wearable.PutDataMapRequest
import com.google.android.gms.wearable.Wearable
import dev.podcatch.app.playback.PlaybackState
import dev.podcatch.app.playback.RemoteProgress
import org.json.JSONArray

/**
 * Exchange listen positions with the phone.
 *
 * A DataItem in each direction, not a message. The device you listened on is usually the
 * one that is *not* connected — a watch on a run, a phone left at home — so the update has
 * to survive the disconnection and replicate on reconnect. A message would be dropped.
 *
 * Both sides check [SyncedSettings.syncPlaybackProgress] before sending and before
 * applying. Checking on send alone would leave a watch publishing positions a phone with
 * the setting off has stopped asking for.
 *
 * See docs/watch-sync.md.
 */
object PlaybackProgressSync {
    private const val TAG = "PlaybackProgressSync"

    /**
     * Least time between two publishes.
     *
     * The player saves a position every few seconds while audio plays, and a DataItem put
     * at that rate is pointless traffic over the companion link — nothing on the phone
     * reacts to a position moving in real time. What matters is the position a listening
     * session ended on, and the pause and teardown saves publish that within one window.
     */
    private const val PUBLISH_INTERVAL_MS = 30_000L

    @Volatile
    private var lastPublishedAt = 0L

    /** Publish this watch's positions, unless one went out very recently. */
    fun publish(context: Context, force: Boolean = false) {
        if (!SyncedSettings.syncPlaybackProgress.value) return
        val now = System.currentTimeMillis()
        if (!force && now - lastPublishedAt < PUBLISH_INTERVAL_MS) return
        lastPublishedAt = now

        val array = JSONArray()
        for ((guid, progress) in PlaybackState.savedProgressSnapshot()) {
            if (progress.positionMs <= 0L) continue
            array.put(
                org.json.JSONObject().apply {
                    put("guid", guid)
                    put("positionMs", progress.positionMs)
                    put("durationMs", progress.durationMs)
                    put("updatedAt", progress.updatedAt)
                },
            )
        }

        val request = PutDataMapRequest.create(DataLayerContract.PATH_PLAYBACK_PROGRESS_WATCH)
            .apply {
                dataMap.putString(DataLayerContract.KEY_ITEMS, array.toString())
                dataMap.putLong(DataLayerContract.KEY_UPDATED_AT, now)
            }
            .asPutDataRequest()
            .setUrgent()

        Wearable.getDataClient(context.applicationContext).putDataItem(request)
            .addOnSuccessListener {
                Log.d(TAG, "Published ${array.length()} playback position(s)")
            }
            .addOnFailureListener { e ->
                Log.e(TAG, "Failed to publish playback progress", e)
            }
    }

    /**
     * Apply a positions payload pushed from the phone.
     *
     * Publishes afterwards when anything changed, so the phone sees this watch converge on
     * the merged value rather than re-sending it on every reconnect.
     */
    fun applyFromPhone(context: Context, json: String?) {
        if (json == null) return
        if (!SyncedSettings.syncPlaybackProgress.value) return
        val entries = parse(json)
        if (entries.isEmpty()) return
        val changed = PlaybackState.applyRemoteProgress(entries)
        Log.d(TAG, "Applied phone progress: ${entries.size} received, changed=$changed")
        if (changed) publish(context, force = true)
    }

    private fun parse(json: String): List<RemoteProgress> {
        val array = JSONArray(json)
        val result = mutableListOf<RemoteProgress>()
        for (i in 0 until array.length()) {
            val obj = array.optJSONObject(i) ?: continue
            val guid = obj.optString("guid", "")
            if (guid.isEmpty()) continue
            result.add(
                RemoteProgress(
                    guid = guid,
                    positionMs = obj.optLong("positionMs", 0L),
                    durationMs = obj.optLong("durationMs", 0L),
                    updatedAt = obj.optLong("updatedAt", 0L),
                ),
            )
        }
        return result
    }
}
