export interface Podcast {
  id: string;
  feedUrl: string;
  title: string;
  author?: string;
  description?: string;
  artworkUrl?: string;
}

export interface Episode {
  guid: string;
  title: string;
  description?: string;
  pubDate?: string;
  audioUrl?: string;
  duration?: string;
  imageUrl?: string;
  /**
   * Size of the audio enclosure in bytes, as declared by the feed. Absent when the
   * feed omits or malforms `enclosure/@length`, which is common enough that every
   * caller must handle it — a missing size counts as zero against storage limits.
   */
  sizeBytes?: number;
}

export type DownloadStatus = 'pending' | 'downloading' | 'complete' | 'error';

export interface DownloadItem {
  podcastId: string;
  episodeGuid: string;
  status: DownloadStatus;
  localPath?: string;
}

export interface WatchItem {
  podcastId: string;
  episodeGuid: string;
}

export interface PlaybackProgress {
  /** Seconds. The wire format for phone <-> watch sync is milliseconds. */
  position: number;
  duration: number;
  /**
   * When this position was recorded, in epoch milliseconds.
   *
   * Decides which side wins when the phone and the watch have both listened to the same
   * episode. Absent on entries written before progress sync existed — `getPlaybackProgress`
   * substitutes a single per-install epoch for those rather than leaving them at 0, which
   * would let any watch position beat every position recorded before the upgrade.
   */
  updatedAt?: number;
}
