# Phone ↔ Watch Sync

How the Podcatch phone app and the Wear OS app exchange data, and how the watch downloads episodes.

> **Keep this current.** Any change to the Data Layer contract, the download worker, or watch-side state must be reflected here in the same commit. See [Change log](#change-log).
>
> **Status:** describes behavior as of 2026-08-02. The [Known issues](#known-issues) section lists defects that exist in the code today.

---

## 1. Participants

| Side | Code | Language |
|---|---|---|
| Phone | `apps/mobile` | TypeScript (Expo Router) |
| Phone native bridge | `apps/mobile/modules/wear-data-layer` | Kotlin (Expo module) |
| Watch | `apps/watch/android` | Kotlin (Wear Compose) |

### Identity constraint

The two apps pair only when **both** conditions hold:

1. Same `applicationId`
2. Same signing key

Per variant:

| Variant | applicationId |
|---|---|
| dev | `com.keithkurak.watchcasts.dev` |
| prod | `com.keithkurak.watchcasts` |

The phone side sets this in `apps/mobile/app.config.js`. The watch side uses `applicationIdSuffix = "dev"` on its debug build type in `apps/watch/android`. A dev phone build cannot pair with a prod watch build.

The watch app is also marked standalone (`com.google.android.wearable.standalone = true` in `AndroidManifest.xml`), so it runs without the phone app installed. It just has nothing to sync.

---

## 2. The contract

Path and key constants are **duplicated by hand in three places**. There is no shared code across the language boundary.

| File | Role |
|---|---|
| `packages/shared/src/datalayer.ts` | Source of truth, by convention |
| `apps/watch/.../data/DataLayerContract.kt` | Watch mirror |
| `apps/mobile/modules/wear-data-layer/.../WearDataLayerModule.kt` | Phone mirror (private consts) |

A change to one without the others breaks sync **silently** — no compile error, no runtime error, just messages that never arrive.

> The comment in `datalayer.ts` says the contract is mirrored in two places. It is three. See [Known issues](#known-issues).

### DataClient paths — persistent, replicated

`DataItem`s survive disconnection and replicate when the devices reconnect. Both are phone → watch.

| Path | Payload | Direction |
|---|---|---|
| `/podcatch/subscriptions` | `{ items, updatedAt }` | phone → watch |
| `/podcatch/watch-episodes` | `{ items, updatedAt }` | phone → watch |

`items` is a JSON **string** under the DataMap key `items`. `updatedAt` is a long under `updatedAt`.

### MessageClient paths — transient RPC

Messages are fire-and-forget. They are dropped if the peer is unreachable.

| Path | Direction | Payload | Sent by |
|---|---|---|---|
| `/podcatch/request-sync` | **phone → watch** | empty | `sendForceDownload()` |
| `/podcatch/request-download-status` | phone → watch | empty | `requestWatchDownloadStatus()` |
| `/podcatch/watch-download-status` | watch → phone | JSON array | `WatchDownloadStatusReporter` |

> `datalayer.ts` documents `REQUEST_SYNC` as "Watch -> phone". That is wrong — the phone sends it. See [Known issues](#known-issues).

### Capabilities

Advertised via `CapabilityClient` so each side can discover the other: `podcatch_phone`, `podcatch_watch`.

---

## 3. Phone → watch: the watch episode list

### What the phone sends

`useWatchListMutations.triggerSync()` in `apps/mobile/src/lib/queries.ts` builds the payload. For every entry in the stored watch list it emits:

```
guid, title, podcastTitle, podcastId, audioUrl, duration, pubDate, artworkUrl
```

Episodes whose cached episode record cannot be found are skipped. The payload carries **no download state** — the watch owns that.

`triggerSync()` fires on every watch-list add and remove.

### When the watch receives it

Three entry points call `SyncedWatchEpisodes.update(json)`:

| Entry point | When |
|---|---|
| `DataLayerListenerService.onDataChanged` | Data item changed; works with the app closed |
| `MainActivity.onDataChanged` | Data item changed while the activity is resumed |
| `MainActivity.onResume` → `getDataItems()` | Catches up on items replicated before listening started |

`WearableListenerService` will **start a fresh process** to deliver a Data Layer event if the app is not running.

### What `update()` does

`SyncedWatchEpisodes.update(json)` reconciles the incoming list against in-memory state:

- **`localPath`** — keeps the previous value, else probes disk for `<filesDir>/episodes/<guid>.mp3`
- **`artworkPath`** — keeps the previous value, else probes disk for the hashed artwork filename
- **`downloadProgress`** — `100` if a local file exists, else the previous value, else `0`
- **`error`** — **not carried over.** Always resets to `false`
- **Removed episodes** — their audio file, their artwork (if unshared), and their `PlaybackState` entry are all deleted

---

## 4. Watch-side state ownership

| State | Where | Persisted? |
|---|---|---|
| Subscription list | `SyncedSubscriptions` | **No** — memory only |
| Watch episode list | `SharedPreferences("watch-episodes")` via `SyncedWatchEpisodes` | Yes |
| Download progress | same | Yes, throttled to every 5% |
| Download error flag | same | Yes |
| Downloaded audio | `<filesDir>/episodes/<guid>.mp3` | Yes, on disk |
| Cached artwork | `<filesDir>/episodes/artwork/<hash>.img` | Yes, on disk |
| Playback position | `SharedPreferences("playback")` via `PlaybackState` | Yes |

Wear OS kills app processes aggressively, and WorkManager will start a fresh process to run
a worker. **Treat process death as the normal case, not the exception.**

### The load contract

Anything that reads `SyncedWatchEpisodes.episodes` must call `load(context)` first, or it
will see an empty list in a fresh process and conclude there is nothing to download. Current
call sites: `EpisodeDownloadWorker.doWork`, both `DataLayerListenerService` message branches,
`DataLayerListenerService.onDataChanged`, and `MainActivity.onCreate`.

`load()` is idempotent and **first-call-wins** — a later call cannot overwrite a live
in-memory list with a staler copy from disk. `init(context)` wires up preferences and
`episodesDir`; `load()` calls it, so callers rarely need it directly.

### Trust-but-verify on restore

A stored `localPath` or `artworkPath` is only adopted if the file still exists. If a record
claimed a completed download and the file is gone, `downloadProgress` resets to `0` rather
than keeping its stored `100` — otherwise the phone is told a download finished when it did
not. A record that was mid-download keeps its stored progress.

### `hasStoredList`

Distinguishes "the watch has nothing queued" from "this process has no idea what is queued".
Both look like an empty `episodes` list but mean very different things. `EpisodeDownloadWorker`
uses it to decide between `Result.success()` and `Result.failure()`.

`SyncedSubscriptions` is still memory-only. It feeds a browse UI rather than the download
pipeline, so losing it is cosmetic.

---

## 5. The download pipeline

### Enqueue

Four call sites enqueue the worker. All use the unique work name `episode-downloads` with `ExistingWorkPolicy.KEEP`.

| Call site | Trigger |
|---|---|
| `DataLayerListenerService.onDataChanged` | New watch-episode list arrived |
| `DataLayerListenerService.onMessageReceived` | `/podcatch/request-sync` from the phone |
| `MainActivity.enqueueDownloads` | Activity resumed, or live data change |
| `enqueueEpisodeDownload` (`MainActivity.kt`) | User tapped a non-downloaded episode |

All four build the request with:

```kotlin
.setConstraints(NetworkType.CONNECTED)
.setExpedited(OutOfQuotaPolicy.RUN_AS_NON_EXPEDITED_WORK_REQUEST)
```

`KEEP` means an enqueue is **discarded** if work with that name already exists in any non-terminal state — including `ENQUEUED` while waiting out retry backoff.

`enqueueEpisodeDownload` takes an `episode` parameter but only uses it to check that `audioUrl` is non-blank. **The tapped episode is not passed to the worker and is not prioritized.**

### The worker

`EpisodeDownloadWorker` is a `CoroutineWorker` running on `Dispatchers.IO`.

1. Calls `SyncedWatchEpisodes.load()`, then ensures `<filesDir>/episodes` exists
2. If the list is empty: returns `success()` when `hasStoredList` is true (genuinely nothing
   queued), or `failure()` when it is false (no persisted state — reporting success here
   would silently swallow every queued download)
3. Calls `downloadArtwork()` — caches every missing artwork image; failures are logged and skipped
4. Loops: takes the **first** episode where `localPath == null && !error && audioUrl.isNotBlank()`
5. Sets progress to `1`, reports to the phone
6. Streams the body to `<guid>.mp3.tmp` in 8 KB chunks
7. Renames `.tmp` → `.mp3` on completion, then calls `markDownloaded`
8. Breaks out of the loop when no eligible episode remains, and returns `Result.success()`

Ordering is the phone's watch-list order. There is no priority and no parallelism — strictly one file at a time.

`getForegroundInfo()` is defined and builds a silent `IMPORTANCE_LOW` notification on channel `episode_downloads`. **The worker never calls `setForeground()`**, so this is only used when WorkManager runs the work as expedited on API < 31.

### Progress reporting

- **Watch-local** — every whole-percent change calls `updateProgress`
- **To the phone** — throttled to roughly every 5%

Progress is only computed inside `if (totalBytes > 0)`, where `totalBytes` comes from `connection.contentLength`.

### Failure handling

Any exception in the download loop:

1. Deletes the partial `.tmp`
2. Calls `markError(guid)`
3. Reports status to the phone
4. Returns `Result.retry()` — immediately, without attempting later episodes

`Result.retry()` uses WorkManager's default backoff: exponential, starting at 30 s, capped at 5 h. The `error` flag makes the worker skip that episode on subsequent attempts — until the next `update()` clears it.

---

## 6. Watch → phone: download status

`WatchDownloadStatusReporter.reportStatus(context)` reads `SyncedWatchEpisodes.episodes.value` and sends one JSON array to every connected node.

Per episode it derives:

| Field | Rule |
|---|---|
| `status` | `complete` if `localPath != null`, else `error` if `error`, else `downloading` if `downloadProgress > 0`, else `pending` |
| `progress` | `100` if complete, `0` if error, else `downloadProgress` |

It is called after every meaningful state transition: list update, download start, each ~5% step, completion, failure, and on request from the phone.

**It returns early on an empty list.** The phone replaces its whole map with whatever arrives,
so an empty report wipes its UI. An empty list here means either "nothing queued" — in which
case the phone already shows nothing — or "state not loaded yet", which must never be
broadcast as fact.

### Phone side

`useWatchDownloadStatusListener` in `apps/mobile/src/hooks/useWearDataLayer.ts`:

- Subscribes to the `onWatchDownloadStatus` native event
- On mount, sends `/podcatch/request-download-status` once
- On each message, **replaces** its whole map: `setStatuses(new Map(event.statuses.map(...)))`

Replace-not-merge means any report the watch sends becomes the phone's entire view of watch download state.

The `/podcatch/request-download-status` handler on the watch calls `load()` before reporting,
so a fresh process reports real state rather than nothing.

---

## 7. Known issues

Open defects. Each is a real, reproducible cause of user-visible breakage.

### Fixed

| # | Issue | Fixed in |
|---|---|---|
| ~~K1~~ | Watch state memory-only; a worker in a fresh process saw an empty list and returned `success()` without downloading anything | Phase 1 |
| ~~K2~~ | `request-download-status` reported before syncing, so a fresh process sent `[]` and wiped the phone's display | Phase 1 |
| ~~K10~~ | `update()` did not carry over `error`, silently re-arming failed episodes on every sync | Phase 1 |

### Critical — silent data loss

| # | Issue | Effect |
|---|---|---|
| K3 | No `Range` resume. `tmpFile.outputStream()` truncates. | Any interruption restarts the file at byte 0. A slow download can livelock, never finishing. |

### High — throughput and reliability

| # | Issue | Effect |
|---|---|---|
| K4 | No `connectTimeout` or `readTimeout`. Both default to 0 = infinite. | A stalled connection hangs forever with no error and no retry. Progress sits at exactly 1%. |
| K5 | `setExpedited` with `RUN_AS_NON_EXPEDITED_WORK_REQUEST`. Expedited quota is per-app and finite. | Works for the first few downloads, then silently degrades to a deferred, throttled background job. |
| K6 | `KEEP` plus exponential retry backoff. | New download requests are silently dropped for up to 5 h. The "Downloading…" toast claims otherwise. |
| K7 | `setForeground()` is never called, so the worker is subject to the ~10-minute job execution limit. | Slow downloads are cut off mid-file and restart from 0 (compounds K3). |

### Medium — correctness and UX

| # | Issue | Effect |
|---|---|---|
| K8 | `connection.contentLength` is an `Int` and returns `-1` for chunked or gzipped responses. Progress only updates when `totalBytes > 0`. | Healthy downloads sit at 1% then jump to complete. |
| K9 | `HttpURLConnection` will not follow HTTP↔HTTPS redirects. Podcast prefix URLs redirect constantly. | The redirect page is written and renamed to `.mp3`. A tiny, broken file looks complete. |
| K11 | `markError` does not reset `downloadProgress`. The watch UI has no error state. | A failed episode shows a stale percentage on the watch and `0` / `error` on the phone. |
| K12 | `enqueueEpisodeDownload` ignores its `episode` argument. | Tapping an episode does not prioritize it. |
| K13 | The download loop never checks `isStopped`, and a blocking `read()` is not cancellable. | A stopped worker keeps writing after WorkManager has rescheduled it. |

### Documentation drift

| # | Issue |
|---|---|
| K14 | `datalayer.ts` says the contract is mirrored in two places. It is three — `WearDataLayerModule.kt` has its own private copies. |
| K15 | `datalayer.ts` documents `REQUEST_SYNC` as "Watch -> phone". The phone sends it. |

### Deferred

`docs/todo.md` tracks understood-but-unscheduled work in this area: T1 (migrate to OkHttp),
T2 (K9, cross-protocol redirects), T3 (deterministic download start), T4 (K14/K15, contract
duplication).

---

## 8. Change log

Newest first. Add an entry whenever sync behavior changes.

### 2026-08-02 — Phase 1: persist watch state

Fixes **K1**, **K2**, **K10**. See `pr-plan.md` for the full phase plan.

- `SyncedWatchEpisodes` now persists to `SharedPreferences("watch-episodes")`. Added
  `init`, `load`, and an internal `persist` called from every mutator. Progress writes are
  throttled to every 5%.
- Added the load contract: `load(context)` is called by `EpisodeDownloadWorker.doWork`,
  both `DataLayerListenerService` message branches, `onDataChanged`, and
  `MainActivity.onCreate`. First call wins, so a stale disk copy cannot clobber live state.
- `update()` now carries `error` through. Failures are sticky; retry is manual as of Phase 3.
- `doWork` returns `Result.failure()` — not `success()` — when no persisted list exists.
- `reportStatus` returns early on an empty list instead of broadcasting `[]`.
- Restore validates paths on disk. A record claiming a completed file that no longer exists
  resets to `0%` instead of reporting a phantom `100%`.
- Mutators use `MutableStateFlow.update {}` rather than read-modify-write on `.value`, so
  concurrent updates from the worker thread and the UI thread cannot lose each other.

Verified on the Wear emulator against the paired phone emulator: a force-stopped watch app
reported all 10 episode statuses from a fresh process, and a worker in that fresh process
downloaded a deleted episode using a list restored entirely from disk.

### 2026-08-02 — initial document

Documented existing behavior. No code changes. Catalogued K1–K15 above.
