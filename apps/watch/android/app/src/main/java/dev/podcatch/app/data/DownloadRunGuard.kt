package dev.podcatch.app.data

import android.content.Context
import android.content.SharedPreferences
import android.os.SystemClock
import android.util.Log
import java.io.File

/**
 * Circuit breaker for the download pipeline.
 *
 * Guards against two ways a download run can hurt the whole device rather than just one
 * episode. Both facts are **persisted**, for the same reason
 * [HighBandwidthNetwork.lastAcquireFailed] is: the status reporter usually runs in a
 * different process from the worker that hit the condition.
 *
 * **Crash-loop breaker.** [beginRun] stamps the current boot id before the worker touches
 * the network; [endRun] clears the stamp on every orderly exit. A stamp left over from an
 * *earlier boot* means the device went down mid-run. That matters because WorkManager's
 * `RescheduleReceiver` restarts pending work on `BOOT_COMPLETED` — so a run that panics
 * the device (the suspected shape is a Wi-Fi firmware fault during the radio bring-up in
 * [HighBandwidthNetwork.acquire]) re-arms itself after every reboot and can sustain a boot
 * loop with no way to intervene. After [MAX_SUSPECT_CRASHES] consecutive runs each ending
 * in a device crash, [beginRun] refuses and the worker stays idle until a person acts:
 * opening the watch app, or pressing sync or retry on the phone — all call [resetBreaker].
 *
 * Boot identity is `/proc/sys/kernel/random/boot_id`, so ordinary Wear process churn —
 * which kills the worker's process constantly without rebooting — never counts. An orderly
 * exit resets the count to zero: tripping requires *consecutive* device crashes, which is
 * the boot-loop signature, not one reboot a month from a dead battery.
 *
 * **Out-of-space flag.** Set when a run stopped because free space fell below the
 * worker's floor; cleared when a later pass finds room again. Read by
 * [WatchDownloadStatusReporter] so the phone can say "storage full" rather than a bare
 * "Waiting…".
 */
object DownloadRunGuard {
    private const val TAG = "DownloadRunGuard"

    private const val PREFS_NAME = "download-guard"

    /** Boot id of an unfinished run, or absent when the last run exited in an orderly way. */
    private const val KEY_RUN_BOOT_ID = "runBootId"

    /** Consecutive runs that ended in a device crash (reboot mid-run). */
    private const val KEY_CRASH_COUNT = "suspectCrashCount"

    private const val KEY_OUT_OF_SPACE = "outOfSpace"

    /**
     * Two in a row. One reboot mid-download can be a coincidence — a dead battery, a
     * system update. Two consecutive runs each taking the device down is the loop.
     */
    private const val MAX_SUSPECT_CRASHES = 2

    /**
     * Account for a possible crash, then either arm the guard for this run or refuse.
     *
     * @return `false` when the breaker is tripped and the worker must not run. No stamp
     * is written in that case, so a refused run can never be counted as a crash.
     */
    fun beginRun(context: Context): Boolean {
        val prefs = prefs(context)
        val current = currentBootId()
        val unfinished = prefs.getString(KEY_RUN_BOOT_ID, null)

        var count = prefs.getInt(KEY_CRASH_COUNT, 0)
        if (unfinished != null && unfinished != current) {
            // A run was stamped in a previous boot and never finished: the device went
            // down mid-run. Count it exactly once by folding the stale stamp away.
            count += 1
            Log.w(TAG, "Previous download run ended in a reboot (suspect crashes: $count)")
            prefs.edit()
                .putInt(KEY_CRASH_COUNT, count)
                .remove(KEY_RUN_BOOT_ID)
                .apply()
        }

        if (count >= MAX_SUSPECT_CRASHES) {
            Log.w(TAG, "Breaker tripped after $count consecutive mid-run reboots; refusing to run")
            return false
        }

        prefs.edit().putString(KEY_RUN_BOOT_ID, current).apply()
        return true
    }

    /**
     * Record an orderly exit. Any return from the worker — success, failure, or retry —
     * proves this run did not take the device down, so the consecutive count resets.
     */
    fun endRun(context: Context) {
        prefs(context).edit()
            .remove(KEY_RUN_BOOT_ID)
            .putInt(KEY_CRASH_COUNT, 0)
            .apply()
    }

    /** True when downloads are suspended pending a deliberate user action. */
    fun isTripped(context: Context): Boolean =
        prefs(context).getInt(KEY_CRASH_COUNT, 0) >= MAX_SUSPECT_CRASHES

    /**
     * A person asked for downloads: opening the watch app, or sync / retry on the phone.
     * That intent outranks the breaker — clear it so the next enqueue runs.
     */
    fun resetBreaker(context: Context) {
        if (prefs(context).getInt(KEY_CRASH_COUNT, 0) == 0) return
        Log.d(TAG, "Breaker reset by user action")
        prefs(context).edit()
            .putInt(KEY_CRASH_COUNT, 0)
            .remove(KEY_RUN_BOOT_ID)
            .apply()
    }

    fun setOutOfSpace(context: Context, outOfSpace: Boolean) {
        val prefs = prefs(context)
        if (prefs.getBoolean(KEY_OUT_OF_SPACE, false) == outOfSpace) return
        prefs.edit().putBoolean(KEY_OUT_OF_SPACE, outOfSpace).apply()
    }

    fun isOutOfSpace(context: Context): Boolean =
        prefs(context).getBoolean(KEY_OUT_OF_SPACE, false)

    /**
     * A string that changes on reboot and on nothing else.
     *
     * The kernel's boot_id is world-readable and exact. The fallback derives boot time
     * from the two clocks and rounds to a minute, so drift cannot make one boot look
     * like two.
     */
    private fun currentBootId(): String = runCatching {
        File("/proc/sys/kernel/random/boot_id").readText().trim()
    }.getOrElse {
        ((System.currentTimeMillis() - SystemClock.elapsedRealtime()) / 60_000L).toString()
    }

    private fun prefs(context: Context): SharedPreferences = context.applicationContext
        .getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
}
