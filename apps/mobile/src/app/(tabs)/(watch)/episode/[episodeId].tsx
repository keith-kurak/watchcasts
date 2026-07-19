import { useLocalSearchParams, Stack } from 'expo-router';

import { EpisodeDetail } from '@/components/episode-detail';
import { getCachedEpisodes } from '@/lib/storage';

export default function WatchEpisodeDetailScreen() {
  const { episodeId, podcastId } = useLocalSearchParams<{
    episodeId: string;
    podcastId: string;
  }>();

  const episodes = getCachedEpisodes(podcastId) ?? [];
  const episode = episodes.find((e) => e.guid === episodeId);

  return (
    <>
      <Stack.Screen options={{ title: episode?.title ?? 'Episode' }} />
      <EpisodeDetail episodeId={episodeId} podcastId={podcastId} />
    </>
  );
}
