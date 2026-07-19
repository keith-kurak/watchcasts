import { Storage } from 'expo-sqlite/kv-store';

import type { Episode, Podcast, QueueItem } from './types';

const SUBSCRIPTIONS_KEY = 'subscriptions';
const QUEUE_KEY = 'queue';

function episodesKey(podcastId: string) {
  return `episodes:${podcastId}`;
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

export function getQueue(): QueueItem[] {
  const raw = Storage.getItemSync(QUEUE_KEY);
  if (!raw) return [];
  return JSON.parse(raw) as QueueItem[];
}

export function addToQueue(podcastId: string, episodeGuid: string): void {
  const queue = getQueue();
  if (queue.some((q) => q.episodeGuid === episodeGuid)) return;
  queue.push({ podcastId, episodeGuid });
  Storage.setItemSync(QUEUE_KEY, JSON.stringify(queue));
}

export function removeFromQueue(episodeGuid: string): void {
  const queue = getQueue().filter((q) => q.episodeGuid !== episodeGuid);
  Storage.setItemSync(QUEUE_KEY, JSON.stringify(queue));
}

export function isInQueue(episodeGuid: string): boolean {
  return getQueue().some((q) => q.episodeGuid === episodeGuid);
}
