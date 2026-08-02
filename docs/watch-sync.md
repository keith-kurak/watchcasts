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
| `/podcatch/settings` | `{ items, updatedAt }` | phone → watch |

`items` is a JSON **string** under the DataMap key `items`. `updatedAt` is a long under `updatedAt`.

### MessageClient paths — transient RPC

Messages are fire-and-forget. They are dropped if the peer is unreachable.

| Path | Direction | Payload | Sent by |
|---|---|---|---|
| `/podcatch/request-sync` | **phone → watch** | empty | `sendForceDownload()` |
| `/podcatch/request-download-status` | phone → watch | empty | `requestWatchDownloadStatus()` |
| `/podcatch/watch-download-status` | watch → phone | JSON array | `WatchDownloadStatusReporter` |

### Settings

`/podcatch/settings` carries settings the phone owns and the watch honours. Payload today:

```json
{ "wifiOnlyDownloads": true }
```

The watch stores it in `SharedPreferences("watch-settings")` via `SyncedSettings`, for the
same reason the episode list is persisted — a worker can run in a fresh process. Its default
(`true`) matches the phone's, so the two agree before any sync has happened.

`SyncedSettings.load()` is called from `MainActivity.onCreate`, the settings branch of
`DataLayerListenerService`, `WatchDownloadStatusReporter`, and
`EpisodeDownloadWorker.buildRequest`. `MainActivity.onResume` also reads the replicated
DataItem directly, so a freshly installed watch picks up an existing preference.

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
| `retryEpisodeDownload` (`MainActivity.kt`) | User chose Retry from the long-press menu |

All go through `EpisodeDownloadWorker.buildRequest`, so the network constraint cannot drift
between them: `NetworkType.UNMETERED` when Wi-Fi-only downloads are on, `CONNECTED` otherwise.

**The constraint is fixed at enqueue time.** A request queued under the old setting would
outlive a change to it, so the settings branch of `DataLayerListenerService` re-enqueues with
`ExistingWorkPolicy.REPLACE`. Replacing a running worker is safe — partial downloads resume
from their `.tmp`.

The sites differ in whether they ask for expedited work.

Expedited quota is finite and per-app, so it is **reserved for triggers where a person is
waiting.** Spending it on every automatic list sync is what left none for a deliberate
request — the original cause of "it works for the first few, then stops".

| Trigger | Expedited? |
|---|---|
| `onDataChanged` — phone pushed a list | No — automatic and frequent |
| `request-sync` — force-download from the phone | Yes |
| `MainActivity` — watch app opened | Yes |
| Long-press retry | Yes |

`KEEP` means an enqueue is **discarded** if work with that name already exists in any
non-terminal state. That is safe now that auto-retry and its backoff are gone: a running
worker re-reads the episode list on every loop pass, so clearing an `error` flag makes that
episode eligible without needing to replace the work.

### The worker

`EpisodeDownloadWorker` is a `CoroutineWorker` running on `Dispatchers.IO`.

1. Calls `SyncedWatchEpisodes.load()`, then ensures `<filesDir>/episodes` exists
2. If the list is empty: returns `success()` when `hasStoredList` is true (genuinely nothing
   queued), or `failure()` when it is false (no persisted state — reporting success here
   would silently swallow every queued download)
3. Calls `downloadArtwork()` — caches every missing artwork image; failures are logged and skipped
4. Loops: takes the **first** episode where `localPath == null && !error && audioUrl.isNotBlank()`
5. Resumes from `<guid>.mp3.tmp` if one exists (see below), else starts fresh
6. Streams the body to `<guid>.mp3.tmp` in 8 KB chunks
7. Renames `.tmp` → `.mp3` on completion, then calls `markDownloaded`
8. Breaks out of the loop when no eligible episode remains, and returns `Result.success()`

Ordering is the phone's watch-list order. There is no priority and no parallelism — strictly one file at a time.

### Long-running worker

`doWork` calls `setForeground(getForegroundInfo())` before doing anything else. This promotes
the worker to a foreground service for its whole run, so it is not subject to the ~10 minute
job execution limit. Without it, a slow download is killed mid-file — and before resume
existed, that meant restarting at byte 0 forever.

Requirements, all of which must agree:

- `FOREGROUND_SERVICE_DATA_SYNC` permission in the manifest
- `androidx.work.impl.foreground.SystemForegroundService` declared with
  `android:foregroundServiceType="dataSync"` via `tools:node="merge"`
- `ForegroundInfo` built with `ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC`

Promotion failure is caught and logged, not fatal. The work still runs at background
priority, and resume means a truncated attempt is no longer wasted.

On Android 15 a `dataSync` service is capped at 6 cumulative hours per 24. WorkManager 2.10.0
handles that timeout internally.

### Resume

Partial downloads persist in `<guid>.mp3.tmp` across attempts, including failures.

- If a `.tmp` exists, the request carries `Range: bytes=<size>-`
- `206 Partial Content` → append to the existing file, seeding the byte counter
- `200 OK` → the server ignored the range, so truncate and start over
- Anything else → throw, so the episode is marked failed

`update()` deletes the `.tmp` when an episode leaves the watch list, since partials otherwise
outlive their episode.

### Progress reporting

- **Watch-local** — every whole-percent change calls `updateProgress`
- **To the phone** — throttled to roughly every 5%

Total size comes from `getContentLengthLong()` plus any resumed offset. The `Long` variant
matters because the `Int` one silently wraps above 2 GB.

When the server sends no `Content-Length` — chunked or gzipped responses — no percentage can
be derived. Progress is then set to `EpisodeDownloadWorker.INDETERMINATE` (`-1`), which the
reporter maps to status `downloading` with progress `0`. The phone renders a percentage only
when progress is `> 0`, so such a download reads as "Downloading…" with no number, and the
watch shows `…`. Previously it froze at 1% for the entire transfer.

### Failure handling — manual retry only

Any exception in the download loop:

1. Calls `markError(guid)`, which also resets `downloadProgress` to `0`
2. Reports status to the phone
3. **Continues to the next episode.** The worker still finishes with `success()`

The partial `.tmp` is deliberately kept so a later attempt can resume from it.

There is **no auto-retry**. A failure is sticky: `error` persists to disk and survives phone
syncs, so the worker skips that episode until a person clears it.

This replaced a `Result.retry()` that backed off exponentially toward a 5 hour cap while
`KEEP` silently discarded every new download request in the meantime.

**Known trade-off:** losing network mid-queue fails every remaining episode, each needing a
manual retry. The `NetworkType.CONNECTED` constraint prevents the worker *starting* without
network, but not losing it mid-run. If this becomes annoying, treat the `IOException`
subtypes that mean "network went away" as retryable and everything else as a hard error.

### Retrying

Downloading is automatic. The only manual download action is retrying a failure.

- A failed episode shows a red error icon in the watch list
- **Long-press** it to open a menu with **Retry download** and **Cancel**
- Retry calls `SyncedWatchEpisodes.clearError(guid)`, persists, then enqueues the worker

Tapping a non-downloaded episode does nothing. It used to enqueue a download and show a
"Downloading…" toast that lied whenever `KEEP` discarded the request.

Wear Compose Material 1.4 has no `Card(onLongClick)`, so the gestures live in a
`combinedClickable` on the `Row` inside the card. A child clickable wins over the Card's own,
which is why `Card(onClick = {})` is a deliberate no-op.

---

## 6. Watch → phone: download status

`WatchDownloadStatusReporter.reportStatus(context)` reads `SyncedWatchEpisodes.episodes.value` and sends one JSON array to every connected node.

Per episode it derives:

| Field | Rule |
|---|---|
| `status` | `complete` if `localPath != null`, else `error` if `error`, else `downloading` if `downloadProgress != 0`, else `waiting-wifi` if held by the Wi-Fi-only setting, else `pending` |
| `progress` | `100` if complete, `0` if error, else `max(downloadProgress, 0)` |

`waiting-wifi` exists so the phone can say *why* nothing is happening. The watch derives it
from `SyncedSettings.isWaitingForWifi`, which checks `NET_CAPABILITY_NOT_METERED` — the same
signal WorkManager's `UNMETERED` constraint uses, so the reported status and the constraint
that actually gates the work cannot disagree.

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
| ~~K3~~ | No `Range` resume; any interruption restarted the file at byte 0 | Phase 2 |
| ~~K4~~ | No `connectTimeout` or `readTimeout`, so a stalled connection hung forever | Phase 2 |
| ~~K5~~ | Expedited quota spent on automatic syncs, leaving none for user-initiated requests | Phase 2 |
| ~~K7~~ | `setForeground()` never called, so downloads were cut off by the execution limit | Phase 2 |
| ~~K8~~ | Progress depended on the `Int` `contentLength`, freezing at 1% when absent | Phase 2 |
| ~~K13~~ | The download loop never checked `isStopped` | Phase 2 |
| ~~K6~~ | `KEEP` plus exponential retry backoff silently dropped requests for up to 5 h | Phase 3 |
| ~~K11~~ | `markError` left a stale percentage and the watch had no error state | Phase 3 |
| ~~K12~~ | Tapping an episode enqueued a download it could not prioritize, behind a toast that lied | Phase 3 |

### Medium — correctness

| # | Issue | Effect |
|---|---|---|
| K9 | `HttpURLConnection` will not follow HTTP↔HTTPS redirects. Podcast prefix URLs redirect constantly. | The redirect page is written and renamed to `.mp3`. A tiny, broken file looks complete. |

K9 is deferred as T2, and disappears if T1 (OkHttp) lands first.

### Documentation drift

| # | Issue | Fixed in |
|---|---|---|
| ~~K14~~ | `datalayer.ts` claimed the contract was mirrored in two places; it is three | Wi-Fi-only setting |
| ~~K15~~ | `datalayer.ts` documented `REQUEST_SYNC` as "Watch -> phone"; the phone sends it | Wi-Fi-only setting |

The comments are corrected, but the duplication itself remains. T4 in `docs/todo.md` still
tracks generating the two Kotlin mirrors from `datalayer.ts`.

### Deferred

`docs/todo.md` tracks understood-but-unscheduled work in this area: T1 (migrate to OkHttp),
T2 (K9, cross-protocol redirects), T3 (deterministic download start), T4 (K14/K15, contract
duplication).

---

## 8. Change log

Newest first. Add an entry whenever sync behavior changes.

### 2026-08-02 — Wi-Fi-only downloads

New setting, owned by the phone and honoured by both apps. Also fixes **K14** and **K15**.

- New Data Layer path `/podcatch/settings`, mirrored into all three contract files. Payload
  is `{ wifiOnlyDownloads: boolean }`, default `true` on both sides.
- Watch: new `SyncedSettings`, persisted to `SharedPreferences("watch-settings")`.
- Watch: all enqueue sites now build their request through
  `EpisodeDownloadWorker.buildRequest`, which picks `UNMETERED` vs `CONNECTED`. A settings
  change re-enqueues with `REPLACE`, since the constraint is fixed at enqueue time.
- New wire status `waiting-wifi`, derived from `NET_CAPABILITY_NOT_METERED` so it agrees
  with the WorkManager constraint. Rendered as "Waiting for Wi-Fi" on the phone and a
  wifi-off icon on the watch.
- Phone: gated in `DownloadProvider` using `expo-network` (new dependency). Queued items
  stay `pending` and drain automatically when an unmetered network returns.
- Phone: the mount-time cleanup no longer marks `pending` items as errored — with this
  setting, `pending` is a legitimate resting state.

Verified end to end on both emulators: toggling the switch wrote `wifiOnlyDownloads=false`
to the watch's prefs; with Wi-Fi disabled a queued episode showed "Waiting for Wi-Fi" and did
not download; re-enabling Wi-Fi drained the queue without further input.

### 2026-08-02 — Phase 3: manual retry only

Fixes **K6**, **K11**, **K12**. See `pr-plan.md`.

- No auto-retry. A download failure marks the episode and the queue moves on; the worker
  still finishes with `success()`. Removes the exponential backoff that `KEEP` turned into
  silently-dropped requests.
- `markError` resets `downloadProgress` to `0`, and added `clearError` for manual retry.
- Failed episodes show a red error icon in the watch list, distinct from "not downloaded
  yet", so the retry affordance is discoverable.
- **Long-press** a non-downloaded episode for a menu with **Retry download** / **Cancel**.
  Implemented with `combinedClickable` on the `Row` inside the card — Wear Compose Material
  1.4 has no `Card(onLongClick)`, and a child clickable wins over the Card's own.
- Removed tap-to-download and its "Downloading…" toast. `enqueueEpisodeDownload` is gone,
  replaced by `retryEpisodeDownload`.

Verified on the Wear emulator: a seeded failure survived a phone sync and the worker skipped
it; long-press opened the menu; Retry cleared the flag and the episode downloaded to a
byte-exact file; a plain tap on a failed episode started nothing.

### 2026-08-02 — Phase 2: download robustness

Fixes **K3**, **K4**, **K5**, **K7**, **K8**, **K13**. See `pr-plan.md`.

- `connectTimeout = 15s`, `readTimeout = 30s`. Both previously defaulted to 0 = infinite.
- `Range`-based resume. Partial `.tmp` files now persist across attempts, including
  failures. A `206` appends; a `200` means the server ignored the range, so the partial is
  discarded and the download restarts. `update()` deletes the `.tmp` when an episode leaves
  the watch list.
- `setForeground()` at the top of `doWork`, with `FOREGROUND_SERVICE_DATA_SYNC` and a
  `dataSync` type on WorkManager's `SystemForegroundService`. Removes the ~10 minute
  execution limit. Promotion failure is logged, not fatal.
- Progress uses `getContentLengthLong()` plus the resumed offset. When the server sends no
  `Content-Length`, progress is `INDETERMINATE` (`-1`) and the UI shows activity without a
  number instead of freezing at 1%.
- Expedited work reallocated: automatic Data Layer syncs no longer spend quota; the phone's
  force-download, opening the watch app, and episode taps still do.
- `isStopped` is checked per loop pass and per read. A stopped worker returns `retry()` and
  keeps its partial file.
- Non-2xx responses now throw instead of being written to disk as if they were audio.

Verified on the Wear emulator: killed a download at 37,644,971 / 108,552,377 bytes and the
next attempt logged `Resuming ... at 37644971 bytes`, finishing to a byte-exact file with a
valid ID3 header. `dumpsys` confirmed `isForeground=true types=0x1` during the run. Log
confirmed `expedited=true` for the phone's sync button and `expedited=false` for the
automatic list sync.

Not exercised end to end: the `INDETERMINATE` path. A synthetic chunked-encoding episode
cannot survive on the watch, because every trigger resyncs the list from the phone and drops
it. The reachable half of that change was verified — pending episodes still report `pending`,
not `downloading`, under the reporter's new `!= 0` test.

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
