import {
  createAudioPlayer,
  requestNotificationPermissionsAsync,
  setAudioModeAsync,
  useAudioPlayerStatus,
  type AudioPlayer,
  type AudioStatus,
} from 'expo-audio';
import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Platform } from 'react-native';

import type { Episode, Podcast } from '@/lib/types';

interface NowPlaying {
  episode: Episode;
  podcast: Podcast;
}

interface AudioContextValue {
  player: AudioPlayer;
  currentEpisode: Episode | null;
  currentPodcast: Podcast | null;
  play: (episode: Episode, podcast: Podcast) => void;
  pause: () => void;
  resume: () => void;
  seekTo: (seconds: number) => Promise<void>;
}

const AudioContext = createContext<AudioContextValue | null>(null);

export function AudioProvider({ children }: { children: React.ReactNode }) {
  const playerRef = useRef<AudioPlayer | null>(null);
  const [nowPlaying, setNowPlaying] = useState<NowPlaying | null>(null);

  if (!playerRef.current) {
    playerRef.current = createAudioPlayer(null, { updateInterval: 500 });
  }
  const player = playerRef.current;

  useEffect(() => {
    setAudioModeAsync({
      playsInSilentMode: true,
      shouldPlayInBackground: true,
      interruptionMode: 'doNotMix',
    });
  }, []);

  const value = useMemo<AudioContextValue>(
    () => ({
      player,
      currentEpisode: nowPlaying?.episode ?? null,
      currentPodcast: nowPlaying?.podcast ?? null,
      play: async (episode: Episode, podcast: Podcast) => {
        if (!episode.audioUrl) return;
        player.replace({ uri: episode.audioUrl });
        player.play();
        setNowPlaying({ episode, podcast });

        if (Platform.OS === 'android') {
          await requestNotificationPermissionsAsync();
        }
        try {
          player.setActiveForLockScreen(true, {
            title: episode.title,
            artist: podcast.author ?? podcast.title,
            artworkUrl: episode.imageUrl ?? podcast.artworkUrl,
          });
        } catch {
          // Lock screen controls may fail on dev builds; non-critical
        }
      },
      pause: () => player.pause(),
      resume: () => player.play(),
      seekTo: (seconds: number) => player.seekTo(seconds),
    }),
    [player, nowPlaying],
  );

  return <AudioContext.Provider value={value}>{children}</AudioContext.Provider>;
}

export function useAudio() {
  const ctx = useContext(AudioContext);
  if (!ctx) throw new Error('useAudio must be used within AudioProvider');
  return ctx;
}

export function useAudioStatus(): AudioStatus {
  const { player } = useAudio();
  return useAudioPlayerStatus(player);
}
