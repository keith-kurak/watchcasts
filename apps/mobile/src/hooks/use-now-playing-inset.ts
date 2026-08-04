import { NowPlayingBarHeight } from '@/constants/theme';
import { useAudio } from '@/lib/audio-context';

/**
 * Space a screen should leave clear for the now-playing bar.
 *
 * The bar is absolutely positioned and renders nothing when no episode is loaded, so
 * reserving its height unconditionally leaves a bar-sized gap whenever playback is
 * stopped. Zero until something is actually loaded.
 */
export function useNowPlayingInset(): number {
  const { currentEpisode } = useAudio();
  return currentEpisode ? NowPlayingBarHeight : 0;
}
