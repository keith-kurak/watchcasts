# PR Plan — Fix watch download reliability

Working document for the watch download fixes. Reference `docs/watch-sync.md` for how the
sync pipeline works and for the K-numbered issue catalogue cited throughout.

---

## Problem

Downloads on the watch fail in three user-visible ways:

1. A requested download sits at "waiting" and never starts
2. A download sits at 1% for a very long time
3. A download crawls at a few percent per minute, and opening the phone resets its progress

These have five distinct root causes, none of which is the one the symptoms suggest.

| Cause | Effect |
|---|---|
| **K1** — watch state is memory-only | A worker started in a fresh process sees an empty list, logs "All episodes downloaded", and returns `success()`. The download silently never happens and nothing retries. |
| **K6** — `KEEP` plus exponential retry backoff | New download requests are silently discarded for up to 5 hours. The "Downloading…" toast claims otherwise. |
| **K4** — no socket timeouts | A stalled connection hangs forever. Progress freezes at exactly 1%. |
| **K3 + K7** — no `Range` resume, plus the ~10-minute job execution limit | A slow download is cut off and restarts at byte 0, forever. |
| **K2** — status handler reports before syncing | In a fresh process the watch sends `[]`, and the phone replaces its whole state map with it. |

Wear OS kills app processes aggressively, so K1 and K2 are the common case rather than an
edge case.

---

## Phase 1 — Persist watch state

**Fixes:** K1, K2, K10
**Rationale:** stops silent download loss, and is independently verifiable.

### Changes

**1.1 Persistence in `SyncedWatchEpisodes`**

- Add `init(context)`, `load()`, and a private `persist()`
- Store one JSON blob in `SharedPreferences("watch-episodes")`, matching the existing
  `PlaybackState` pattern
- Persist the full record: synced fields plus `downloadProgress`, `localPath`,
  `artworkPath`, `error`
- Call `persist()` from `update`, `updateProgress`, `markDownloaded`,
  `markArtworkDownloaded`, `markError`
- Throttle `persist()` on `updateProgress` to every 5%, matching the existing phone-report
  throttle — it currently fires on every whole percent

**1.2 Carry `error` through `update()`**

`SyncedWatchEpisodes.kt:65-78` omits `error`, so every phone sync re-arms failed episodes.
Add `error = prev?.error ?: false`. Prerequisite for Phase 3.

**1.3 Load before reading state**

- `EpisodeDownloadWorker.doWork` — `load()` first
- `DataLayerListenerService`, both message branches (`:43`, `:49`) — `load()` before
  `reportStatus`
- `MainActivity.onCreate` — `init` + `load()`

**1.4 Distinguish "done" from "no state"**

In `doWork`, if the list is still empty after loading, return `Result.failure()` with an
explicit log rather than `success()`. Empty-and-loaded is genuinely done;
empty-and-never-loaded is a bug that should be visible.

**1.5 Never report an empty status array**

`WatchDownloadStatusReporter.reportStatus` returns early on an empty list. The phone replaces
its whole map on every message (`useWearDataLayer.ts:57`), so an empty report wipes the UI.

Preferred over switching the phone to merge semantics, because merge would prevent a real
removal from clearing stale entries.

### Verification

- Queue a download, `adb shell am kill` the watch app, confirm it still completes
- Kill the watch process, open the phone screen, confirm progress does not reset

---

## Phase 2 — Download robustness

**Fixes:** K3, K4, K7, K8, K13
**Independent of Phase 3.**

### Changes

**2.1 Timeouts** — cast to `HttpURLConnection`, set `connectTimeout = 15_000` and
`readTimeout = 30_000`.

**2.2 `Range` resume**

- If `<guid>.mp3.tmp` exists with size > 0, send `Range: bytes=<size>-`
- On `206`, append and seed `bytesRead` with the existing size
- On `200`, the server ignored the range — truncate and start over
- Total becomes `existingBytes + contentLength`

**2.3 Correct progress math** — use `getContentLengthLong()`. When total is unknown, report
bytes downloaded rather than freezing at 1%.

Not originally requested, but Range resume rewrites this arithmetic anyway, and leaving it
would preserve the "stuck at 1%" symptom.

**2.4 Long-running worker**

- Call `setForeground(getForegroundInfo())` at the top of `doWork` — `getForegroundInfo()`
  already exists and is never called
- Add `FOREGROUND_SERVICE_DATA_SYNC` to the manifest, plus WorkManager's
  `SystemForegroundService` with `android:foregroundServiceType="dataSync"`
- WorkManager 2.10.0 handles the Android 15 `dataSync` timeout internally

This removes the ~10-minute cap, so the existing all-episodes loop can stay as-is.

**2.5 Reallocate expedited work**

The defect in K5 is not that expedited work is used — it is that it is used on every path,
including the automatic one. Every phone-side watch-list change fires `triggerSync()` and
burns quota, so none is left when you deliberately open the watch app.

| Trigger | Expedited? | Why |
|---|---|---|
| `onDataChanged` — phone pushed a list | No | Automatic and frequent; this is what drains quota |
| `request-sync` — force-download from the phone | Yes | User-initiated |
| `MainActivity` — watch app opened | Yes | User-initiated, user is waiting |
| Long-press retry | Yes | User-initiated, user is waiting |

`setExpedited` controls *when* `doWork` starts; `setForeground` controls what happens *once
it runs*. Both are kept.

**2.6 Honor cancellation** — add `if (isStopped) return@withContext Result.retry()` at the
top of each loop pass and inside the read loop.

### Verification

- Kill mid-download, confirm the byte offset continues rather than restarting
- Confirm a large episode finishes instead of livelocking

---

## Phase 3 — Manual retry only

**Fixes:** K6, K11, K12
**Depends on Phase 1** — manual-only retry is unsafe until `error` persists, or a phone sync
would silently re-arm failed episodes.

### Changes

**3.1 Remove auto-retry** — on exception, delete the `.tmp`, `markError(guid)`, report, then
**continue to the next episode** instead of returning `Result.retry()`. The worker finishes
with `success()` having attempted everything.

**3.2 Remove tap-to-download**

- `MainActivity.kt:309-316` — `Card.onClick` opens the episode when downloaded, does nothing
  otherwise
- Delete `enqueueEpisodeDownload` (`MainActivity.kt:173-188`) and its "Downloading…" toast

**3.3 Long-press menu**

- Replace `Card(onClick = ...)` with `combinedClickable` carrying `onClick` and `onLongClick`.
  Wear Compose Material 1.4.0 `Card` has no `onLongClick` parameter, so click handling moves
  to a modifier — expect slight ripple and haptic differences, verify on screen
- Long-press opens a dialog with **Retry download** for any non-downloaded episode, plus
  **Cancel**
- Retry clears `error` for that guid, persists, then enqueues with `KEEP`

`KEEP` is safe here: backoff no longer exists, and a running worker re-reads state on each
loop pass, so clearing the flag makes the episode eligible without replacing the work.

**3.4 Show error state** — reset `downloadProgress` to 0 on error and render a distinct error
icon, so a failed episode is visually distinct from a pending one and the long-press
affordance is discoverable.

### Known tradeoff

Losing Wi-Fi mid-queue will now fail every remaining episode, each needing a manual retry.
The `NetworkType.CONNECTED` constraint prevents the worker *starting* without network, but
not losing it mid-run.

If this proves annoying, the fix is to treat `IOException` subtypes meaning "network went
away" as retryable and everything else as a hard error. Ship the simple version first.

### Verification

- Force a failure with a bad URL, long-press, retry, confirm it downloads
- Confirm a failed episode stays failed across a phone sync

---

## Phase 4 — Docs

Update `docs/watch-sync.md`:

- Revise sections 4 (state ownership), 5 (download pipeline), 6 (status reporting)
- Resolve K1–K8 and K10–K13 in the Known issues table
- Add a change log entry

`CLAUDE.md` requires this doc to be updated in the same commit as any sync behavior change.

---

## Testing

All verification on the Wear emulator (`emulator-5556`), **not** the physical Pixel Watch 3 —
real episodes over watch network are slow and burn battery.

| Test | Method |
|---|---|
| Survives process death | Queue a download, `adb shell am kill`, confirm completion |
| Resume works | Kill mid-download, confirm byte offset continues |
| Phone open does not reset | Kill watch process, open phone screen, confirm progress holds |
| Manual retry | Bad URL → failure → long-press → retry → completes |
| No auto-retry | Failed episode stays failed across a phone sync |

`adb` is not on PATH — use `$HOME/Library/Android/sdk/platform-tools/adb`.

---

## Out of scope

Tracked in `docs/todo.md`:

| ID | Item | Why deferred |
|---|---|---|
| T1 | Migrate to OkHttp | New dependency, larger diff; would obscure attribution of the correctness fixes |
| T2 | Cross-protocol redirects (K9) | Disappears with T1. Silent corruption bug — do standalone if T1 slips |
| T3 | Deterministic download start when app is open | Adds a concurrency hazard to fix a latency problem that may not survive Phase 1 |
| T4 | Contract duplication (K14/K15) | Comment corrections only, unless codegen is wanted |

---

## Suggested commit split

1. Phase 1 — persist watch state
2. Phase 2 — download robustness
3. Phase 3 — manual retry and long-press menu
4. Phase 4 — docs

Phase 1 first regardless of order preference: its effect is independently observable, which
makes the later behavior changes attributable.
