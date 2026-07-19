import { useAudioPlayerStatus } from 'expo-audio';
import { Image } from 'expo-image';
import { SymbolView } from 'expo-symbols';
import { useRef } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { QueueToggle } from '@/components/queue-toggle';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { WatchToggle } from '@/components/watch-toggle';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAudio } from '@/lib/audio-context';
import { formatDate, formatDuration, parseDurationToSeconds, stripHtml } from '@/lib/format';
import { getCachedEpisodes, getSubscriptions } from '@/lib/storage';
import type { Episode, Podcast } from '@/lib/types';

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
  const { player, currentEpisode, play, pause, resume } = useAudio();
  const status = useAudioPlayerStatus(player);
  const theme = useTheme();

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
  const activeDuration = isThisEpisode && status.duration > 0 ? status.duration : episodeDuration;
  const currentTime = isThisEpisode ? status.currentTime : 0;
  const progress = activeDuration > 0 ? currentTime / activeDuration : 0;

  function handlePlayPause() {
    if (!podcast) return;
    if (isThisEpisode) {
      if (status.playing) pause();
      else resume();
    } else {
      play(episode!, podcast);
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
          <QueueToggle podcastId={podcastId} episodeGuid={episode.guid} />
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

        {episode.audioUrl && (
          <PlaybackControls
            isPlaying={isPlaying}
            progress={progress}
            currentTime={currentTime}
            duration={activeDuration}
            onPlayPause={handlePlayPause}
            onSeek={async (seconds) => {
              if (isThisEpisode) await player.seekTo(seconds);
            }}
            theme={theme}
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

function PlaybackControls({
  isPlaying,
  progress,
  currentTime,
  duration,
  onPlayPause,
  onSeek,
  theme,
}: {
  isPlaying: boolean;
  progress: number;
  currentTime: number;
  duration: number;
  onPlayPause: () => void;
  onSeek: (seconds: number) => Promise<void>;
  theme: ReturnType<typeof useTheme>;
}) {
  const progressBarWidth = useRef<number>(0);

  return (
    <View style={styles.controls}>
      <Pressable onPress={onPlayPause} style={styles.playButton} hitSlop={8}>
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
          <Pressable
            style={styles.progressBarOuter}
            onPress={(e) => {
              const x = e.nativeEvent.locationX;
              if (progressBarWidth.current > 0) {
                const seekTime = (x / progressBarWidth.current) * duration;
                onSeek(Math.max(0, Math.min(seekTime, duration)));
              }
            }}
            onLayout={(e) => {
              progressBarWidth.current = e.nativeEvent.layout.width;
            }}>
            <View
              style={[
                styles.progressBarTrack,
                { backgroundColor: theme.backgroundElement },
              ]}>
              <View
                style={[
                  styles.progressBarFill,
                  {
                    backgroundColor: theme.text,
                    width: `${Math.min(progress * 100, 100)}%`,
                  },
                ]}
              />
            </View>
          </Pressable>
          <View style={styles.timeRow}>
            <ThemedText type="small" themeColor="textSecondary">
              {formatSeconds(currentTime)}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              -{formatSeconds(Math.max(0, duration - currentTime))}
            </ThemedText>
          </View>
        </View>
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
    alignItems: 'center',
    gap: Spacing.three,
  },
  playButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  progressContainer: {
    flex: 1,
    gap: Spacing.one,
  },
  progressBarOuter: {
    height: 24,
    justifyContent: 'center',
  },
  progressBarTrack: {
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 2,
  },
  timeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
});
