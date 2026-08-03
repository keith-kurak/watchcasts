import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useCallback } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { QueueList, QUEUE_ROW_HEIGHT } from '@/components/queue-list';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useDownloadContext } from '@/lib/download-context';
import { formatDate, formatDuration } from '@/lib/format';
import { useDownloadMutations, useDownloadsQuery, type EnrichedDownloadItem } from '@/lib/queries';
import { getSubscriptions } from '@/lib/storage';

function PhoneRow({ item }: { item: EnrichedDownloadItem }) {
  const router = useRouter();
  const theme = useTheme();
  const { getProgress, isWaitingForWifi } = useDownloadContext();
  const progress = getProgress(item.episodeGuid);
  const isDownloading = item.status === 'downloading' || progress != null;
  const waitingForWifi = item.status === 'pending' && !isDownloading && isWaitingForWifi;

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
        // See watch-queue.tsx — 'disk' alone re-decodes on every mount.
        cachePolicy="memory-disk"
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
            <ThemedText type="small" style={styles.errorText}>
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
              style={[styles.progressFill, { width: `${Math.round((progress ?? 0) * 100)}%` }]}
            />
          </View>
        )}
      </View>
    </Pressable>
  );
}

/** Episodes downloaded to this phone, in playback order. */
export function PhoneQueue() {
  const subscriptions = getSubscriptions();
  const { data: downloads = [], isLoading } = useDownloadsQuery(subscriptions);
  const { reorder } = useDownloadMutations();

  const handleReorder = useCallback(
    (episodeGuid: string, toIndex: number) => {
      reorder.mutate({ episodeGuid, toIndex });
    },
    [reorder],
  );

  const renderRow = useCallback((item: EnrichedDownloadItem) => <PhoneRow item={item} />, []);

  return (
    <QueueList
      items={downloads}
      renderRow={renderRow}
      onReorder={handleReorder}
      isLoading={isLoading}
      emptyText="No episodes on phone."
    />
  );
}

const styles = StyleSheet.create({
  episodeRow: {
    // See watch-queue.tsx — the drag maths requires a fixed row height.
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
