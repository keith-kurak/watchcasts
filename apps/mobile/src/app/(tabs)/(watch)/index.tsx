import { Image } from 'expo-image';
import { SymbolView } from 'expo-symbols';
import { Stack, useRouter } from 'expo-router';
import { memo, useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Platform, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { NowPlayingBarHeight, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatDate, formatDuration } from '@/lib/format';
import { useWatchListQuery, useWatchListMutations, type EnrichedDownloadItem } from '@/lib/queries';
import { getSubscriptions } from '@/lib/storage';
import { getConnectedNodes, sendForceDownload, requestWatchDownloadStatus } from '@/hooks/useWearDataLayer';
import { useWatchStatuses } from '@/lib/watch-status-context';
import type { WatchEpisodeStatus } from '../../modules/wear-data-layer/src';

/** Minimum time the refresh spinner stays visible, so it does not just flicker. */
const MIN_SPINNER_MS = 600;

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
      style={styles.episodeRow}
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
      <FlatList
        data={watchList}
        extraData={watchStatuses}
        keyExtractor={(item) => item.episodeGuid}
        refreshing={isRefetching}
        onRefresh={() => refetch()}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <WatchRow item={item} watchStatus={watchStatuses.get(item.episodeGuid)} />
        )}
        ListEmptyComponent={
          isLoading ? null : (
            <ThemedText type="small" themeColor="textSecondary" style={styles.emptyText}>
              No episodes queued for watch.
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
