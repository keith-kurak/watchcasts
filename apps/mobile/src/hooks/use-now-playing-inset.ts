import { NowPlayingBarHeight } from '@/constants/theme';
import { useAudio } from '@/lib/audio-context';

/**
 * Space a scrollable screen should leave clear for the now-playing bar.
 *
 * The bar is absolutely positioned and renders nothing when no episode is loaded, so a
 * fixed padding left a bar-sized gap at the bottom of every list whenever playback was
 * stopped. Zero until something is actually playing.
 */
export function useNowPlayingInset(): number {
  const { currentEpisode } = useAudio();
  return currentEpisode ? NowPlayingBarHeight : 0;
}
