import { useAudioPlayerStatus } from 'expo-audio';
import { Image } from 'expo-image';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { BottomTabInset, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAudio } from '@/lib/audio-context';

let SymbolView: React.ComponentType<{ name: string; size?: number; tintColor?: string }> | null =
  null;
if (Platform.OS === 'ios') {
  try {
    SymbolView = require('expo-symbols').SymbolView;
  } catch {}
}

export function NowPlayingBar() {
  const { player, currentEpisode, currentPodcast, pause, resume } = useAudio();
  const status = useAudioPlayerStatus(player);
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  if (!currentEpisode) return null;

  const progress = status.duration > 0 ? status.currentTime / status.duration : 0;
  const imageUri = currentEpisode.imageUrl ?? currentPodcast?.artworkUrl;

  return (
    <View style={[styles.wrapper, { backgroundColor: theme.backgroundElement, bottom: BottomTabInset + insets.bottom }]}>
      <View style={[styles.progressLine, { backgroundColor: theme.backgroundSelected }]}>
        <View
          style={[
            styles.progressLineFill,
            { backgroundColor: theme.text, width: `${Math.min(progress * 100, 100)}%` },
          ]}
        />
      </View>
      <View style={styles.content}>
        {imageUri && (
          <Image source={{ uri: imageUri }} style={styles.artwork} contentFit="cover" />
        )}
        <ThemedText style={styles.title} numberOfLines={1}>
          {currentEpisode.title}
        </ThemedText>
        <Pressable
          onPress={() => (status.playing ? pause() : resume())}
          hitSlop={8}
          style={styles.playPause}>
          {SymbolView ? (
            <SymbolView
              name={status.playing ? 'pause.fill' : 'play.fill'}
              size={20}
              tintColor={theme.text}
            />
          ) : (
            <ThemedText style={styles.playPauseText}>
              {status.playing ? '⏸' : '▶'}
            </ThemedText>
          )}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    left: 0,
    right: 0,
    overflow: 'hidden',
  },
  progressLine: {
    height: 2,
  },
  progressLineFill: {
    height: '100%',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    gap: Spacing.two,
    height: 56,
  },
  artwork: {
    width: 40,
    height: 40,
    borderRadius: 6,
  },
  title: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
  },
  playPause: {
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  playPauseText: {
    fontSize: 18,
  },
});
