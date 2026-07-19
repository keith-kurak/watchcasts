import { Platform } from "react-native";
import { requireNativeModule } from "expo-modules-core";

interface WearNode {
  id: string;
  displayName: string;
}

interface WearDataLayerModuleType {
  syncSubscriptions(json: string): Promise<void>;
  syncWatchEpisodes(json: string): Promise<void>;
  getConnectedNodes(): Promise<WearNode[]>;
}

const noop: WearDataLayerModuleType = {
  syncSubscriptions: async () => {},
  syncWatchEpisodes: async () => {},
  getConnectedNodes: async () => [],
};

const mod: WearDataLayerModuleType =
  Platform.OS === "android"
    ? requireNativeModule<WearDataLayerModuleType>("WearDataLayerModule")
    : noop;

export const { syncSubscriptions, syncWatchEpisodes, getConnectedNodes } = mod;
