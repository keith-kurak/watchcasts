import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { memo, useCallback } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { QueueList, QUEUE_ROW_HEIGHT } from '@/components/queue-list';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatDate, formatDuration } from '@/lib/format';
import { useWatchListMutations, useWatchListQuery, type EnrichedDownloadItem } from '@/lib/queries';
import { getSubscriptions } from '@/lib/storage';
import { useWatchStatuses } from '@/lib/watch-status-context';

import type { WatchEpisodeStatus } from '../../modules/wear-data-layer/src';

const WatchRow = memo(function WatchRow({
  item,
  watchStatus,
}: {
  item: EnrichedDownloadItem;
  watchStatus: WatchEpisodeStatus | undefined;
}) {
  const router = useRouter();
  const theme = useTheme();
  const status = watchStatus?.status ?? 'pending';
  const progress = watchStatus?.progress ?? 0;
  const isDownloading = status === 'downloading';

  return (
    <Pressable
      style={[styles.episodeRow, { backgroundColor: theme.background }]}
      onPress={() =>
        router.push({
          pathname: '/(tabs)/(downloads)/episode/[episodeId]',
          params: { episodeId: item.episodeGuid, podcastId: item.podcastId },
        })
      }>
      <Image
        source={{ uri: item.episode.imageUrl ?? item.podcast?.artworkUrl }}
        style={styles.thumbnail}
        contentFit="cover"
        // expo-image defaults to 'disk', which still costs a decode on every mount — the
        // artwork visibly popped in when the row remounted. Memory cache paints it in the
        // same frame.
        cachePolicy="memory-disk"
      />
      <View style={styles.episodeContent}>
        <ThemedText style={styles.episodeTitle} numberOfLines={2}>
          {item.episode.title}
        </ThemedText>
        <View style={styles.episodeMeta}>
          {isDownloading && (
            <ThemedText type="small" themeColor="textSecondary">
              Downloading… {progress > 0 ? `${progress}%` : ''}
            </ThemedText>
          )}
          {status === 'pending' && (
            <ThemedText type="small" themeColor="textSecondary">
              Waiting…
            </ThemedText>
          )}
          {status === 'waiting-wifi' && (
            <ThemedText type="small" style={styles.waitingText}>
              Waiting for Wi-Fi
            </ThemedText>
          )}
          {status === 'error' && (
            <ThemedText type="small" style={styles.errorText}>
              Error
            </ThemedText>
          )}
          {status === 'complete' && item.episode.pubDate && (
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
            <View style={[styles.progressFill, { width: `${progress}%` }]} />
          </View>
        )}
      </View>
    </Pressable>
  );
});

/**
 * The watch queue, in the order the watch will download and play it.
 *
 * Position is priority: the watch's download worker always takes the first episode it
 * has not fetched yet, so dragging a row to the top makes it download next.
 */
export function WatchQueue({ connected }: { connected: boolean | null }) {
  const theme = useTheme();
  const subscriptions = getSubscriptions();
  const watchStatuses = useWatchStatuses();
  const { data: watchList = [], isLoading } = useWatchListQuery(subscriptions);
  const { reorder } = useWatchListMutations();

  const handleReorder = useCallback(
    (episodeGuid: string, toIndex: number) => {
      reorder.mutate({ episodeGuid, toIndex });
    },
    [reorder],
  );

  const renderRow = useCallback(
    (item: EnrichedDownloadItem) => (
      <WatchRow item={item} watchStatus={watchStatuses.get(item.episodeGuid)} />
    ),
    [watchStatuses],
  );

  return (
    <>
      {connected !== null && (
        <View
          style={[
            styles.banner,
            { backgroundColor: connected ? '#34C75920' : theme.backgroundElement },
          ]}>
          <ThemedText type="small" style={connected ? styles.connectedText : undefined}>
            {connected ? 'Watch connected' : 'No watch connected'}
          </ThemedText>
        </View>
      )}
      <QueueList
        items={watchList}
        renderRow={renderRow}
        onReorder={handleReorder}
        isLoading={isLoading}
        emptyText="No episodes queued for watch."
      />
    </>
  );
}

const styles = StyleSheet.create({
  banner: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    alignItems: 'center',
  },
  connectedText: {
    color: '#34C759',
  },
  episodeRow: {
    // A hard height, not a minimum: the drag maths positions rows at fixed multiples of
    // QUEUE_ROW_HEIGHT, so a row that grows taller would land on the wrong index.
    height: QUEUE_ROW_HEIGHT,
    flexDirection: 'row',
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
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
  errorText: {
    color: '#FF3B30',
  },
});
