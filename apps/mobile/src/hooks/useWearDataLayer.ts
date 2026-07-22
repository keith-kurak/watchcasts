import { useEffect, useState } from "react";
import { Platform } from "react-native";
import WearDataLayerModule, {
  type WatchEpisodeStatus,
} from "../../modules/wear-data-layer/src";

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

/** Get the current watch download statuses (one-shot read). */
export async function getWatchDownloadStatus(): Promise<WatchEpisodeStatus[]> {
  if (!isAndroid) return [];
  return WearDataLayerModule.getWatchDownloadStatus();
}

/** Subscribe to live watch download status updates. Returns a map of guid -> status for easy lookup. */
export function useWatchDownloadStatusListener(): Map<string, WatchEpisodeStatus> {
  const [statuses, setStatuses] = useState<Map<string, WatchEpisodeStatus>>(new Map());

  useEffect(() => {
    if (!isAndroid) return;

    // Load initial state
    getWatchDownloadStatus().then((list) => {
      setStatuses(new Map(list.map((s) => [s.guid, s])));
    }).catch(() => {});

    // Listen for live updates
    const subscription = WearDataLayerModule.addListener(
      "onWatchDownloadStatus",
      (event: { statuses: WatchEpisodeStatus[] }) => {
        setStatuses(new Map(event.statuses.map((s) => [s.guid, s])));
      },
    );
    return () => subscription.remove();
  }, []);

  return statuses;
}
