import { Image } from 'expo-image';
import { SymbolView } from 'expo-symbols';
import { Stack, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { FlatList, Platform, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { NowPlayingBarHeight, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatDate, formatDuration } from '@/lib/format';
import { useWatchListQuery, useWatchListMutations, type EnrichedDownloadItem } from '@/lib/queries';
import { getSubscriptions } from '@/lib/storage';
import { getConnectedNodes, sendForceDownload } from '@/hooks/useWearDataLayer';

export default function WatchScreen() {
  const router = useRouter();
  const theme = useTheme();
  const subscriptions = getSubscriptions();
  const { data: watchList = [], isLoading, refetch, isRefetching } = useWatchListQuery(subscriptions);
  const { triggerSync } = useWatchListMutations();
  const [connected, setConnected] = useState<boolean | null>(null);

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

  const handleRefresh = useCallback(() => {
    checkConnection();
    triggerSync();
    sendForceDownload().catch(() => {});
  }, [checkConnection, triggerSync]);

  function renderItem({ item }: { item: EnrichedDownloadItem }) {
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
      </Pressable>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen
        options={{
          headerRight: () => (
            <Pressable onPress={handleRefresh}>
              <SymbolView name={{ ios: 'arrow.trianglehead.2.clockwise', android: 'sync' }} size={22} tintColor={theme.text} />
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
        keyExtractor={(item) => item.episodeGuid}
        refreshing={isRefetching}
        onRefresh={() => refetch()}
        contentContainerStyle={styles.list}
        renderItem={renderItem}
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
  emptyText: {
    textAlign: 'center',
    marginTop: Spacing.six,
  },
});
