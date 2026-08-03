import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import { useFocusEffect } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { SymbolView } from 'expo-symbols';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  useColorScheme,
  View,
} from 'react-native';

import { useQueryClient } from '@tanstack/react-query';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors, NowPlayingBarHeight, Spacing } from '@/constants/theme';
import { syncSettings } from '@/hooks/useWearDataLayer';
import { useDownloadContext } from '@/lib/download-context';
import { buildOpml, parseOpml } from '@/lib/opml';
import { fetchFeed } from '@/lib/rss';
import {
  addSubscription,
  getDownloads,
  getPlayNextEpisode,
  getSubscriptions,
  getSyncDownloads,
  getWatchList,
  getWifiOnlyDownloads,
  MAX_DOWNLOADS,
  mirrorWatchListToDownloads,
  setCachedEpisodes,
  setPlayNextEpisode,
  setSyncDownloads,
  setWifiOnlyDownloads,
} from '@/lib/storage';

const EXPORT_FILE_NAME = 'podcatch-subscriptions.opml';

/**
 * Push the whole settings payload to the watch.
 *
 * The Data Layer item carries every setting at once, so this always reads all of them
 * from storage. Sending a partial payload would leave the watch on a stale value for
 * whatever was omitted.
 */
function pushSettingsToWatch() {
  syncSettings({
    wifiOnlyDownloads: getWifiOnlyDownloads(),
    playNextEpisode: getPlayNextEpisode(),
  }).catch(() => {});
}

export default function SettingsScreen() {
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'dark' ? 'dark' : 'light'];

  const [subscriptionCount, setSubscriptionCount] = useState(0);
  const [busy, setBusy] = useState<'import' | 'export' | null>(null);
  const [wifiOnly, setWifiOnly] = useState(getWifiOnlyDownloads);
  const [playNext, setPlayNext] = useState(getPlayNextEpisode);
  const [syncDownloads, setSyncDownloadsState] = useState(getSyncDownloads);
  const { drainPendingDownloads } = useDownloadContext();
  const queryClient = useQueryClient();

  useFocusEffect(
    useCallback(() => {
      setSubscriptionCount(getSubscriptions().length);
    }, []),
  );

  function handleWifiOnlyChange(enabled: boolean) {
    setWifiOnly(enabled);
    setWifiOnlyDownloads(enabled);
    // The watch enforces this itself via its WorkManager constraint, so it needs
    // its own copy. Fire and forget — it re-syncs whenever the watch reconnects.
    pushSettingsToWatch();
    // Turning the restriction off should release anything it was holding, rather
    // than leave it waiting for a network change that already happened.
    if (!enabled) drainPendingDownloads();
  }

  function handlePlayNextChange(enabled: boolean) {
    setPlayNext(enabled);
    setPlayNextEpisode(enabled);
    // The watch has its own player, so it needs its own copy of this.
    pushSettingsToWatch();
  }

  /** Apply the watch queue to the phone and start fetching whatever is missing. */
  function applyDownloadSync() {
    setSyncDownloadsState(true);
    setSyncDownloads(true);
    const { removed, added } = mirrorWatchListToDownloads();
    queryClient.invalidateQueries({ queryKey: ['downloads'] });
    drainPendingDownloads();

    const parts: string[] = [];
    if (added > 0) parts.push(`${added} queued for download`);
    if (removed > 0) parts.push(`${removed} removed from this phone`);
    if (parts.length > 0) {
      Alert.alert('Downloads synced', parts.join(', ') + '.');
    }
  }

  function handleSyncDownloadsChange(enabled: boolean) {
    if (!enabled) {
      // Leaves both lists exactly as they are. They simply stop tracking each other.
      setSyncDownloadsState(false);
      setSyncDownloads(false);
      return;
    }

    // The watch wins, so anything held only by the phone is about to be deleted. Say how
    // much before doing it — the audio files go too.
    const watchGuids = new Set(getWatchList().map((w) => w.episodeGuid));
    const orphans = getDownloads().filter((d) => !watchGuids.has(d.episodeGuid)).length;

    if (orphans === 0) {
      applyDownloadSync();
      return;
    }

    Alert.alert(
      'Replace phone downloads?',
      `Your watch queue becomes the source of truth. ${
        orphans === 1
          ? '1 episode on this phone is not on your watch and will be deleted'
          : `${orphans} episodes on this phone are not on your watch and will be deleted`
      }.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Replace', style: 'destructive', onPress: applyDownloadSync },
      ],
    );
  }

  async function handleExport() {
    const podcasts = getSubscriptions();
    if (podcasts.length === 0) {
      Alert.alert('Nothing to export', 'You have no subscriptions yet.');
      return;
    }

    setBusy('export');
    try {
      const file = new File(Paths.cache, EXPORT_FILE_NAME);
      if (file.exists) file.delete();
      file.create();
      file.write(buildOpml(podcasts));

      if (!(await Sharing.isAvailableAsync())) {
        Alert.alert('Export failed', 'Sharing is not available on this device.');
        return;
      }
      await Sharing.shareAsync(file.uri, {
        // OPML has no widely-honoured mime type; plain XML is what the
        // Android share targets actually recognise.
        mimeType: 'application/xml',
        dialogTitle: 'Export subscriptions',
      });
    } catch (e: any) {
      Alert.alert('Export failed', e.message ?? 'Could not write the OPML file');
    } finally {
      setBusy(null);
    }
  }

  async function handleImport() {
    setBusy('import');
    try {
      // Many file providers report OPML as a generic type, so accept anything
      // and let the parser reject files that are not OPML.
      const result = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        copyToCacheDirectory: true,
      });
      if (result.canceled) return;

      const asset = result.assets[0];
      if (!asset) return;

      const xml = new File(asset.uri).textSync();
      const feeds = parseOpml(xml);
      if (feeds.length === 0) {
        Alert.alert('Nothing imported', 'That OPML file contains no feeds.');
        return;
      }

      const existing = new Set(getSubscriptions().map((s) => s.feedUrl));
      let added = 0;
      let skipped = 0;
      let failed = 0;

      for (const feed of feeds) {
        if (existing.has(feed.feedUrl)) {
          skipped++;
          continue;
        }
        try {
          const { podcast, episodes } = await fetchFeed(feed.feedUrl);
          addSubscription(podcast);
          setCachedEpisodes(podcast.id, episodes);
          existing.add(feed.feedUrl);
          added++;
        } catch {
          failed++;
        }
      }

      setSubscriptionCount(getSubscriptions().length);

      const parts = [`${added} added`];
      if (skipped > 0) parts.push(`${skipped} already subscribed`);
      if (failed > 0) parts.push(`${failed} failed`);
      Alert.alert('Import complete', parts.join(', ') + '.');
    } catch (e: any) {
      Alert.alert('Import failed', e.message ?? 'Could not read the OPML file');
    } finally {
      setBusy(null);
    }
  }

  return (
    <ThemedView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <ThemedText type="smallBold" themeColor="textSecondary" style={styles.sectionTitle}>
          SUBSCRIPTIONS
        </ThemedText>

        <SettingsRow
          icon={{ ios: 'square.and.arrow.down', android: 'file_open' }}
          title="Import from OPML"
          subtitle="Add podcasts from an OPML file"
          busy={busy === 'import'}
          disabled={busy != null}
          onPress={handleImport}
          backgroundColor={colors.backgroundElement}
          pressedColor={colors.backgroundSelected}
          tintColor={colors.text}
        />

        <SettingsRow
          icon={{ ios: 'square.and.arrow.up', android: 'share' }}
          title="Export to OPML"
          subtitle={
            subscriptionCount === 1
              ? 'Share 1 subscription as a file'
              : `Share ${subscriptionCount} subscriptions as a file`
          }
          busy={busy === 'export'}
          disabled={busy != null}
          onPress={handleExport}
          backgroundColor={colors.backgroundElement}
          pressedColor={colors.backgroundSelected}
          tintColor={colors.text}
        />

        <ThemedText
          type="smallBold"
          themeColor="textSecondary"
          style={[styles.sectionTitle, styles.sectionSpacing]}>
          DOWNLOADS
        </ThemedText>

        <SettingsSwitchRow
          icon={{ ios: 'wifi', android: 'wifi' }}
          title="Download on Wi-Fi only"
          subtitle="Applies to this phone and your watch. Episodes queued while you are on cellular wait until you are back on Wi-Fi."
          value={wifiOnly}
          onValueChange={handleWifiOnlyChange}
          backgroundColor={colors.backgroundElement}
          tintColor={colors.text}
        />

        <SettingsSwitchRow
          icon={{ ios: 'arrow.turn.down.right', android: 'skip_next' }}
          title="Play next episode"
          subtitle={`When an episode ends, start the next one in the queue. Applies to this phone and your watch. Each queue holds up to ${MAX_DOWNLOADS} episodes, in the order you drag them.`}
          value={playNext}
          onValueChange={handlePlayNextChange}
          backgroundColor={colors.backgroundElement}
          tintColor={colors.text}
        />

        <SettingsSwitchRow
          icon={{ ios: 'arrow.triangle.2.circlepath', android: 'sync_alt' }}
          title="Sync phone and watch downloads"
          subtitle="Keep both queues identical — same episodes, same order. Your watch queue wins when you turn this on."
          value={syncDownloads}
          onValueChange={handleSyncDownloadsChange}
          backgroundColor={colors.backgroundElement}
          tintColor={colors.text}
        />
      </ScrollView>
    </ThemedView>
  );
}

type SymbolName = React.ComponentProps<typeof SymbolView>['name'];

interface SettingsSwitchRowProps {
  icon: SymbolName;
  title: string;
  subtitle: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  backgroundColor: string;
  tintColor: string;
}

function SettingsSwitchRow({
  icon,
  title,
  subtitle,
  value,
  onValueChange,
  backgroundColor,
  tintColor,
}: SettingsSwitchRowProps) {
  return (
    <View style={[styles.row, { backgroundColor }]}>
      <View style={styles.rowIcon}>
        <SymbolView name={icon} size={24} tintColor={tintColor} />
      </View>
      <View style={styles.rowText}>
        <ThemedText style={styles.rowTitle}>{title}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {subtitle}
        </ThemedText>
      </View>
      <Switch value={value} onValueChange={onValueChange} />
    </View>
  );
}

interface SettingsRowProps {
  icon: SymbolName;
  title: string;
  subtitle: string;
  busy: boolean;
  disabled: boolean;
  onPress: () => void;
  backgroundColor: string;
  pressedColor: string;
  tintColor: string;
}

function SettingsRow({
  icon,
  title,
  subtitle,
  busy,
  disabled,
  onPress,
  backgroundColor,
  pressedColor,
  tintColor,
}: SettingsRowProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: pressed ? pressedColor : backgroundColor },
        disabled && !busy && styles.rowDisabled,
      ]}>
      <View style={styles.rowIcon}>
        {busy ? (
          <ActivityIndicator size="small" color={tintColor} />
        ) : (
          <SymbolView name={icon} size={24} tintColor={tintColor} />
        )}
      </View>
      <View style={styles.rowText}>
        <ThemedText style={styles.rowTitle}>{title}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {subtitle}
        </ThemedText>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: Spacing.three,
    paddingBottom: Spacing.three + NowPlayingBarHeight,
    gap: Spacing.two,
  },
  sectionTitle: {
    marginBottom: Spacing.one,
  },
  sectionSpacing: {
    marginTop: Spacing.three,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.three,
    borderRadius: Spacing.two,
    gap: Spacing.three,
  },
  rowDisabled: {
    opacity: 0.5,
  },
  rowIcon: {
    width: 24,
    alignItems: 'center',
  },
  rowText: {
    flex: 1,
    gap: 2,
  },
  rowTitle: {
    fontWeight: '600',
  },
});
