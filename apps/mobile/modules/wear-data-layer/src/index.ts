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
  /**
   * Measured size of the file on the watch, in bytes. 0 means unknown — either the
   * download has not finished, or the watch build predates this field. Callers should
   * fall back to the feed-declared size rather than treating 0 as "no space used".
   */
  sizeBytes: number;
}

/** One episode's listen position as recorded by the watch. Milliseconds. */
export interface WatchPlaybackProgress {
  guid: string;
  positionMs: number;
  durationMs: number;
  /** Epoch milliseconds. Decides which side wins when both have listened. */
  updatedAt: number;
}

type WearDataLayerModuleEvents = {
  onWatchDownloadStatus: (event: { statuses: WatchEpisodeStatus[] }) => void;
  /** The watch asked for an episode to be dropped from the watch queue. */
  onWatchEpisodeRemoved: (event: { guid: string }) => void;
  /**
   * The watch published listen positions.
   *
   * Fires on a live change, and on demand via `requestWatchPlaybackProgress()` for
   * whatever is already replicated — a position recorded while this app was closed
   * arrives that way, and it is the common case.
   */
  onWatchPlaybackProgress: (event: { entries: WatchPlaybackProgress[] }) => void;
};

declare class WearDataLayerModule extends NativeModule<WearDataLayerModuleEvents> {
  syncSubscriptions(json: string): Promise<void>;
  syncWatchEpisodes(json: string): Promise<void>;
  /** Push app settings the watch also honours. Payload is a JSON `SyncedSettings`. */
  syncSettings(json: string): Promise<void>;
  /** Publish this phone's listen positions. Payload is a JSON array of entries. */
  syncPlaybackProgress(json: string): Promise<void>;
  sendForceDownload(): Promise<void>;
  getConnectedNodes(): Promise<WearNode[]>;
  requestWatchDownloadStatus(): Promise<void>;
  /**
   * Ask the watch to retry one failed download.
   *
   * Clears that episode's sticky error flag on the watch and wakes its worker. A failure
   * is sticky by design, so without this the only way back was a long-press on the watch.
   */
  retryWatchEpisode(guid: string): Promise<void>;
  /**
   * Re-emit `onWatchPlaybackProgress` from the watch's already-replicated data item.
   *
   * Call it after subscribing. The listener only sees changes made while this app is
   * running, and the usual case is a position the watch recorded while it was closed.
   */
  requestWatchPlaybackProgress(): Promise<void>;
}

export default requireNativeModule<WearDataLayerModule>("WearDataLayerModule");
