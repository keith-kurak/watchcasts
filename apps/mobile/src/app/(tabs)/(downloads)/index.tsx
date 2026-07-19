import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';

import { DownloadToggle } from '@/components/download-toggle';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { formatDate, formatDuration } from '@/lib/format';
import { useDownloadsQuery, type EnrichedDownloadItem } from '@/lib/queries';
import { getSubscriptions } from '@/lib/storage';

export default function DownloadsScreen() {
  const router = useRouter();
  const subscriptions = getSubscriptions();
  const { data: downloads = [], isLoading, refetch, isRefetching } = useDownloadsQuery(subscriptions);

  function renderItem({ item }: { item: EnrichedDownloadItem }) {
    return (
      <Pressable
        style={styles.episodeRow}
        onPress={() =>
          router.push({
            pathname: '/(tabs)/(downloads)/episode/[episodeId]',
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
            {item.status === 'downloading' && (
              <ThemedText type="small" themeColor="textSecondary">
                Downloading…
              </ThemedText>
            )}
            {item.status === 'error' && (
              <ThemedText type="small" style={{ color: '#FF3B30' }}>
                Error
              </ThemedText>
            )}
            {item.status === 'complete' && item.episode.pubDate && (
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
        <DownloadToggle
          podcastId={item.podcastId}
          episodeGuid={item.episodeGuid}
          audioUrl={item.episode.audioUrl}
        />
      </Pressable>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <FlatList
        data={downloads}
        keyExtractor={(item) => item.episodeGuid}
        refreshing={isRefetching}
        onRefresh={() => refetch()}
        contentContainerStyle={styles.list}
        renderItem={renderItem}
        ListEmptyComponent={
          isLoading ? null : (
            <ThemedText type="small" themeColor="textSecondary" style={styles.emptyText}>
              No downloads yet.
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
