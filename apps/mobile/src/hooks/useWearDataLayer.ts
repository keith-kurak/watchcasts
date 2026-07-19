import { Platform } from "react-native";
import { requireNativeModule } from "expo-modules-core";

interface WearNode {
  id: string;
  displayName: string;
}

interface WearDataLayerModule {
  syncSubscriptions(json: string): Promise<void>;
  syncWatchEpisodes(json: string): Promise<void>;
  getConnectedNodes(): Promise<WearNode[]>;
}

const noop: WearDataLayerModule = {
  syncSubscriptions: async () => {},
  syncWatchEpisodes: async () => {},
  getConnectedNodes: async () => [],
};

const mod: WearDataLayerModule =
  Platform.OS === "android"
    ? requireNativeModule<WearDataLayerModule>("WearDataLayerModule")
    : noop;

/** Sync the full subscription list to a paired Wear OS device via the Data Layer. */
export async function syncSubscriptions(
  subscriptions: unknown[],
): Promise<void> {
  await mod.syncSubscriptions(JSON.stringify(subscriptions));
}

/** Sync episodes queued for the watch via the Data Layer. */
export async function syncWatchEpisodes(
  episodes: unknown[],
): Promise<void> {
  await mod.syncWatchEpisodes(JSON.stringify(episodes));
}

/** Get the list of currently connected Wear OS nodes (watches). */
export async function getConnectedNodes(): Promise<WearNode[]> {
  return mod.getConnectedNodes();
}
