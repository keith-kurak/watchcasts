import { NativeModule, requireNativeModule } from "expo";

interface WearNode {
  id: string;
  displayName: string;
}

declare class WearDataLayerModule extends NativeModule<{}> {
  syncSubscriptions(json: string): Promise<void>;
  syncWatchEpisodes(json: string): Promise<void>;
  sendForceDownload(): Promise<void>;
  getConnectedNodes(): Promise<WearNode[]>;
}

export default requireNativeModule<WearDataLayerModule>("WearDataLayerModule");
