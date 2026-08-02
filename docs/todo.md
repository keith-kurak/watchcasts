# TODO / Backlog

Deferred work that is understood but not scheduled. Each entry states the problem, the
proposed fix, and why it was deferred.

Remove an entry when it ships. If it ships as part of a larger change, note it in the
relevant doc's change log instead — see `docs/watch-sync.md`.

---

## Watch downloads

### T1 — Migrate `EpisodeDownloadWorker` to OkHttp

**Status:** wanted. Approved in principle 2026-08-02.

`EpisodeDownloadWorker` uses `java.net.URL.openConnection()` / `HttpURLConnection`. That API
makes three things we need awkward or impossible:

| Need | With `HttpURLConnection` | With OkHttp |
|---|---|---|
| Timeouts | Two setters, default 0 = infinite | Builder-level, applied once |
| Cross-protocol redirects | Not followed at all (see T2) | `followSslRedirects(true)`, on by default |
| `Range` resume | Manual header plus manual 200-vs-206 handling | Same headers, but a real response API to inspect |
| Retry classification | Bare `IOException` | Typed failures, easier to tell "network gone" from "server error" |
| Connection reuse | Per-connection | Pooled across a queue of episodes |

Connection pooling matters here specifically because the worker downloads a queue of
episodes sequentially, often from the same host.

**Proposed shape:** one shared `OkHttpClient` singleton, injected into the worker. Keep the
`.tmp` + atomic-rename scheme exactly as it is.

**Deferred because:** it is a new dependency and a larger diff than the correctness fixes it
would ride along with. Doing both at once would make it hard to attribute a behavior change
to the right cause. Land the timeout / resume / persistence fixes first, verify them, then
migrate.

**Note:** media3 already pulls OkHttp transitively via its datasource artifacts on some
configurations — check whether the dependency is already on the classpath before adding it
explicitly.

---

### T2 — Follow cross-protocol redirects

**Status:** open. Deferred 2026-08-02. Tracked as K9 in `docs/watch-sync.md`.

`HttpURLConnection` refuses to follow HTTP→HTTPS or HTTPS→HTTP redirects. It returns the
redirect response instead. Podcast prefix and analytics URLs (Megaphone, Podtrac, Chartable,
Supporting Cast) redirect constantly, and often across protocols.

**Failure mode is silent and bad.** The worker writes the redirect page body to
`<guid>.mp3.tmp`, renames it to `<guid>.mp3`, and calls `markDownloaded`. A tiny broken file
looks like a completed download. Playback then fails with no explanation, and because
`localPath != null` the worker will never retry it.

**Two ways to fix:**

1. Manual redirect loop — read `Location` on 3xx, cap at ~5 hops, reject non-http(s) schemes.
   Roughly five lines in the existing connection setup.
2. Fall out of T1 for free, since OkHttp follows these by default.

**Deferred because:** T1 makes it disappear. If T1 slips, do option 1 on its own — this is a
silent data-corruption bug and should not wait indefinitely.

**Worth adding either way:** a sanity check before the atomic rename. Reject a download whose
final size is implausibly small for audio, or whose `Content-Type` is not audio. That catches
this class of failure regardless of which redirect fix lands.

---

### T3 — Deterministic download start when the watch app is open

**Status:** open, low priority. Raised 2026-08-02.

Enqueuing through WorkManager means the OS decides when `doWork` begins. When the app is
open and the network constraint is met this is normally seconds, and reserving expedited work
for user-initiated triggers should make it reliably prompt. But it is not *guaranteed*.

If it still feels slow after the persistence and retry fixes land, the deterministic option
is to start a foreground service directly from `MainActivity`. That is legal while an activity
is visible — the Android 12+ background-start restriction does not apply.

**Cost:** two drivers for one pipeline. Both the service and the WorkManager worker could
target the same `.tmp` file and corrupt it. Requires extracting the download loop into a
shared engine guarded by a process-wide mutex or a file lock.

**Deferred because:** it adds a concurrency hazard to fix a latency problem that may not exist
once the real causes (K1, K6) are fixed. Measure first.

---

## Contract hygiene

### T4 — Reduce Data Layer contract duplication

**Status:** open. Tracked as K14/K15 in `docs/watch-sync.md`.

The paths are mirrored by hand in three files, and `packages/shared/src/datalayer.ts` already
documents this wrongly — it claims two places, and it lists `REQUEST_SYNC` with the wrong
direction.

**Minimum fix:** correct the two comment errors.

**Better fix:** generate `DataLayerContract.kt` and the private constants in
`WearDataLayerModule.kt` from `datalayer.ts` at build time, so drift becomes impossible. A
divergence here breaks sync silently, with no compile error and no runtime error.

**Deferred because:** codegen for one small file is arguably over-engineering. The comment
corrections should just be done next time this area is touched.
