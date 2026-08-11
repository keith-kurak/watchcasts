import { Platform } from "react-native";
import WearDataLayerModule from "../../modules/wear-data-layer/src";

const isAndroid = Platform.OS === "android";

/** Sync the full subscription list to a paired Wear OS device via the Data Layer. */
export async function syncSubscriptions(
  subscriptions: unknown[],
): Promise<void> {
  if (!isAndroid) return;
  await WearDataLayerModule.syncSubscriptions(JSON.stringify(subscriptions));
}

/** Sync episodes queued for the watch via the Data Layer. */
export async function syncWatchEpisodes(
  episodes: unknown[],
): Promise<void> {
  if (!isAndroid) return;
  await WearDataLayerModule.syncWatchEpisodes(JSON.stringify(episodes));
}

/** Push settings the watch also honours. */
export async function syncSettings(settings: {
  wifiOnlyDownloads: boolean;
  syncPlaybackProgress: boolean;
}): Promise<void> {
  if (!isAndroid) return;
  await WearDataLayerModule.syncSettings(JSON.stringify(settings));
}

/** Publish this phone's listen positions for the episodes queued on the watch. */
export async function syncPlaybackProgress(
  entries: unknown[],
): Promise<void> {
  if (!isAndroid) return;
  await WearDataLayerModule.syncPlaybackProgress(JSON.stringify(entries));
}

/** Send a message to the watch to force-download any undownloaded episodes. */
export async function sendForceDownload(): Promise<void> {
  if (!isAndroid) return;
  await WearDataLayerModule.sendForceDownload();
}

/** Get the list of currently connected Wear OS nodes (watches). */
export async function getConnectedNodes(): Promise<
  { id: string; displayName: string }[]
> {
  if (!isAndroid) return [];
  return WearDataLayerModule.getConnectedNodes();
}

/** Ask the watch to retry one failed download. */
export async function retryWatchEpisode(guid: string): Promise<void> {
  if (!isAndroid) return;
  await WearDataLayerModule.retryWatchEpisode(guid);
}

/** Ask the watch to send its current download statuses via message. */
export async function requestWatchDownloadStatus(): Promise<void> {
  if (!isAndroid) return;
  await WearDataLayerModule.requestWatchDownloadStatus();
}

// Watch download status is subscribed once for the whole app in
// `@/lib/watch-status-context`. Use `useWatchStatuses` / `useWatchStatus` from there —
// subscribing per component would open one native listener per episode row.
