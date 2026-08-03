import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert } from 'react-native';

import { syncWatchEpisodes } from '@/hooks/useWearDataLayer';

import { useDownloadContext } from './download-context';
import { fetchFeed } from './rss';
import {
  addToDownloads,
  addToWatchList,
  getCachedEpisodes,
  getDownloadItem,
  getDownloads,
  getSubscriptions,
  getSyncDownloads,
  getWatchList,
  isOnWatchList,
  MAX_DOWNLOADS,
  moveDownload,
  moveWatchItem,
  removeFromDownloads,
  removeFromWatchList,
  setCachedEpisodes,
  type AddResult,
} from './storage';
import type { DownloadStatus, Episode, Podcast } from './types';

/**
 * Tell the user why an add did nothing.
 *
 * Lives here rather than in each toggle so every caller that can fill a queue reports it
 * the same way, including callers added later.
 */
function alertIfFull(result: AddResult, device: 'phone' | 'watch') {
  if (result !== 'full') return;
  const where = device === 'watch' ? 'watch queue' : 'phone downloads';
  Alert.alert(
    'Queue is full',
    `Your ${where} already holds ${MAX_DOWNLOADS} episodes. Remove one before adding another.`,
  );
}

/**
 * Add an episode to the phone and start fetching it, for use when download sync mirrors
 * a watch add. Silent about a full queue: the watch list is capped at the same number,
 * so the phone can only be full here if the two lists have drifted.
 */
function mirrorAddToDownloads(
  podcastId: string,
  episodeGuid: string,
  startDownload: (audioUrl: string, podcastId: string, episodeGuid: string) => void,
) {
  if (addToDownloads(podcastId, episodeGuid) !== 'added') return;
  const audioUrl = getCachedEpisodes(podcastId)?.find((e) => e.guid === episodeGuid)?.audioUrl;
  if (audioUrl) startDownload(audioUrl, podcastId, episodeGuid);
}

export function useFeedQuery(podcastId: string, feedUrl: string) {
  return useQuery({
    queryKey: ['feed', podcastId],
    queryFn: async () => {
      const { episodes } = await fetchFeed(feedUrl);
      setCachedEpisodes(podcastId, episodes);
      return episodes;
    },
    initialData: () => getCachedEpisodes(podcastId) ?? undefined,
  });
}

export interface EnrichedDownloadItem {
  episodeGuid: string;
  podcastId: string;
  episode: Episode;
  podcast: Podcast | undefined;
  status: DownloadStatus;
  localPath?: string;
  progress?: number;
}

export function useDownloadsQuery(subscriptions: Podcast[]) {
  return useQuery({
    queryKey: ['downloads'],
    queryFn: () => {
      const downloads = getDownloads();
      const items: EnrichedDownloadItem[] = [];
      for (const di of downloads) {
        const episodes = getCachedEpisodes(di.podcastId);
        const episode = episodes?.find((e) => e.guid === di.episodeGuid);
        if (!episode) continue;
        const podcast = subscriptions.find((s) => s.id === di.podcastId);
        items.push({
          episodeGuid: di.episodeGuid,
          podcastId: di.podcastId,
          episode,
          podcast,
          status: di.status,
          localPath: di.localPath,
        });
      }
      return items;
    },
  });
}

export function useIsInDownloads(episodeGuid: string) {
  return useQuery({
    queryKey: ['downloads', 'check', episodeGuid],
    queryFn: () => {
      const item = getDownloadItem(episodeGuid);
      return item ?? null;
    },
  });
}

export function useDownloadMutations() {
  const queryClient = useQueryClient();
  const { startDownload, cancelDownload } = useDownloadContext();

  const add = useMutation({
    mutationFn: ({
      podcastId,
      episodeGuid,
      audioUrl,
    }: {
      podcastId: string;
      episodeGuid: string;
      audioUrl: string;
    }) => {
      const result = addToDownloads(podcastId, episodeGuid);
      if (result === 'added') {
        startDownload(audioUrl, podcastId, episodeGuid);
        // Sync is symmetric: queueing on the phone also queues on the watch.
        if (getSyncDownloads()) addToWatchList(podcastId, episodeGuid);
      }
      return Promise.resolve(result);
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['downloads'] });
      queryClient.invalidateQueries({ queryKey: ['watchList'] });
      if (getSyncDownloads()) publishWatchList();
      alertIfFull(result, 'phone');
    },
  });

  const remove = useMutation({
    mutationFn: ({ episodeGuid }: { episodeGuid: string }) => {
      cancelDownload(episodeGuid);
      removeFromDownloads(episodeGuid);
      if (getSyncDownloads()) removeFromWatchList(episodeGuid);
      return Promise.resolve();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['downloads'] });
      queryClient.invalidateQueries({ queryKey: ['watchList'] });
      if (getSyncDownloads()) publishWatchList();
    },
  });

  const reorder = useMutation({
    mutationFn: ({ episodeGuid, toIndex }: { episodeGuid: string; toIndex: number }) => {
      moveDownload(episodeGuid, toIndex);
      // Same membership under sync, so the same move applies to both lists.
      if (getSyncDownloads()) moveWatchItem(episodeGuid, toIndex);
      return Promise.resolve();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['downloads'] });
      queryClient.invalidateQueries({ queryKey: ['watchList'] });
      if (getSyncDownloads()) publishWatchList();
    },
  });

  return { add, remove, reorder };
}

export function useWatchListQuery(subscriptions: Podcast[]) {
  return useQuery({
    queryKey: ['watchList'],
    queryFn: () => {
      const list = getWatchList();
      const items: EnrichedDownloadItem[] = [];
      for (const wi of list) {
        const episodes = getCachedEpisodes(wi.podcastId);
        const episode = episodes?.find((e) => e.guid === wi.episodeGuid);
        if (!episode) continue;
        const podcast = subscriptions.find((s) => s.id === wi.podcastId);
        items.push({
          episodeGuid: wi.episodeGuid,
          podcastId: wi.podcastId,
          episode,
          podcast,
          status: 'pending',
        });
      }
      return items;
    },
  });
}

export function useIsOnWatchList(episodeGuid: string) {
  return useQuery({
    queryKey: ['watchList', 'check', episodeGuid],
    queryFn: () => isOnWatchList(episodeGuid),
  });
}

/**
 * Publish the current watch list to the paired watch.
 *
 * Module-level rather than a hook member so callers outside React state — the Data Layer
 * message listener, for one — can re-publish with a stable reference.
 */
export function publishWatchList() {
  const list = getWatchList();
  const enriched = list.flatMap((wi) => {
    const episodes = getCachedEpisodes(wi.podcastId);
    const episode = episodes?.find((e) => e.guid === wi.episodeGuid);
    if (!episode) return [];
    const podcast = getSubscriptions().find((s) => s.id === wi.podcastId);
    return [{
      guid: episode.guid,
      title: episode.title,
      podcastTitle: podcast?.title ?? '',
      podcastId: wi.podcastId,
      audioUrl: episode.audioUrl ?? '',
      duration: episode.duration ?? '',
      pubDate: episode.pubDate ?? '',
      artworkUrl: episode.imageUrl ?? podcast?.artworkUrl ?? '',
    }];
  });
  syncWatchEpisodes(enriched).catch(() => {});
}

export function useWatchListMutations() {
  const queryClient = useQueryClient();
  const { startDownload, cancelDownload } = useDownloadContext();

  const triggerSync = publishWatchList;

  /** Both queues can change on any of these, so refresh both views. */
  function invalidateBoth() {
    queryClient.invalidateQueries({ queryKey: ['watchList'] });
    queryClient.invalidateQueries({ queryKey: ['downloads'] });
  }

  const add = useMutation({
    mutationFn: ({ podcastId, episodeGuid }: { podcastId: string; episodeGuid: string }) => {
      const result = addToWatchList(podcastId, episodeGuid);
      if (result === 'added' && getSyncDownloads()) {
        mirrorAddToDownloads(podcastId, episodeGuid, startDownload);
      }
      return Promise.resolve(result);
    },
    onSuccess: (result) => {
      invalidateBoth();
      triggerSync();
      alertIfFull(result, 'watch');
    },
  });

  const remove = useMutation({
    mutationFn: ({ episodeGuid }: { episodeGuid: string }) => {
      removeFromWatchList(episodeGuid);
      if (getSyncDownloads()) {
        cancelDownload(episodeGuid);
        removeFromDownloads(episodeGuid);
      }
      return Promise.resolve();
    },
    onSuccess: () => {
      invalidateBoth();
      triggerSync();
    },
  });

  const reorder = useMutation({
    mutationFn: ({ episodeGuid, toIndex }: { episodeGuid: string; toIndex: number }) => {
      moveWatchItem(episodeGuid, toIndex);
      if (getSyncDownloads()) moveDownload(episodeGuid, toIndex);
      return Promise.resolve();
    },
    onSuccess: () => {
      invalidateBoth();
      // Re-publish so the watch picks up the new download priority, not just the new
      // display order — its worker takes the first undownloaded episode in this list.
      triggerSync();
    },
  });

  return { add, remove, reorder, triggerSync };
}
