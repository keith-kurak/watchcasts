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
  position: number;
  duration: number;
}
