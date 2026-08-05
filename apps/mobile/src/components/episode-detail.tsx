import BottomSheetComponent, { BottomSheetView } from '@expo/ui/community/bottom-sheet';
import { Slider } from '@expo/ui/community/slider';
import { Host, Slider as ComposeSlider } from '@expo/ui/jetpack-compose';
import { fillMaxWidth } from '@expo/ui/jetpack-compose/modifiers';
import { useAudioPlayerStatus } from 'expo-audio';
import { Image } from 'expo-image';
import { SymbolView } from 'expo-symbols';
import { useCallback, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { DownloadToggle } from '@/components/download-toggle';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { WatchToggle } from '@/components/watch-toggle';
import { NowPlayingBarHeight, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAudio } from '@/lib/audio-context';
import { formatDate, formatDuration, parseDurationToSeconds, stripHtml } from '@/lib/format';
import { useIsInDownloads } from '@/lib/queries';
import { getCachedEpisodes, getPlaybackProgress, getSubscriptions } from '@/lib/storage';
import type { Episode, Podcast } from '@/lib/types';

// Shared height for the slider and the buttons beside it, so their centre lines
// match. 48 keeps the play button at the minimum touch target size.
const SliderRowHeight = 48;

function formatSeconds(s: number): string {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  return `${m}:${String(sec).padStart(2, '0')}`;
}

interface EpisodeDetailProps {
  episodeId: string;
  podcastId: string;
}

export function EpisodeDetail({ episodeId, podcastId }: EpisodeDetailProps) {
  const podcast: Podcast | undefined = getSubscriptions().find((s) => s.id === podcastId);
  const episodes = getCachedEpisodes(podcastId) ?? [];
  const episode: Episode | undefined = episodes.find((e) => e.guid === episodeId);
  const { player, currentEpisode, play, pause, resume, playbackRate, setPlaybackRate } = useAudio();
  const status = useAudioPlayerStatus(player);
  const theme = useTheme();
  const { data: downloadItem } = useIsInDownloads(episodeId);

  if (!episode) {
    return (
      <ThemedView style={styles.container}>
        <ThemedText style={styles.notFound}>Episode not found.</ThemedText>
      </ThemedView>
    );
  }

  const isThisEpisode = currentEpisode?.guid === episode.guid;
  const isPlaying = isThisEpisode && status.playing;

  const imageUri = episode.imageUrl ?? podcast?.artworkUrl;
  const episodeDuration = parseDurationToSeconds(episode.duration);
  const savedProgress = !isThisEpisode ? getPlaybackProgress(episode.guid) : null;
  const activeDuration = isThisEpisode && status.duration > 0 ? status.duration : episodeDuration;
  const currentTime = isThisEpisode ? status.currentTime : (savedProgress?.position ?? 0);

  const isDownloaded = downloadItem?.status === 'complete';
  const canPlay = isDownloaded || isThisEpisode;

  function handlePlayPause() {
    if (!podcast) return;
    if (isThisEpisode) {
      if (status.playing) pause();
      else resume();
    } else if (isDownloaded) {
      play(episode!, podcast, downloadItem?.localPath);
    }
  }

  return (
    <ThemedView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        {imageUri && (
          <Image source={{ uri: imageUri }} style={styles.image} contentFit="cover" />
        )}
        <View style={styles.titleRow}>
          <ThemedText style={styles.title}>{episode.title}</ThemedText>
          <WatchToggle podcastId={podcastId} episodeGuid={episode.guid} />
          <DownloadToggle podcastId={podcastId} episodeGuid={episode.guid} audioUrl={episode.audioUrl} />
        </View>
        <View style={styles.meta}>
          {episode.pubDate && (
            <ThemedText type="small" themeColor="textSecondary">
              {formatDate(episode.pubDate)}
            </ThemedText>
          )}
          {episode.duration && (
            <ThemedText type="small" themeColor="textSecondary">
              {formatDuration(episode.duration)}
            </ThemedText>
          )}
        </View>

        {(canPlay || episode.audioUrl) && (
          <PlaybackControls
            isPlaying={isPlaying}
            currentTime={currentTime}
            duration={activeDuration}
            onPlayPause={handlePlayPause}
            onSeek={async (seconds) => {
              if (isThisEpisode) await player.seekTo(seconds);
            }}
            playbackRate={playbackRate}
            onPlaybackRateChange={setPlaybackRate}
            theme={theme}
            disabled={!canPlay && !isThisEpisode}
          />
        )}

        {episode.description && (
          <ThemedText style={styles.description}>
            {stripHtml(episode.description)}
          </ThemedText>
        )}
      </ScrollView>
    </ThemedView>
  );
}

function formatRate(rate: number): string {
  return rate % 1 === 0 ? `${rate}x` : `${rate.toFixed(1)}x`;
}

function PlaybackControls({
  isPlaying,
  currentTime,
  duration,
  onPlayPause,
  onSeek,
  playbackRate,
  onPlaybackRateChange,
  theme,
  disabled,
}: {
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  onPlayPause: () => void;
  onSeek: (seconds: number) => Promise<void>;
  playbackRate: number;
  onPlaybackRateChange: (rate: number) => void;
  theme: ReturnType<typeof useTheme>;
  disabled?: boolean;
}) {
  const sheetRef = useRef<BottomSheetComponent>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  // While the thumb is held, `scrubTime` overrides the live playback position so
  // incoming status updates don't yank the thumb back under the finger.
  const [scrubTime, setScrubTime] = useState<number | null>(null);
  const scrubTimeRef = useRef<number>(0);
  const displayTime = scrubTime ?? currentTime;

  const handleSpeedPress = useCallback(() => {
    setSheetOpen(true);
    // expand after mount on next frame
    requestAnimationFrame(() => sheetRef.current?.expand());
  }, []);

  return (
    <View style={styles.controls}>
      <Pressable onPress={onPlayPause} style={[styles.playButton, disabled && { opacity: 0.4 }]} hitSlop={8} disabled={disabled}>
        <View pointerEvents="none">
          <SymbolView
            name={
              isPlaying
                ? { ios: 'pause.fill', android: 'pause' }
                : { ios: 'play.fill', android: 'play_arrow' }
            }
            size={28}
            tintColor={theme.text}
          />
        </View>
      </Pressable>

      {duration > 0 && (
        <View style={styles.progressContainer}>
          <Host style={styles.sliderRow} useViewportSizeMeasurement>
            <ComposeSlider
              min={0}
              max={duration}
              value={Math.min(displayTime, duration)}
              enabled={!disabled}
              colors={{
                thumbColor: theme.text,
                activeTrackColor: theme.text,
                inactiveTrackColor: theme.backgroundElement,
              }}
              onValueChange={(value) => {
                scrubTimeRef.current = value;
                setScrubTime(value);
              }}
              onValueChangeFinished={() => {
                const target = Math.max(0, Math.min(scrubTimeRef.current, duration));
                // Hold `scrubTime` across the seek. Clearing it first would show
                // the pre-seek position for a frame, which reads as a flash.
                setScrubTime(target);
                onSeek(target).finally(() => setScrubTime(null));
              }}
              modifiers={[fillMaxWidth()]}
            />
          </Host>
          <View style={styles.timeRow}>
            <ThemedText type="small" themeColor="textSecondary">
              {formatSeconds(displayTime)}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              -{formatSeconds(Math.max(0, duration - displayTime))}
            </ThemedText>
          </View>
        </View>
      )}

      <Pressable onPress={handleSpeedPress} style={styles.speedButton} hitSlop={8}>
        <ThemedText style={styles.speedButtonText}>{formatRate(playbackRate)}</ThemedText>
      </Pressable>

      {sheetOpen && (
        <BottomSheetComponent
          ref={sheetRef}
          index={-1}
          enablePanDownToClose
          onClose={() => setSheetOpen(false)}
        >
          <BottomSheetView style={styles.sheetContent}>
            <ThemedText style={styles.sheetTitle}>
              Playback Speed: {formatRate(playbackRate)}
            </ThemedText>
            <Slider
              minimumValue={0.5}
              maximumValue={2}
              step={0.1}
              value={playbackRate}
              onValueChange={(value) => {
                onPlaybackRateChange(Math.round(value * 10) / 10);
              }}
            />
            <View style={styles.sliderLabels}>
              <ThemedText type="small" themeColor="textSecondary">0.5x</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">1x</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">1.5x</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">2x</ThemedText>
            </View>
          </BottomSheetView>
        </BottomSheetComponent>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: Spacing.three,
    paddingBottom: Spacing.three + NowPlayingBarHeight,
    gap: Spacing.three,
  },
  image: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 12,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.two,
  },
  title: {
    flex: 1,
    fontSize: 22,
    fontWeight: '700',
    lineHeight: 28,
  },
  meta: {
    flexDirection: 'row',
    gap: Spacing.three,
  },
  description: {
    fontSize: 15,
    lineHeight: 22,
  },
  notFound: {
    textAlign: 'center',
    marginTop: Spacing.six,
  },
  controls: {
    flexDirection: 'row',
    // Top-aligned, not centered: the progress column is taller than the buttons
    // because of the time row below it. Centering the column would push the
    // slider above the buttons. Each child is SliderRowHeight tall instead, so
    // all three centre lines land together on the slider.
    alignItems: 'flex-start',
    gap: Spacing.three,
  },
  playButton: {
    width: 48,
    height: SliderRowHeight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  speedButton: {
    paddingHorizontal: 8,
    height: SliderRowHeight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  speedButtonText: {
    fontSize: 17,
    fontWeight: '600',
  },
  sheetContent: {
    padding: Spacing.three,
    gap: Spacing.two,
  },
  sheetTitle: {
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  sliderLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  progressContainer: {
    flex: 1,
    gap: Spacing.one,
  },
  sliderRow: {
    height: SliderRowHeight,
    justifyContent: 'center',
  },
  timeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
});
