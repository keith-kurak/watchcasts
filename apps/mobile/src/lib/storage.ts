import { Directory, File, Paths } from 'expo-file-system';
import { Storage } from 'expo-sqlite/kv-store';

import type { DownloadItem, Episode, PlaybackProgress, Podcast, WatchItem } from './types';

const SUBSCRIPTIONS_KEY = 'subscriptions';
const DOWNLOADS_KEY = 'downloads';
const WATCH_LIST_KEY = 'watchList';
const WIFI_ONLY_KEY = 'wifiOnlyDownloads';
const PLAY_NEXT_KEY = 'playNextEpisode';
const SYNC_DOWNLOADS_KEY = 'syncDownloads';

/**
 * Most episodes either device will hold.
 *
 * This is a usability limit before it is a storage one. Both lists are hand-ordered by
 * dragging, and dragging a row across hundreds of items is unusable no matter how fast
 * the list renders. Thirty also keeps the watch's sequential downloader from queueing
 * more than it can realistically finish.
 */
export const MAX_DOWNLOADS = 30;

/** Outcome of an add that may be rejected. Callers surface 'full' to the user. */
export type AddResult = 'added' | 'duplicate' | 'full';

/**
 * Move one item within a list, shifting everything between the two positions.
 *
 * Insert-and-shift, not swap: "play this third" has to leave the relative order of
 * everything else intact, which a swap does not.
 */
function moveItem<T>(items: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || from >= items.length) return items;
  const next = items.slice();
  const [moved] = next.splice(from, 1);
  next.splice(Math.max(0, Math.min(to, next.length)), 0, moved);
  return next;
}

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

export function setDownloads(items: DownloadItem[]): void {
  Storage.setItemSync(DOWNLOADS_KEY, JSON.stringify(items));
}

export function addToDownloads(podcastId: string, episodeGuid: string): AddResult {
  const downloads = getDownloads();
  if (downloads.some((d) => d.episodeGuid === episodeGuid)) return 'duplicate';
  if (downloads.length >= MAX_DOWNLOADS) return 'full';
  downloads.push({ podcastId, episodeGuid, status: 'pending' });
  setDownloads(downloads);
  return 'added';
}

/** Move a phone download to a new position. Order is playback and download order. */
export function moveDownload(episodeGuid: string, toIndex: number): void {
  const items = getDownloads();
  const from = items.findIndex((d) => d.episodeGuid === episodeGuid);
  if (from === -1) return;
  setDownloads(moveItem(items, from, toIndex));
}

export function updateDownloadItem(
  episodeGuid: string,
  updates: Partial<Pick<DownloadItem, 'status' | 'localPath'>>,
): void {
  const downloads = getDownloads();
  const idx = downloads.findIndex((d) => d.episodeGuid === episodeGuid);
  if (idx === -1) return;
  downloads[idx] = { ...downloads[idx], ...updates };
  setDownloads(downloads);
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
  setDownloads(downloads.filter((d) => d.episodeGuid !== episodeGuid));
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

export function setWatchList(items: WatchItem[]): void {
  Storage.setItemSync(WATCH_LIST_KEY, JSON.stringify(items));
}

export function addToWatchList(podcastId: string, episodeGuid: string): AddResult {
  const list = getWatchList();
  if (list.some((w) => w.episodeGuid === episodeGuid)) return 'duplicate';
  if (list.length >= MAX_DOWNLOADS) return 'full';
  list.push({ podcastId, episodeGuid });
  setWatchList(list);
  return 'added';
}

export function removeFromWatchList(episodeGuid: string): void {
  setWatchList(getWatchList().filter((w) => w.episodeGuid !== episodeGuid));
}

/**
 * Move a watch episode to a new position.
 *
 * The watch downloads the first not-yet-downloaded episode in this list, so position is
 * download priority as well as playback order.
 */
export function moveWatchItem(episodeGuid: string, toIndex: number): void {
  const items = getWatchList();
  const from = items.findIndex((w) => w.episodeGuid === episodeGuid);
  if (from === -1) return;
  setWatchList(moveItem(items, from, toIndex));
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

/**
 * When an episode finishes, start the next one in the same list. Honoured by this phone
 * and, via the Data Layer, by the watch. Defaults to on — a hand-ordered queue that
 * stops after one episode is not much of a queue.
 */
export function getPlayNextEpisode(): boolean {
  const raw = Storage.getItemSync(PLAY_NEXT_KEY);
  if (raw == null) return true;
  return raw === 'true';
}

export function setPlayNextEpisode(enabled: boolean): void {
  Storage.setItemSync(PLAY_NEXT_KEY, String(enabled));
}

/**
 * Keep the phone's downloads and the watch's queue identical — same episodes, same
 * order. Defaults to off, because it makes every watch download also spend phone
 * storage, which should be an explicit choice.
 */
export function getSyncDownloads(): boolean {
  return Storage.getItemSync(SYNC_DOWNLOADS_KEY) === 'true';
}

export function setSyncDownloads(enabled: boolean): void {
  Storage.setItemSync(SYNC_DOWNLOADS_KEY, String(enabled));
}

/**
 * Make the phone hold exactly what the watch holds, in the watch's order.
 *
 * The watch is the source of truth when sync is switched on: it is the device with the
 * hard storage limit, and its queue is the one the user curates. Anything on the phone
 * that is not on the watch is deleted, files and all.
 *
 * Returns counts so the caller can report what happened. New entries land as 'pending';
 * the caller drains them so the downloads actually start.
 */
export function mirrorWatchListToDownloads(): { removed: number; added: number } {
  const watch = getWatchList();
  const watchGuids = new Set(watch.map((w) => w.episodeGuid));

  let removed = 0;
  for (const item of getDownloads()) {
    if (!watchGuids.has(item.episodeGuid)) {
      // Deletes the audio file as well as the list entry.
      removeFromDownloads(item.episodeGuid);
      removed++;
    }
  }

  // Rebuild in the watch's order, preserving the download state of anything the phone
  // already has so a completed episode is not re-downloaded.
  const kept = new Map(getDownloads().map((d) => [d.episodeGuid, d]));
  let added = 0;
  const next: DownloadItem[] = watch.map((w) => {
    const existing = kept.get(w.episodeGuid);
    if (existing) return existing;
    added++;
    return { podcastId: w.podcastId, episodeGuid: w.episodeGuid, status: 'pending' };
  });
  setDownloads(next);

  return { removed, added };
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
