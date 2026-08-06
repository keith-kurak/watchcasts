import { Directory, File, Paths } from 'expo-file-system';
import { Storage } from 'expo-sqlite/kv-store';

import type { DownloadItem, Episode, PlaybackProgress, Podcast, WatchItem } from './types';

const SUBSCRIPTIONS_KEY = 'subscriptions';
const DOWNLOADS_KEY = 'downloads';
const WATCH_LIST_KEY = 'watchList';
const WIFI_ONLY_KEY = 'wifiOnlyDownloads';
const SUBSCRIPTIONS_VIEW_KEY = 'subscriptionsViewMode';
const PHONE_LIMIT_ON_KEY = 'phoneStorageLimitEnabled';
const PHONE_LIMIT_BYTES_KEY = 'phoneStorageLimitBytes';
const WATCH_LIMIT_ON_KEY = 'watchStorageLimitEnabled';
const WATCH_LIMIT_BYTES_KEY = 'watchStorageLimitBytes';
const WATCH_REPORTED_SIZES_KEY = 'watchReportedSizes';

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

// ─────────────────────────────────────────────────────────────────────────────
// STORAGE LIMITS
//
// Soft limits: going over does not delete anything, it only refuses the NEXT
// download. Both default to on, because an unbounded podcast library will fill a
// phone — and especially a watch — without ever announcing it.
//
// The phone limit is measured against bytes actually on disk. The watch limit is
// measured against feed-declared enclosure sizes for queued episodes, since the
// phone cannot see the watch's filesystem. See docs/watch-sync.md.
// ─────────────────────────────────────────────────────────────────────────────

/** Default phone allowance: 10 GB. */
export const DefaultPhoneLimitBytes = 10 * 1024 ** 3;
/** Default watch allowance: 1.5 GB. Watches have far less room than phones. */
export const DefaultWatchLimitBytes = 1.5 * 1024 ** 3;

function getBooleanSetting(key: string, fallback: boolean): boolean {
  const raw = Storage.getItemSync(key);
  if (raw == null) return fallback;
  return raw === 'true';
}

function getBytesSetting(key: string, fallback: number): number {
  const raw = Storage.getItemSync(key);
  if (raw == null) return fallback;
  const n = Number(raw);
  // A corrupt or non-positive stored value would silently block every download.
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export function getPhoneStorageLimitEnabled(): boolean {
  return getBooleanSetting(PHONE_LIMIT_ON_KEY, true);
}

export function setPhoneStorageLimitEnabled(enabled: boolean): void {
  Storage.setItemSync(PHONE_LIMIT_ON_KEY, String(enabled));
}

export function getPhoneStorageLimitBytes(): number {
  return getBytesSetting(PHONE_LIMIT_BYTES_KEY, DefaultPhoneLimitBytes);
}

export function setPhoneStorageLimitBytes(bytes: number): void {
  Storage.setItemSync(PHONE_LIMIT_BYTES_KEY, String(Math.round(bytes)));
}

export function getWatchStorageLimitEnabled(): boolean {
  return getBooleanSetting(WATCH_LIMIT_ON_KEY, true);
}

export function setWatchStorageLimitEnabled(enabled: boolean): void {
  Storage.setItemSync(WATCH_LIMIT_ON_KEY, String(enabled));
}

export function getWatchStorageLimitBytes(): number {
  return getBytesSetting(WATCH_LIMIT_BYTES_KEY, DefaultWatchLimitBytes);
}

export function setWatchStorageLimitBytes(bytes: number): void {
  Storage.setItemSync(WATCH_LIMIT_BYTES_KEY, String(Math.round(bytes)));
}

/**
 * Size of an episode's audio on this phone, or undefined if it is not downloaded.
 * Reads the file rather than trusting the feed, since this is what actually
 * occupies the device.
 */
export function getDownloadedSizeBytes(episodeGuid: string): number | undefined {
  const item = getDownloads().find((d) => d.episodeGuid === episodeGuid);
  if (item?.status !== 'complete' || !item.localPath) return undefined;
  try {
    const file = new File(item.localPath);
    return file.exists ? (file.size ?? undefined) : undefined;
  } catch {
    return undefined;
  }
}

/** Total bytes the downloaded episodes occupy on this phone. */
export function getPhoneUsedBytes(): number {
  let total = 0;
  for (const item of getDownloads()) {
    if (item.status !== 'complete' || !item.localPath) continue;
    try {
      const file = new File(item.localPath);
      if (file.exists) total += file.size ?? 0;
    } catch {
      // A file that cannot be read contributes nothing rather than aborting the sum.
    }
  }
  return total;
}

/**
 * Sizes the watch has measured for its completed downloads, keyed by episode guid.
 *
 * Persisted rather than kept in the status context: the watch limit is checked from
 * `WatchToggle` through plain storage calls, which cannot read React state — and the
 * numbers must survive an app restart or the watch being out of range.
 */
export function getWatchReportedSizes(): Record<string, number> {
  const raw = Storage.getItemSync(WATCH_REPORTED_SIZES_KEY);
  if (!raw) return {};
  try {
    return JSON.parse(raw) as Record<string, number>;
  } catch {
    return {};
  }
}

/**
 * Merge in sizes from a watch status report. Merged, not replaced: a report only covers
 * what the watch currently has queued, and a zero means "not downloaded yet" or "old
 * watch build" — neither should erase a size already measured.
 */
export function mergeWatchReportedSizes(sizes: Record<string, number>): void {
  const current = getWatchReportedSizes();
  let changed = false;
  for (const [guid, size] of Object.entries(sizes)) {
    if (size > 0 && current[guid] !== size) {
      current[guid] = size;
      changed = true;
    }
  }
  // Drop guids no longer on the watch list so the map cannot grow without bound.
  const queued = new Set(getWatchList().map((w) => w.episodeGuid));
  for (const guid of Object.keys(current)) {
    if (!queued.has(guid)) {
      delete current[guid];
      changed = true;
    }
  }
  if (changed) {
    Storage.setItemSync(WATCH_REPORTED_SIZES_KEY, JSON.stringify(current));
  }
}

/**
 * Total bytes of every episode queued for the watch.
 *
 * Prefers the size the watch measured for a completed download, and falls back to the
 * size the feed declared for anything not yet downloaded. Still an estimate at the
 * margin: an episode that is queued but not downloaded, from a feed that omits
 * `enclosure/@length` (audioboom publishes `length="0"`), counts as zero. Erring toward
 * letting a download through beats blocking one that would have fit.
 */
export function getWatchQueuedBytes(): number {
  const reported = getWatchReportedSizes();
  let total = 0;
  for (const item of getWatchList()) {
    const measured = reported[item.episodeGuid];
    if (measured > 0) {
      total += measured;
      continue;
    }
    const episode = getCachedEpisodes(item.podcastId)?.find(
      (e) => e.guid === item.episodeGuid,
    );
    total += episode?.sizeBytes ?? 0;
  }
  return total;
}

export interface StorageLimitState {
  /** False only when the limit is on AND already reached. */
  allowed: boolean;
  enabled: boolean;
  usedBytes: number;
  limitBytes: number;
}

/**
 * Whether the phone may take on another download. Soft limit: being over it blocks
 * the next download but never deletes what is already there, so the used total can
 * legitimately exceed the limit.
 */
export function getPhoneLimitState(): StorageLimitState {
  const enabled = getPhoneStorageLimitEnabled();
  const limitBytes = getPhoneStorageLimitBytes();
  const usedBytes = getPhoneUsedBytes();
  return { allowed: !enabled || usedBytes < limitBytes, enabled, usedBytes, limitBytes };
}

/** Whether another episode may be queued for the watch. See getWatchQueuedBytes. */
export function getWatchLimitState(): StorageLimitState {
  const enabled = getWatchStorageLimitEnabled();
  const limitBytes = getWatchStorageLimitBytes();
  const usedBytes = getWatchQueuedBytes();
  return { allowed: !enabled || usedBytes < limitBytes, enabled, usedBytes, limitBytes };
}

/** How the subscriptions tab lays out its podcasts. */
export type SubscriptionsViewMode = 'tile' | 'list';

/**
 * Defaults to the tile grid — artwork is how people recognise a podcast, and the grid
 * shows far more of it per screen.
 */
export function getSubscriptionsViewMode(): SubscriptionsViewMode {
  return Storage.getItemSync(SUBSCRIPTIONS_VIEW_KEY) === 'list' ? 'list' : 'tile';
}

export function setSubscriptionsViewMode(mode: SubscriptionsViewMode): void {
  Storage.setItemSync(SUBSCRIPTIONS_VIEW_KEY, mode);
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
