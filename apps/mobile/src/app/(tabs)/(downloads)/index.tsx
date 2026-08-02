import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { NowPlayingBarHeight, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useDownloadContext } from '@/lib/download-context';
import { formatDate, formatDuration } from '@/lib/format';
import { useDownloadsQuery, type EnrichedDownloadItem } from '@/lib/queries';
import { getSubscriptions } from '@/lib/storage';

function DownloadRow({ item }: { item: EnrichedDownloadItem }) {
  const router = useRouter();
  const theme = useTheme();
  const { getProgress, isWaitingForWifi } = useDownloadContext();
  const progress = getProgress(item.episodeGuid);
  const isDownloading = item.status === 'downloading' || progress != null;
  const waitingForWifi = item.status === 'pending' && !isDownloading && isWaitingForWifi;

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
          {isDownloading && (
            <ThemedText type="small" themeColor="textSecondary">
              Downloading… {progress != null ? `${Math.round(progress * 100)}%` : ''}
            </ThemedText>
          )}
          {waitingForWifi && (
            <ThemedText type="small" style={styles.waitingText}>
              Waiting for Wi-Fi
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
        {isDownloading && (
          <View style={[styles.progressTrack, { backgroundColor: theme.backgroundElement }]}>
            <View
              style={[
                styles.progressFill,
                { width: `${Math.round((progress ?? 0) * 100)}%` },
              ]}
            />
          </View>
        )}
      </View>
    </Pressable>
  );
}

export default function DownloadsScreen() {
  const subscriptions = getSubscriptions();
  const { data: downloads = [], isLoading, refetch, isRefetching } = useDownloadsQuery(subscriptions);

  return (
    <ThemedView style={styles.container}>
      <FlatList
        data={downloads}
        keyExtractor={(item) => item.episodeGuid}
        refreshing={isRefetching}
        onRefresh={() => refetch()}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => <DownloadRow item={item} />}
        ListEmptyComponent={
          isLoading ? null : (
            <ThemedText type="small" themeColor="textSecondary" style={styles.emptyText}>
              No episodes on phone.
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
  progressTrack: {
    height: 3,
    borderRadius: 1.5,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#007AFF',
    borderRadius: 1.5,
  },
  waitingText: {
    color: '#FFB300',
  },
  emptyText: {
    textAlign: 'center',
    marginTop: Spacing.six,
  },
});
