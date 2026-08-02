import { Directory, File, Paths } from 'expo-file-system';
import { Storage } from 'expo-sqlite/kv-store';

import type { DownloadItem, Episode, PlaybackProgress, Podcast, WatchItem } from './types';

const SUBSCRIPTIONS_KEY = 'subscriptions';
const DOWNLOADS_KEY = 'downloads';
const WATCH_LIST_KEY = 'watchList';
const WIFI_ONLY_KEY = 'wifiOnlyDownloads';

function episodesKey(podcastId: string) {
  return `episodes:${podcastId}`;
}

export const episodesDir = new Directory(Paths.document, 'episodes');

export function getDownloadPath(episodeGuid: string): string {
  return new File(episodesDir, `${episodeGuid}.mp3`).uri;
}

export function getSubscriptions(): Podcast[] {
  const raw = Storage.getItemSync(SUBSCRIPTIONS_KEY);
  if (!raw) return [];
  return JSON.parse(raw) as Podcast[];
}

export function addSubscription(podcast: Podcast): void {
  const subs = getSubscriptions();
  if (subs.some((s) => s.id === podcast.id)) return;
  subs.push(podcast);
  Storage.setItemSync(SUBSCRIPTIONS_KEY, JSON.stringify(subs));
}

export function removeSubscription(podcastId: string): void {
  const subs = getSubscriptions().filter((s) => s.id !== podcastId);
  Storage.setItemSync(SUBSCRIPTIONS_KEY, JSON.stringify(subs));
  Storage.removeItemSync(episodesKey(podcastId));
}

export function getCachedEpisodes(podcastId: string): Episode[] | null {
  const raw = Storage.getItemSync(episodesKey(podcastId));
  if (!raw) return null;
  return JSON.parse(raw) as Episode[];
}

export function setCachedEpisodes(
  podcastId: string,
  episodes: Episode[],
): void {
  Storage.setItemSync(episodesKey(podcastId), JSON.stringify(episodes));
}

export function getDownloads(): DownloadItem[] {
  const raw = Storage.getItemSync(DOWNLOADS_KEY);
  if (!raw) return [];
  return JSON.parse(raw) as DownloadItem[];
}

export function addToDownloads(podcastId: string, episodeGuid: string): void {
  const downloads = getDownloads();
  if (downloads.some((d) => d.episodeGuid === episodeGuid)) return;
  downloads.push({ podcastId, episodeGuid, status: 'pending' });
  Storage.setItemSync(DOWNLOADS_KEY, JSON.stringify(downloads));
}

export function updateDownloadItem(
  episodeGuid: string,
  updates: Partial<Pick<DownloadItem, 'status' | 'localPath'>>,
): void {
  const downloads = getDownloads();
  const idx = downloads.findIndex((d) => d.episodeGuid === episodeGuid);
  if (idx === -1) return;
  downloads[idx] = { ...downloads[idx], ...updates };
  Storage.setItemSync(DOWNLOADS_KEY, JSON.stringify(downloads));
}

export function removeFromDownloads(episodeGuid: string): void {
  const downloads = getDownloads();
  const item = downloads.find((d) => d.episodeGuid === episodeGuid);
  if (item?.localPath) {
    try {
      const file = new File(item.localPath);
      if (file.exists) file.delete();
    } catch {
      // file may already be gone
    }
  }
  const filtered = downloads.filter((d) => d.episodeGuid !== episodeGuid);
  Storage.setItemSync(DOWNLOADS_KEY, JSON.stringify(filtered));
}

export function isInDownloads(episodeGuid: string): boolean {
  return getDownloads().some((d) => d.episodeGuid === episodeGuid);
}

export function getDownloadItem(episodeGuid: string): DownloadItem | undefined {
  return getDownloads().find((d) => d.episodeGuid === episodeGuid);
}

export function getWatchList(): WatchItem[] {
  const raw = Storage.getItemSync(WATCH_LIST_KEY);
  if (!raw) return [];
  return JSON.parse(raw) as WatchItem[];
}

export function addToWatchList(podcastId: string, episodeGuid: string): void {
  const list = getWatchList();
  if (list.some((w) => w.episodeGuid === episodeGuid)) return;
  list.push({ podcastId, episodeGuid });
  Storage.setItemSync(WATCH_LIST_KEY, JSON.stringify(list));
}

export function removeFromWatchList(episodeGuid: string): void {
  const list = getWatchList().filter((w) => w.episodeGuid !== episodeGuid);
  Storage.setItemSync(WATCH_LIST_KEY, JSON.stringify(list));
}

export function isOnWatchList(episodeGuid: string): boolean {
  return getWatchList().some((w) => w.episodeGuid === episodeGuid);
}

/**
 * Restrict episode downloads to unmetered networks. Applies to the phone and, via the
 * Data Layer, to the watch. Defaults to on — podcast episodes are large enough that
 * silently spending cellular data would be a nasty surprise.
 */
export function getWifiOnlyDownloads(): boolean {
  const raw = Storage.getItemSync(WIFI_ONLY_KEY);
  if (raw == null) return true;
  return raw === 'true';
}

export function setWifiOnlyDownloads(enabled: boolean): void {
  Storage.setItemSync(WIFI_ONLY_KEY, String(enabled));
}

function playbackKey(episodeGuid: string) {
  return `playback:${episodeGuid}`;
}

export function getPlaybackProgress(episodeGuid: string): PlaybackProgress | null {
  const raw = Storage.getItemSync(playbackKey(episodeGuid));
  if (!raw) return null;
  return JSON.parse(raw) as PlaybackProgress;
}

export function setPlaybackProgress(
  episodeGuid: string,
  progress: PlaybackProgress,
): void {
  Storage.setItemSync(playbackKey(episodeGuid), JSON.stringify(progress));
}
