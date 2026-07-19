import { Image } from 'expo-image';
import { useLocalSearchParams, Stack, useRouter } from 'expo-router';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';

import { DownloadToggle } from '@/components/download-toggle';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { NowPlayingBarHeight, Spacing } from '@/constants/theme';
import { formatDate, formatDuration } from '@/lib/format';
import { useFeedQuery } from '@/lib/queries';
import { getSubscriptions } from '@/lib/storage';
import type { Podcast } from '@/lib/types';

export default function PodcastScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const podcast: Podcast | undefined = getSubscriptions().find((s) => s.id === id);
  const { data: episodes = [], isLoading, refetch, isRefetching } = useFeedQuery(
    id,
    podcast?.feedUrl ?? '',
  );

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen options={{ title: podcast?.title ?? 'Podcast' }} />
      <FlatList
        data={episodes}
        keyExtractor={(item) => item.guid}
        refreshing={isRefetching}
        onRefresh={() => refetch()}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <Pressable
            style={styles.episodeRow}
            onPress={() =>
              router.push({
                pathname: '/(tabs)/(subscriptions)/podcast/episode/[episodeId]',
                params: { episodeId: item.guid, podcastId: id },
              })
            }
          >
            <Image
              source={{ uri: item.imageUrl ?? podcast?.artworkUrl }}
              style={styles.thumbnail}
              contentFit="cover"
            />
            <View style={styles.episodeContent}>
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
                    {formatDuration(item.duration)}
                  </ThemedText>
                )}
              </View>
            </View>
            <DownloadToggle podcastId={id} episodeGuid={item.guid} audioUrl={item.audioUrl} />
          </Pressable>
        )}
        ListEmptyComponent={
          isLoading ? null : (
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
    paddingBottom: Spacing.three + NowPlayingBarHeight,
    gap: Spacing.one,
  },
  episodeRow: {
    flexDirection: 'row',
    paddingVertical: Spacing.three,
    gap: Spacing.three,
    alignItems: 'center',
  },
  thumbnail: {
    width: 48,
    height: 48,
    borderRadius: 6,
  },
  episodeContent: {
    flex: 1,
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
