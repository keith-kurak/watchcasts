import { useLocalSearchParams, Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { fetchFeed } from '@/lib/rss';
import {
  getCachedEpisodes,
  getSubscriptions,
  setCachedEpisodes,
} from '@/lib/storage';
import type { Episode, Podcast } from '@/lib/types';

function formatDate(dateStr?: string): string {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

export default function PodcastScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [podcast, setPodcast] = useState<Podcast | null>(null);
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    const sub = getSubscriptions().find((s) => s.id === id);
    if (!sub) return;
    setPodcast(sub);

    const cached = getCachedEpisodes(id);
    if (cached) {
      setEpisodes(cached);
    }

    loadEpisodes(sub);
  }, [id]);

  async function loadEpisodes(sub: Podcast) {
    try {
      setRefreshing(true);
      const { episodes: fresh } = await fetchFeed(sub.feedUrl);
      setCachedEpisodes(sub.id, fresh);
      setEpisodes(fresh);
    } catch {
      // keep cached if fetch fails
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen options={{ title: podcast?.title ?? 'Podcast' }} />
      <FlatList
        data={episodes}
        keyExtractor={(item) => item.guid}
        refreshing={refreshing}
        onRefresh={() => podcast && loadEpisodes(podcast)}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <View style={styles.episodeRow}>
            <ThemedText style={styles.episodeTitle} numberOfLines={2}>
              {item.title}
            </ThemedText>
            <View style={styles.episodeMeta}>
              {item.pubDate && (
                <ThemedText type="small" themeColor="textSecondary">
                  {formatDate(item.pubDate)}
                </ThemedText>
              )}
              {item.duration && (
                <ThemedText type="small" themeColor="textSecondary">
                  {item.duration}
                </ThemedText>
              )}
            </View>
          </View>
        )}
        ListEmptyComponent={
          refreshing ? null : (
            <ThemedText type="small" themeColor="textSecondary" style={styles.emptyText}>
              No episodes found.
            </ThemedText>
          )
        }
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  list: {
    padding: Spacing.three,
    gap: Spacing.one,
  },
  episodeRow: {
    paddingVertical: Spacing.three,
    gap: Spacing.one,
  },
  episodeTitle: {
    fontWeight: '600' as const,
  },
  episodeMeta: {
    flexDirection: 'row',
    gap: Spacing.three,
  },
  emptyText: {
    textAlign: 'center',
    marginTop: Spacing.six,
  },
});
