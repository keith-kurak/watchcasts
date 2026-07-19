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
