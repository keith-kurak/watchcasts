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

import {
  getCachedEpisodes,
  getDownloads,
  getPlaybackProgress,
  getPlayNextEpisode,
  getSubscriptions,
  setPlaybackProgress,
} from '@/lib/storage';
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
  // Lazy state rather than a ref: the player is a plain value the whole component tree
  // depends on, and reading it out of a ref during render is exactly what the refs lint
  // rule exists to stop. The initialiser runs once, so still only one player is created.
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
   * The status listener is registered once per player, so it cannot close over
   * `nowPlaying` state — it would keep seeing whatever was loaded when it was
   * registered. Both progress saving and auto-advance need the live value.
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

  /**
   * Start the next playable episode after the one that just finished.
   *
   * "Next" is the phone download list's own order, which the user drags — the same list
   * the Downloads tab shows. Episodes that are not downloaded yet are skipped rather
   * than streamed: this phone only ever plays local files.
   */
  const playNextEpisode = useCallback(() => {
    const finished = nowPlayingRef.current?.episode;
    if (!finished) return;

    const downloads = getDownloads();
    const currentIndex = downloads.findIndex((d) => d.episodeGuid === finished.guid);
    if (currentIndex === -1) return;

    const subscriptions = getSubscriptions();
    for (const item of downloads.slice(currentIndex + 1)) {
      if (item.status !== 'complete' || !item.localPath) continue;
      const episode = getCachedEpisodes(item.podcastId)?.find(
        (e) => e.guid === item.episodeGuid,
      );
      const podcast = subscriptions.find((s) => s.id === item.podcastId);
      if (episode && podcast) {
        play(episode, podcast, item.localPath);
        return;
      }
    }
  }, [play]);

  // Stop retrying once playback starts, save progress periodically, and advance when an
  // episode ends.
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
      if (status.didJustFinish) {
        // Read the setting at the moment it matters, so toggling it mid-episode takes
        // effect without having to restart playback.
        if (getPlayNextEpisode()) playNextEpisode();
      }
    });
    return () => sub.remove();
  }, [player, clearPlayRetry, saveProgress, playNextEpisode]);

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
