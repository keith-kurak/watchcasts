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
