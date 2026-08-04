import {
  createAudioPlayer,
  requestNotificationPermissionsAsync,
  setAudioModeAsync,
  useAudioPlayerStatus,
  type AudioPlayer,
  type AudioStatus,
} from 'expo-audio';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Platform } from 'react-native';

import { getPlaybackProgress, setPlaybackProgress } from '@/lib/storage';
import type { Episode, Podcast } from '@/lib/types';

interface NowPlaying {
  episode: Episode;
  podcast: Podcast;
}

interface AudioContextValue {
  player: AudioPlayer;
  currentEpisode: Episode | null;
  currentPodcast: Podcast | null;
  playbackRate: number;
  play: (episode: Episode, podcast: Podcast, localUri?: string) => void;
  pause: () => void;
  resume: () => void;
  seekTo: (seconds: number) => Promise<void>;
  setPlaybackRate: (rate: number) => void;
}

const AudioContext = createContext<AudioContextValue | null>(null);

export function AudioProvider({ children }: { children: React.ReactNode }) {
  // Lazy state rather than a ref: the player is a plain value the whole tree depends on,
  // and reading it out of a ref during render is what the refs lint rule exists to stop.
  // The initialiser runs once, so still only one player is ever created.
  const [player] = useState<AudioPlayer>(() =>
    createAudioPlayer(null, { updateInterval: 500 }),
  );
  const [nowPlaying, setNowPlaying] = useState<NowPlaying | null>(null);
  const [playbackRate, setPlaybackRateState] = useState(1);
  const playRetryRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    setAudioModeAsync({
      playsInSilentMode: true,
      shouldPlayInBackground: true,
      interruptionMode: 'doNotMix',
    });
  }, []);

  /**
   * What is loaded right now, readable from a callback.
   *
   * The status listener below is registered once per player, so it cannot close over
   * `nowPlaying` state — it would keep seeing whatever was loaded when it was registered,
   * which is `null`. That is what stopped the periodic progress save from ever writing.
   */
  const nowPlayingRef = useRef<NowPlaying | null>(null);
  useEffect(() => {
    nowPlayingRef.current = nowPlaying;
  }, [nowPlaying]);

  const clearPlayRetry = useCallback(() => {
    if (playRetryRef.current) {
      clearInterval(playRetryRef.current);
      playRetryRef.current = null;
    }
  }, []);

  const saveProgress = useCallback(() => {
    const ep = nowPlayingRef.current?.episode;
    if (!ep || !player) return;
    const pos = player.currentTime;
    const dur = player.duration;
    if (dur > 0) {
      setPlaybackProgress(ep.guid, { position: pos, duration: dur });
    }
  }, [player]);

  const play = useCallback(
    async (episode: Episode, podcast: Podcast, localUri?: string) => {
      const uri = localUri ?? episode.audioUrl;
      if (!uri) return;
      // Save progress of currently playing episode before switching
      saveProgress();
      clearPlayRetry();
      player.replace({ uri });
      // Resume from saved position if the episode was previously in progress
      const saved = getPlaybackProgress(episode.guid);
      if (saved && saved.duration > 0 && saved.position / saved.duration < 0.95) {
        player.seekTo(saved.position);
      }
      player.play();
      setNowPlaying({ episode, podcast });

      // On Android, play() right after replace() may silently fail while
      // the source is still loading. Retry every 500ms until it starts.
      let retries = 0;
      playRetryRef.current = setInterval(() => {
        retries++;
        if (retries >= 20) {
          clearPlayRetry();
          return;
        }
        if (!player.playing) {
          player.play();
        } else {
          clearPlayRetry();
        }
      }, 500);

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
    [player, saveProgress, clearPlayRetry],
  );

  // Stop retrying once playback starts, and periodically save progress
  const progressSaveRef = useRef(0);
  useEffect(() => {
    const sub = player.addListener('playbackStatusUpdate', (status) => {
      if (status.playing) clearPlayRetry();
      // Save progress every ~5 seconds (updateInterval is 500ms, so every 10 updates)
      progressSaveRef.current++;
      if (progressSaveRef.current >= 10) {
        progressSaveRef.current = 0;
        saveProgress();
      }
    });
    return () => sub.remove();
  }, [player, clearPlayRetry, saveProgress]);

  const value = useMemo<AudioContextValue>(
    () => ({
      player,
      currentEpisode: nowPlaying?.episode ?? null,
      currentPodcast: nowPlaying?.podcast ?? null,
      playbackRate,
      setPlaybackRate: (rate: number) => {
        player.setPlaybackRate(rate);
        setPlaybackRateState(rate);
      },
      play,
      pause: () => {
        clearPlayRetry();
        saveProgress();
        player.pause();
      },
      resume: () => {
        player.play();
      },
      seekTo: (seconds: number) => player.seekTo(seconds),
    }),
    [player, nowPlaying, playbackRate, play, saveProgress, clearPlayRetry],
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
