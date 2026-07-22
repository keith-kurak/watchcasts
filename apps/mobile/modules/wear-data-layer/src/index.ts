import { NativeModule, requireNativeModule } from "expo";

interface WearNode {
  id: string;
  displayName: string;
}

export interface WatchEpisodeStatus {
  guid: string;
  status: "pending" | "downloading" | "complete" | "error";
  progress: number;
}

type WearDataLayerModuleEvents = {
  onWatchDownloadStatus: (event: { statuses: WatchEpisodeStatus[] }) => void;
};

declare class WearDataLayerModule extends NativeModule<WearDataLayerModuleEvents> {
  syncSubscriptions(json: string): Promise<void>;
  syncWatchEpisodes(json: string): Promise<void>;
  sendForceDownload(): Promise<void>;
  getConnectedNodes(): Promise<WearNode[]>;
  requestWatchDownloadStatus(): Promise<void>;
}

export default requireNativeModule<WearDataLayerModule>("WearDataLayerModule");
