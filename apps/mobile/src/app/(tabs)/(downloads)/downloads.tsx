import { LegendList, type LegendListRef } from '@legendapp/list/react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useRef } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { NowPlayingBarHeight, Spacing } from '@/constants/theme';
import { useScrollToActiveDownload } from '@/hooks/use-scroll-to-active-download';
import { useTheme } from '@/hooks/use-theme';
import { useDownloadContext } from '@/lib/download-context';
import { formatBytes, formatDate, formatDuration } from '@/lib/format';
import { useDownloadsQuery, type EnrichedDownloadItem } from '@/lib/queries';
import { getSubscriptions } from '@/lib/storage';

const ESTIMATED_ROW_HEIGHT = 76;

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
          {/* Pushed to the far right of the meta row, level with the date and duration. */}
          {formatBytes(item.sizeBytes) !== '' && (
            <ThemedText type="small" themeColor="textSecondary" style={styles.sizeText}>
              {formatBytes(item.sizeBytes)}
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
  const { getProgress } = useDownloadContext();

  const listRef = useRef<LegendListRef>(null);
  // `status` alone is not enough: an item is 'downloading' in storage only after the
  // task starts, while getProgress reflects bytes actually moving.
  const hasActiveDownload = downloads.some(
    (d) => d.status === 'downloading' || getProgress(d.episodeGuid) != null,
  );
  useScrollToActiveDownload(listRef, hasActiveDownload);

  return (
    <ThemedView style={styles.container}>
      <LegendList
        ref={listRef}
        data={downloads}
        keyExtractor={(item) => item.episodeGuid}
        estimatedItemSize={ESTIMATED_ROW_HEIGHT}
        recycleItems
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
  },
  episodeRow: {
    flexDirection: 'row',
    paddingVertical: Spacing.three,
    // Row spacing lives here rather than as a contentContainerStyle gap, which
    // a virtualized list cannot apply to its absolutely positioned items.
    marginBottom: Spacing.one,
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
  sizeText: {
    // Takes the remaining width so the size sits against the right edge whatever
    // else the meta row happens to be showing.
    flex: 1,
    textAlign: 'right',
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
