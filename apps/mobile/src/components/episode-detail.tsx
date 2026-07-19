import { Image } from 'expo-image';
import { ScrollView, StyleSheet, View } from 'react-native';

import { QueueToggle } from '@/components/queue-toggle';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { formatDate, formatDuration, stripHtml } from '@/lib/format';
import { getCachedEpisodes, getSubscriptions } from '@/lib/storage';
import type { Episode, Podcast } from '@/lib/types';

interface EpisodeDetailProps {
  episodeId: string;
  podcastId: string;
}

export function EpisodeDetail({ episodeId, podcastId }: EpisodeDetailProps) {
  const podcast: Podcast | undefined = getSubscriptions().find((s) => s.id === podcastId);
  const episodes = getCachedEpisodes(podcastId) ?? [];
  const episode: Episode | undefined = episodes.find((e) => e.guid === episodeId);

  if (!episode) {
    return (
      <ThemedView style={styles.container}>
        <ThemedText style={styles.notFound}>Episode not found.</ThemedText>
      </ThemedView>
    );
  }

  const imageUri = episode.imageUrl ?? podcast?.artworkUrl;

  return (
    <ThemedView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        {imageUri && (
          <Image source={{ uri: imageUri }} style={styles.image} contentFit="cover" />
        )}
        <View style={styles.titleRow}>
          <ThemedText style={styles.title}>{episode.title}</ThemedText>
          <QueueToggle podcastId={podcastId} episodeGuid={episode.guid} />
        </View>
        <View style={styles.meta}>
          {episode.pubDate && (
            <ThemedText type="small" themeColor="textSecondary">
              {formatDate(episode.pubDate)}
            </ThemedText>
          )}
          {episode.duration && (
            <ThemedText type="small" themeColor="textSecondary">
              {formatDuration(episode.duration)}
            </ThemedText>
          )}
        </View>
        {episode.description && (
          <ThemedText style={styles.description}>
            {stripHtml(episode.description)}
          </ThemedText>
        )}
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: Spacing.three,
    gap: Spacing.three,
  },
  image: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 12,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.two,
  },
  title: {
    flex: 1,
    fontSize: 22,
    fontWeight: '700',
    lineHeight: 28,
  },
  meta: {
    flexDirection: 'row',
    gap: Spacing.three,
  },
  description: {
    fontSize: 15,
    lineHeight: 22,
  },
  notFound: {
    textAlign: 'center',
    marginTop: Spacing.six,
  },
});
