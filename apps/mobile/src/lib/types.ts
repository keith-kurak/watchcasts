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

export interface QueueItem {
  podcastId: string;
  episodeGuid: string;
}
