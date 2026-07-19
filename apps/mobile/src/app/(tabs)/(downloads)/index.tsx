import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';

import { QueueToggle } from '@/components/queue-toggle';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { formatDate, formatDuration } from '@/lib/format';
import { useQueueQuery, type EnrichedQueueItem } from '@/lib/queries';
import { getSubscriptions } from '@/lib/storage';

export default function QueueScreen() {
  const router = useRouter();
  const subscriptions = getSubscriptions();
  const { data: queue = [], isLoading, refetch, isRefetching } = useQueueQuery(subscriptions);

  function renderItem({ item }: { item: EnrichedQueueItem }) {
    return (
      <Pressable
        style={styles.episodeRow}
        onPress={() =>
          router.push({
            pathname: '/(tabs)/(queue)/episode/[episodeId]',
            params: { episodeId: item.episodeGuid, podcastId: item.podcastId },
          })
        }
      >
        <Image
          source={{ uri: item.episode.imageUrl ?? item.podcast?.artworkUrl }}
          style={styles.thumbnail}
          contentFit="cover"
        />
        <View style={styles.episodeContent}>
          <ThemedText style={styles.episodeTitle} numberOfLines={2}>
            {item.episode.title}
          </ThemedText>
          <View style={styles.episodeMeta}>
            {item.episode.pubDate && (
              <ThemedText type="small" themeColor="textSecondary">
                {formatDate(item.episode.pubDate)}
              </ThemedText>
            )}
            {item.episode.duration && (
              <ThemedText type="small" themeColor="textSecondary">
                {formatDuration(item.episode.duration)}
              </ThemedText>
            )}
          </View>
        </View>
        <QueueToggle podcastId={item.podcastId} episodeGuid={item.episodeGuid} />
      </Pressable>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <FlatList
        data={queue}
        keyExtractor={(item) => item.episodeGuid}
        refreshing={isRefetching}
        onRefresh={() => refetch()}
        contentContainerStyle={styles.list}
        renderItem={renderItem}
        ListEmptyComponent={
          isLoading ? null : (
            <ThemedText type="small" themeColor="textSecondary" style={styles.emptyText}>
              Your queue is empty.
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
