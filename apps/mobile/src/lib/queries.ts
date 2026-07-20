import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

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
  getWatchList,
  isOnWatchList,
  removeFromDownloads,
  removeFromWatchList,
  setCachedEpisodes,
} from './storage';
import type { DownloadStatus, Episode, Podcast } from './types';

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
      addToDownloads(podcastId, episodeGuid);
      startDownload(audioUrl, podcastId, episodeGuid);
      return Promise.resolve();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['downloads'] });
    },
  });

  const remove = useMutation({
    mutationFn: ({ episodeGuid }: { episodeGuid: string }) => {
      cancelDownload(episodeGuid);
      removeFromDownloads(episodeGuid);
      return Promise.resolve();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['downloads'] });
    },
  });

  return { add, remove };
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
          status: 'complete', // watch list items don't have download status
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

export function useWatchListMutations() {
  const queryClient = useQueryClient();

  function triggerSync() {
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

  const add = useMutation({
    mutationFn: ({ podcastId, episodeGuid }: { podcastId: string; episodeGuid: string }) => {
      addToWatchList(podcastId, episodeGuid);
      return Promise.resolve();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['watchList'] });
      triggerSync();
    },
  });

  const remove = useMutation({
    mutationFn: ({ episodeGuid }: { episodeGuid: string }) => {
      removeFromWatchList(episodeGuid);
      return Promise.resolve();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['watchList'] });
      triggerSync();
    },
  });

  return { add, remove, triggerSync };
}
