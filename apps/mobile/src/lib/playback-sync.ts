import {
  syncPlaybackProgress as pushPlaybackProgress,
  syncSettings,
} from '@/hooks/useWearDataLayer';
import {
  getSyncPlaybackProgress,
  getWatchListPlaybackProgress,
  getWifiOnlyDownloads,
} from '@/lib/storage';

/**
 * Publish every setting the watch honours, read fresh from storage.
 *
 * The settings DataItem is replaced wholesale, so a caller that assembled only the field
 * it had just changed would silently reset the others to whatever the watch defaulted to.
 */
export function publishSettings(): void {
  syncSettings({
    wifiOnlyDownloads: getWifiOnlyDownloads(),
    syncPlaybackProgress: getSyncPlaybackProgress(),
  }).catch(() => {});
}

/**
 * Least time between two progress publishes.
 *
 * The phone saves progress every ~5s while audio plays, and a DataItem put at that rate
 * is pointless traffic over the companion link — nothing on the watch reacts to a
 * position moving in real time. Anything that ends a listening session (pause, switching
 * episode) publishes immediately instead, so the value that matters is never delayed.
 */
const PUBLISH_INTERVAL_MS = 30_000;

let lastPublishedAt = 0;
let pendingPublish: ReturnType<typeof setTimeout> | null = null;

/**
 * Publish the phone's listen positions for the episodes queued on the watch.
 *
 * @param immediate skip the throttle. Use it when the position just became final —
 * pausing, switching episodes, or queueing a new episode for the watch.
 */
export function publishPlaybackProgress({ immediate = false } = {}): void {
  if (!getSyncPlaybackProgress()) return;

  const elapsed = Date.now() - lastPublishedAt;
  if (!immediate && elapsed < PUBLISH_INTERVAL_MS) {
    // Trail the throttle window rather than dropping the call. Without this, a pause that
    // lands inside the window would be the last event of the session and never published.
    if (pendingPublish) return;
    pendingPublish = setTimeout(() => {
      pendingPublish = null;
      publishPlaybackProgress({ immediate: true });
    }, PUBLISH_INTERVAL_MS - elapsed);
    return;
  }

  if (pendingPublish) {
    clearTimeout(pendingPublish);
    pendingPublish = null;
  }
  lastPublishedAt = Date.now();

  const entries = getWatchListPlaybackProgress();
  // An empty array is still worth publishing: it is how the watch learns the phone has
  // nothing to say about episodes that just left the queue.
  pushPlaybackProgress(entries).catch(() => {});
}
