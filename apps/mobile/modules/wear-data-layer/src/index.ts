import { NativeModule, requireNativeModule } from "expo";

interface WearNode {
  id: string;
  displayName: string;
}

export interface WatchEpisodeStatus {
  guid: string;
  /**
   * `waiting-wifi` means the watch has the episode queued but is holding off because
   * Wi-Fi-only downloads are enabled and it is not on an unmetered network.
   */
  status: "pending" | "downloading" | "complete" | "error" | "waiting-wifi";
  progress: number;
}

type WearDataLayerModuleEvents = {
  onWatchDownloadStatus: (event: { statuses: WatchEpisodeStatus[] }) => void;
  /** The watch asked for an episode to be dropped from the watch queue. */
  onWatchEpisodeRemoved: (event: { guid: string }) => void;
};

declare class WearDataLayerModule extends NativeModule<WearDataLayerModuleEvents> {
  syncSubscriptions(json: string): Promise<void>;
  syncWatchEpisodes(json: string): Promise<void>;
  /** Push app settings the watch also honours. Payload is a JSON `SyncedSettings`. */
  syncSettings(json: string): Promise<void>;
  sendForceDownload(): Promise<void>;
  getConnectedNodes(): Promise<WearNode[]>;
  requestWatchDownloadStatus(): Promise<void>;
}

export default requireNativeModule<WearDataLayerModule>("WearDataLayerModule");
