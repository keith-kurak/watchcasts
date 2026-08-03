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
} as const;

/** MessageClient paths (fire-and-forget RPC — transient). */
export const MessagePaths = {
  /** Phone -> watch: "download anything outstanding now." */
  REQUEST_SYNC: "/podcatch/request-sync",
  /** Phone -> watch: "Send me your current download statuses." */
  REQUEST_DOWNLOAD_STATUS: "/podcatch/request-download-status",
  /** Watch -> phone: JSON array of { guid, status, progress }. */
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
   * When an episode ends, start the next one in the queue. Defaults to true.
   *
   * On the watch, "next" is the next episode in WATCH_EPISODES order that is already
   * downloaded. That list is hand-ordered on the phone, so its order is both download
   * priority and playback order.
   */
  playNextEpisode: boolean;
}

/** Advertised via CapabilityClient so each side can discover the other. */
export const Capabilities = {
  PHONE_APP: "podcatch_phone",
  WATCH_APP: "podcatch_watch",
} as const;
