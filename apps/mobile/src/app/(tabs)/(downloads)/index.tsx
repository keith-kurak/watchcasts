import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PhoneQueue } from '@/components/phone-queue';
import { SegmentedTabs, type SegmentedTab } from '@/components/segmented-tabs';
import { ThemedView } from '@/components/themed-view';
import { WatchQueue } from '@/components/watch-queue';
import { useWatchRefresh } from '@/hooks/use-watch-refresh';

type QueueTab = 'watch' | 'phone';

const TABS: SegmentedTab<QueueTab>[] = [
  { value: 'watch', label: 'Watch', icon: { ios: 'applewatch', android: 'watch' } },
  { value: 'phone', label: 'Phone', icon: { ios: 'iphone', android: 'smartphone' } },
];

export default function DownloadsScreen() {
  const insets = useSafeAreaInsets();
  // Watch first: this is a watch-first podcatcher, and the watch queue is the one whose
  // order drives what actually downloads next.
  const [tab, setTab] = useState<QueueTab>('watch');
  const { connected, isSyncing, refresh } = useWatchRefresh();

  return (
    <ThemedView style={styles.container}>
      {/* No stack header, so the status bar is ours to clear. */}
      <View style={{ paddingTop: insets.top }}>
        <SegmentedTabs tabs={TABS} value={tab} onChange={setTab} />
      </View>
      {/*
        Both queues stay mounted and the inactive one is hidden, rather than swapping which
        one is rendered. Unmounting threw away every decoded thumbnail and each list's
        scroll position, so switching tabs flashed the artwork back in. `display: 'none'`
        costs no layout.
      */}
      <View style={[styles.pane, tab !== 'watch' && styles.hiddenPane]}>
        <WatchQueue connected={connected} isSyncing={isSyncing} onRefresh={refresh} />
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
  },
  pane: {
    flex: 1,
  },
  hiddenPane: {
    display: 'none',
  },
});
