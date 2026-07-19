import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { fetchFeed } from './rss';
import {
  addToQueue,
  getCachedEpisodes,
  getQueue,
  isInQueue,
  removeFromQueue,
  setCachedEpisodes,
} from './storage';
import type { Episode, Podcast } from './types';

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

export interface EnrichedQueueItem {
  episodeGuid: string;
  podcastId: string;
  episode: Episode;
  podcast: Podcast | undefined;
}

export function useQueueQuery(subscriptions: Podcast[]) {
  return useQuery({
    queryKey: ['queue'],
    queryFn: () => {
      const queue = getQueue();
      const items: EnrichedQueueItem[] = [];
      for (const qi of queue) {
        const episodes = getCachedEpisodes(qi.podcastId);
        const episode = episodes?.find((e) => e.guid === qi.episodeGuid);
        if (!episode) continue;
        const podcast = subscriptions.find((s) => s.id === qi.podcastId);
        items.push({
          episodeGuid: qi.episodeGuid,
          podcastId: qi.podcastId,
          episode,
          podcast,
        });
      }
      return items;
    },
  });
}

export function useIsInQueue(episodeGuid: string) {
  return useQuery({
    queryKey: ['queue', 'check', episodeGuid],
    queryFn: () => isInQueue(episodeGuid),
  });
}

export function useQueueMutations() {
  const queryClient = useQueryClient();

  const add = useMutation({
    mutationFn: ({ podcastId, episodeGuid }: { podcastId: string; episodeGuid: string }) => {
      addToQueue(podcastId, episodeGuid);
      return Promise.resolve();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['queue'] });
    },
  });

  const remove = useMutation({
    mutationFn: ({ episodeGuid }: { episodeGuid: string }) => {
      removeFromQueue(episodeGuid);
      return Promise.resolve();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['queue'] });
    },
  });

  return { add, remove };
}
