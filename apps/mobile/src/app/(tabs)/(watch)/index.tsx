import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { FlatList, Platform, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { WatchStatusIcon } from '@/components/playback-status-icon';
import { NowPlayingBarHeight, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatDate, formatDuration } from '@/lib/format';
import { useWatchListQuery, type EnrichedDownloadItem } from '@/lib/queries';
import { getSubscriptions } from '@/lib/storage';
import { getConnectedNodes } from '@/hooks/useWearDataLayer';

export default function WatchScreen() {
  const router = useRouter();
  const theme = useTheme();
  const subscriptions = getSubscriptions();
  const { data: watchList = [], isLoading, refetch, isRefetching } = useWatchListQuery(subscriptions);
  const [connected, setConnected] = useState<boolean | null>(null);

  useEffect(() => {
    if (Platform.OS !== 'android') {
      setConnected(null);
      return;
    }
    getConnectedNodes().then((nodes) => setConnected(nodes.length > 0));
  }, []);

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
        <WatchStatusIcon episodeGuid={item.episodeGuid} />
      </Pressable>
    );
  }

  return (
    <ThemedView style={styles.container}>
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
