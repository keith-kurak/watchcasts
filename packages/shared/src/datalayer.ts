// ─────────────────────────────────────────────────────────────────────────────
// WEARABLE DATA LAYER CONTRACT
//
// These paths/keys define how the phone app and the Wear OS app talk over the
// Wearable Data Layer API. Because the two apps are written in different
// languages, this contract CANNOT be imported by either native side — it is
// mirrored BY HAND in TWO other files:
//     apps/watch/android/app/src/main/java/dev/podcatch/app/data/DataLayerContract.kt
//     apps/mobile/modules/wear-data-layer/android/src/main/java/expo/modules/weardatalayer/WearDataLayerModule.kt
//
// Any change here must be reflected in BOTH (and vice versa), or sync silently
// breaks — no compile error, no runtime error, just messages that never arrive.
// This is the one piece of "shared code" that lives in three places on purpose.
//
// See docs/watch-sync.md.
// ─────────────────────────────────────────────────────────────────────────────

/** DataClient item paths (DataItem replication — persistent, eventually consistent). */
export const DataPaths = {
  /** Full subscription list, synced phone -> watch. Payload: { items: Subscription[] }. */
  SUBSCRIPTIONS: "/podcatch/subscriptions",
  /** Episodes explicitly queued for the watch, synced phone -> watch. Payload: { items: WatchEpisode[] }. */
  WATCH_EPISODES: "/podcatch/watch-episodes",
  /** App settings that both sides honour, synced phone -> watch. Payload: { items: Settings }. */
  SETTINGS: "/podcatch/settings",
  /**
   * Listen positions the phone has recorded, phone -> watch. Payload:
   * `{ items: PlaybackProgressEntry[] }`.
   *
   * Deliberately a DataItem and not a message. The device you listened on is usually the
   * one that is *not* connected — a watch on a run, a phone left at home — so the update
   * has to survive the disconnection and replicate on reconnect.
   */
  PLAYBACK_PROGRESS_PHONE: "/podcatch/playback-progress/phone",
  /**
   * Listen positions the watch has recorded, watch -> phone. Same payload as
   * [PLAYBACK_PROGRESS_PHONE].
   *
   * One path per writer rather than one shared path. Both nodes can write a DataItem, but
   * two writers on one path means each overwrites the other's copy and the loser's
   * positions are gone before anyone merges them.
   */
  PLAYBACK_PROGRESS_WATCH: "/podcatch/playback-progress/watch",
} as const;

/** MessageClient paths (fire-and-forget RPC — transient). */
export const MessagePaths = {
  /** Phone -> watch: "download anything outstanding now." */
  REQUEST_SYNC: "/podcatch/request-sync",
  /** Phone -> watch: "Send me your current download statuses." */
  REQUEST_DOWNLOAD_STATUS: "/podcatch/request-download-status",
  /**
   * Watch -> phone: JSON array of { guid, status, progress, sizeBytes }.
   *
   * `status` is one of: pending | downloading | complete | error | waiting-wifi |
   * halted | no-space. See WatchEpisodeStatus in
   * apps/mobile/modules/wear-data-layer/src/index.ts for what each one means.
   *
   * `sizeBytes` is the measured size of the downloaded file on the watch. It is 0 for an
   * episode that has not finished downloading, and 0 from watch builds predating the
   * field — both mean "unknown", so the phone falls back to the size the feed declared.
   */
  WATCH_DOWNLOAD_STATUS: "/podcatch/watch-download-status",
  /**
   * Watch -> phone: "drop this episode from the watch queue." Payload is the raw
   * episode guid as UTF-8.
   *
   * The only write the watch makes to phone-owned state. The phone stays the source of
   * truth: it removes the episode and re-publishes the list, so if this message is lost
   * the next sync simply restores the episode.
   */
  REMOVE_WATCH_EPISODE: "/podcatch/remove-watch-episode",
  /**
   * Phone -> watch: "try this failed download again." Payload is the raw episode guid
   * as UTF-8.
   *
   * Clears the episode's sticky error flag and wakes the download worker. Needed because
   * a failure is deliberately sticky — the worker skips errored episodes until something
   * clears them — and until now the only thing that could was a long-press on the watch.
   */
  RETRY_WATCH_EPISODE: "/podcatch/retry-watch-episode",
} as const;

/** Keys used inside a DataMap for the SUBSCRIPTIONS data item. */
export const DataKeys = {
  ITEMS: "items",
  UPDATED_AT: "updatedAt",
} as const;

/** Payload of the SETTINGS data item. */
export interface SyncedSettings {
  /** Only download episodes over an unmetered network. Defaults to true. */
  wifiOnlyDownloads: boolean;
  /**
   * Keep the listen position of an episode the same on the phone and the watch.
   * Defaults to true.
   *
   * Both sides honour it, and both sides check it before *publishing* as well as before
   * applying. A device with it off neither sends nor accepts positions.
   */
  syncPlaybackProgress: boolean;
}

/**
 * One episode's listen position, as carried by both PLAYBACK_PROGRESS paths.
 *
 * Milliseconds on the wire in both directions. The watch works in milliseconds and the
 * phone in seconds, so one of them has to convert; picking a wire unit means it is always
 * the same one.
 */
export interface PlaybackProgressEntry {
  guid: string;
  positionMs: number;
  /** 0 when the device has not learned the episode's duration yet. */
  durationMs: number;
  /**
   * When this position was recorded, in epoch milliseconds.
   *
   * This is the entire conflict resolution rule: on both sides, an incoming entry is
   * applied only when it is newer than the local one. The DataMap's own `updatedAt` says
   * when the *batch* was published and cannot decide a per-episode conflict.
   *
   * The two clocks are the phone's and the watch's. Wear OS keeps a paired watch's clock
   * synced to its phone, so they agree closely enough for a rule whose granularity is
   * "which listening session happened later".
   */
  updatedAt: number;
}

/** Advertised via CapabilityClient so each side can discover the other. */
export const Capabilities = {
  PHONE_APP: "podcatch_phone",
  WATCH_APP: "podcatch_watch",
} as const;
