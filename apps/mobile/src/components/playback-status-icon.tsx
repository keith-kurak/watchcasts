import { SymbolView } from 'expo-symbols';
import { StyleSheet, View } from 'react-native';

import { useAudio, useAudioStatus } from '@/lib/audio-context';
import { getPlaybackProgress } from '@/lib/storage';

export type PlaybackState = 'downloading' | 'not_started' | 'in_progress' | 'completed';

const COMPLETION_THRESHOLD = 0.95;

export function usePlaybackState(
  episodeGuid: string,
  downloadStatus?: string,
): PlaybackState {
  const { currentEpisode } = useAudio();
  const status = useAudioStatus();

  if (downloadStatus === 'downloading' || downloadStatus === 'pending') {
    return 'downloading';
  }

  // If this episode is currently playing, use live status
  if (currentEpisode?.guid === episodeGuid) {
    if (status.duration > 0 && status.currentTime / status.duration >= COMPLETION_THRESHOLD) {
      return 'completed';
    }
    if (status.currentTime > 0) {
      return 'in_progress';
    }
  }

  // Check persisted progress
  const saved = getPlaybackProgress(episodeGuid);
  if (saved && saved.duration > 0) {
    if (saved.position / saved.duration >= COMPLETION_THRESHOLD) {
      return 'completed';
    }
    if (saved.position > 5) {
      return 'in_progress';
    }
  }

  return 'not_started';
}

const STATE_COLORS: Record<PlaybackState, string> = {
  downloading: '#8E8E93',
  not_started: '#34C759',
  in_progress: '#FF9F0A',
  completed: '#8E8E93',
};

interface PhoneStatusIconProps {
  episodeGuid: string;
  downloadStatus?: string;
  size?: number;
}

export function PhoneStatusIcon({
  episodeGuid,
  downloadStatus,
  size = 24,
}: PhoneStatusIconProps) {
  const state = usePlaybackState(episodeGuid, downloadStatus);
  const color = STATE_COLORS[state];

  if (state === 'completed') {
    return (
      <View style={styles.icon}>
        <SymbolView
          name={{ ios: 'checkmark.circle', android: 'check_circle' }}
          size={size}
          tintColor={color}
        />
      </View>
    );
  }

  return (
    <View style={styles.icon}>
      <SymbolView
        name={{ ios: 'play.circle', android: 'play_circle' }}
        size={size}
        tintColor={color}
      />
    </View>
  );
}

interface WatchStatusIconProps {
  episodeGuid: string;
  downloadStatus?: string;
  size?: number;
}

export function WatchStatusIcon({
  episodeGuid,
  downloadStatus,
  size = 24,
}: WatchStatusIconProps) {
  const state = usePlaybackState(episodeGuid, downloadStatus);
  const color = STATE_COLORS[state];

  if (state === 'completed') {
    return (
      <View style={styles.icon}>
        <SymbolView
          name={{ ios: 'checkmark.circle', android: 'check_circle' }}
          size={size}
          tintColor={color}
        />
      </View>
    );
  }

  return (
    <View style={styles.icon}>
      <SymbolView
        name={{ ios: 'applewatch', android: 'watch' }}
        size={size}
        tintColor={color}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  icon: {
    padding: 4,
  },
});
