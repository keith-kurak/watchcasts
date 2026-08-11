import { LegendList, type LegendListRef } from '@legendapp/list/react-native';
import { Image } from 'expo-image';
import { SymbolView } from 'expo-symbols';
import { Stack, useRouter } from 'expo-router';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, View } from 'react-native';

import { RetryDialog } from '@/components/retry-dialog';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { NowPlayingBarHeight, Spacing } from '@/constants/theme';
import { useScrollToActiveDownload } from '@/hooks/use-scroll-to-active-download';
import { useTheme } from '@/hooks/use-theme';
import { formatBytes, formatDate, formatDuration } from '@/lib/format';
import { useWatchListQuery, useWatchListMutations, type EnrichedDownloadItem } from '@/lib/queries';
import { getSubscriptions } from '@/lib/storage';
import {
  getConnectedNodes,
  sendForceDownload,
  requestWatchDownloadStatus,
  retryWatchEpisode,
} from '@/hooks/useWearDataLayer';
import { useWatchStatuses } from '@/lib/watch-status-context';
import type { WatchEpisodeStatus } from '../../../../modules/wear-data-layer/src';

/** Minimum time the refresh spinner stays visible, so it does not just flicker. */
const MIN_SPINNER_MS = 600;

const ESTIMATED_ROW_HEIGHT = 76;

const WatchRow = memo(function WatchRow({
  item,
  watchStatus,
  onLongPress,
}: {
  item: EnrichedDownloadItem;
  watchStatus: WatchEpisodeStatus | undefined;
  onLongPress: () => void;
}) {
  const router = useRouter();
  const theme = useTheme();
  const status = watchStatus?.status ?? 'pending';
  const progress = watchStatus?.progress ?? 0;
  // What the watch measured beats what the feed claimed. Falls back to the feed size
  // until the download finishes, and for watch builds that do not report a size.
  const displaySize =
    watchStatus?.sizeBytes && watchStatus.sizeBytes > 0
      ? watchStatus.sizeBytes
      : item.sizeBytes;
  const isDownloading = status === 'downloading';

  return (
    <Pressable
      style={styles.episodeRow}
      onLongPress={onLongPress}
      onPress={() =>
        router.push({
          pathname: '/(tabs)/(watch)/episode/[episodeId]',
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
            <ThemedText type="small" style={{ color: '#FF3B30' }}>
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
          {/* Pushed to the far right of the meta row, level with the date and duration. */}
          {formatBytes(displaySize) !== '' && (
            <ThemedText type="small" themeColor="textSecondary" style={styles.sizeText}>
              {formatBytes(displaySize)}
            </ThemedText>
          )}
        </View>
        {isDownloading && (
          <View style={[styles.progressTrack, { backgroundColor: theme.backgroundElement }]}>
            <View
              style={[
                styles.progressFill,
                { width: `${progress}%` },
              ]}
            />
          </View>
        )}
      </View>
    </Pressable>
  );
});

export default function WatchScreen() {
  const router = useRouter();
  const theme = useTheme();
  const subscriptions = getSubscriptions();
  const watchStatuses = useWatchStatuses();
  const { data: watchList = [], isLoading, refetch, isRefetching } = useWatchListQuery(subscriptions);
  const { triggerSync } = useWatchListMutations();
  const [connected, setConnected] = useState<boolean | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  // A snapshot, not a guid to re-look-up. Retrying flips the status immediately, and a
  // lookup would go undefined underneath the dialog as it animates out.
  const [retryItem, setRetryItem] = useState<EnrichedDownloadItem | null>(null);
  const [retryVisible, setRetryVisible] = useState(false);

  const handleLongPress = useCallback(
    (item: EnrichedDownloadItem) => {
      // Only a failed download has anything to offer here. Opening an empty menu on a
      // healthy episode would be a dead end.
      if (watchStatuses.get(item.episodeGuid)?.status !== 'error') return;
      setRetryItem(item);
      setRetryVisible(true);
    },
    [watchStatuses],
  );

  const confirmRetry = useCallback(() => {
    const guid = retryItem?.episodeGuid;
    if (guid) {
      retryWatchEpisode(guid).catch(() => {});
      // The watch reports its own status back, which is what actually updates the row.
      // Nothing optimistic here: if the message is lost the row must keep saying Error.
    }
    setRetryVisible(false);
  }, [retryItem]);

  const listRef = useRef<LegendListRef>(null);
  const hasActiveDownload = watchList.some(
    (item) => watchStatuses.get(item.episodeGuid)?.status === 'downloading',
  );
  useScrollToActiveDownload(listRef, hasActiveDownload);

  const checkConnection = useCallback(() => {
    if (Platform.OS !== 'android') {
      setConnected(null);
      return;
    }
    getConnectedNodes().then((nodes) => setConnected(nodes.length > 0));
  }, []);

  useEffect(() => {
    checkConnection();
  }, [checkConnection]);

  const handleRefresh = useCallback(async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    try {
      checkConnection();
      triggerSync();
      await Promise.all([
        sendForceDownload().catch(() => {}),
        requestWatchDownloadStatus().catch(() => {}),
      ]);
      // These resolve as soon as the messages are handed to the Data Layer, which is
      // near-instant. Hold the spinner briefly so the refresh reads as an action
      // rather than a flicker.
      await new Promise((resolve) => setTimeout(resolve, MIN_SPINNER_MS));
    } finally {
      setIsSyncing(false);
    }
  }, [checkConnection, triggerSync, isSyncing]);

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen
        options={{
          headerRight: () => (
            <Pressable onPress={handleRefresh} disabled={isSyncing} hitSlop={8}>
              {isSyncing ? (
                <ActivityIndicator size="small" color={theme.text} />
              ) : (
                <SymbolView
                  name={{ ios: 'arrow.trianglehead.2.clockwise', android: 'sync' }}
                  size={22}
                  tintColor={theme.text}
                />
              )}
            </Pressable>
          ),
        }}
      />
      {connected !== null && Platform.OS === 'android' && (
        <View
          style={[
            styles.banner,
            { backgroundColor: connected ? '#34C75920' : theme.backgroundElement },
          ]}
        >
          <ThemedText type="small" style={connected ? styles.connectedText : undefined}>
            {connected ? 'Watch connected' : 'No watch connected'}
          </ThemedText>
        </View>
      )}
      <LegendList
        ref={listRef}
        data={watchList}
        extraData={watchStatuses}
        keyExtractor={(item) => item.episodeGuid}
        estimatedItemSize={ESTIMATED_ROW_HEIGHT}
        recycleItems
        refreshing={isRefetching}
        onRefresh={() => refetch()}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <WatchRow
            item={item}
            watchStatus={watchStatuses.get(item.episodeGuid)}
            onLongPress={() => handleLongPress(item)}
          />
        )}
        ListEmptyComponent={
          isLoading ? null : (
            <ThemedText type="small" themeColor="textSecondary" style={styles.emptyText}>
              No episodes queued for watch.
            </ThemedText>
          )
        }
      />

      <RetryDialog
        visible={retryVisible}
        episodeTitle={retryItem?.episode.title ?? ''}
        onConfirm={confirmRetry}
        onDismiss={() => setRetryVisible(false)}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  banner: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    alignItems: 'center',
  },
  connectedText: {
    color: '#34C759',
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
  waitingText: {
    color: '#FFB300',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#007AFF',
    borderRadius: 1.5,
  },
  emptyText: {
    textAlign: 'center',
    marginTop: Spacing.six,
  },
});
