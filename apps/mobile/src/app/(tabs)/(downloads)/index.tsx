import { SymbolView } from 'expo-symbols';
import { Stack } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { PhoneQueue } from '@/components/phone-queue';
import { SegmentedTabs, type SegmentedTab } from '@/components/segmented-tabs';
import { ThemedView } from '@/components/themed-view';
import { WatchQueue } from '@/components/watch-queue';
import { NowPlayingBarHeight } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useWatchRefresh } from '@/hooks/use-watch-refresh';

type QueueTab = 'watch' | 'phone';

const TABS: SegmentedTab<QueueTab>[] = [
  { value: 'watch', label: 'Watch', icon: { ios: 'applewatch', android: 'watch' } },
  { value: 'phone', label: 'Phone', icon: { ios: 'iphone', android: 'smartphone' } },
];

export default function DownloadsScreen() {
  const theme = useTheme();
  // Watch first: this is a watch-first podcatcher, and the watch queue is the one whose
  // order drives what actually downloads next.
  const [tab, setTab] = useState<QueueTab>('watch');
  const { connected, isSyncing, refresh } = useWatchRefresh();

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen
        options={{
          // Only the watch queue has anything to sync, so the control disappears with it
          // rather than sitting there inert on the phone tab.
          headerRight: () =>
            tab === 'watch' ? (
              <Pressable onPress={refresh} disabled={isSyncing} hitSlop={8}>
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
            ) : null,
        }}
      />
      <SegmentedTabs tabs={TABS} value={tab} onChange={setTab} />
      {/*
        Both queues stay mounted and the inactive one is hidden, rather than swapping which
        one is rendered. Unmounting threw away every decoded thumbnail and each list's
        scroll position, so switching tabs flashed the artwork back in. `display: 'none'`
        costs no layout.
      */}
      <View style={[styles.pane, tab !== 'watch' && styles.hiddenPane]}>
        <WatchQueue connected={connected} />
      </View>
      <View style={[styles.pane, tab !== 'phone' && styles.hiddenPane]}>
        <PhoneQueue />
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    // The queue lists set a fixed content height for the drag maths, so they cannot also
    // carry bottom content padding. Inset the viewport instead.
    paddingBottom: NowPlayingBarHeight,
  },
  pane: {
    flex: 1,
  },
  hiddenPane: {
    display: 'none',
  },
});
