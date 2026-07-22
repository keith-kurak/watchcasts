// ─────────────────────────────────────────────────────────────────────────────
// WEARABLE DATA LAYER CONTRACT
//
// These paths/keys define how the phone app and the Wear OS app talk over the
// Wearable Data Layer API. Because the two apps are written in different
// languages, this contract CANNOT be imported by the watch — it is mirrored by
// hand in:
//     apps/watch/app/src/main/java/dev/podcatch/app/data/DataLayerContract.kt
//
// Any change here must be reflected there (and vice versa), or sync silently
// breaks. This is the one piece of "shared code" that lives in two places on
// purpose.
// ─────────────────────────────────────────────────────────────────────────────

/** DataClient item paths (DataItem replication — persistent, eventually consistent). */
export const DataPaths = {
  /** Full subscription list, synced phone -> watch. Payload: { items: Subscription[] }. */
  SUBSCRIPTIONS: "/podcatch/subscriptions",
  /** Episodes explicitly queued for the watch, synced phone -> watch. Payload: { items: WatchEpisode[] }. */
  WATCH_EPISODES: "/podcatch/watch-episodes",
} as const;

/** MessageClient paths (fire-and-forget RPC — transient). */
export const MessagePaths = {
  /** Watch -> phone: "I'm on Wi-Fi + charging, send me anything new to download." */
  REQUEST_SYNC: "/podcatch/request-sync",
  /** Phone -> watch: "Send me your current download statuses." */
  REQUEST_DOWNLOAD_STATUS: "/podcatch/request-download-status",
  /** Watch -> phone: JSON array of { guid, status, progress }. */
  WATCH_DOWNLOAD_STATUS: "/podcatch/watch-download-status",
} as const;

/** Keys used inside a DataMap for the SUBSCRIPTIONS data item. */
export const DataKeys = {
  ITEMS: "items",
  UPDATED_AT: "updatedAt",
} as const;

/** Advertised via CapabilityClient so each side can discover the other. */
export const Capabilities = {
  PHONE_APP: "podcatch_phone",
  WATCH_APP: "podcatch_watch",
} as const;
