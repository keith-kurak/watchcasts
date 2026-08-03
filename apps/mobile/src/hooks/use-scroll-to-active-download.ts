import type { LegendListRef } from '@legendapp/list/react-native';
import { useIsFocused } from 'expo-router';
import { useEffect, useRef } from 'react';
import { InteractionManager } from 'react-native';

/**
 * Scroll a download list to the bottom when the tab is opened while something is
 * downloading.
 *
 * On the Phone tab this lands on the active download: items are appended as they are
 * queued, so the newest — the one you just started and came to check on — is last.
 *
 * On the Watch tab it is only a heuristic. The watch works through its queue in list
 * order and downloads the first episode that lacks a local file, which can sit
 * anywhere. Scrolling to the end still reveals the most recently queued episodes,
 * but it is not guaranteed to show the one in flight.
 *
 * Scrolls at most once per visit, so it never fights a manual scroll and never jumps
 * again as progress ticks in.
 *
 * @param listRef the list to scroll
 * @param hasActiveDownload whether anything is currently downloading
 */
export function useScrollToActiveDownload(
  listRef: React.RefObject<LegendListRef | null>,
  hasActiveDownload: boolean,
) {
  const isFocused = useIsFocused();
  const hasScrolledThisVisit = useRef(false);

  useEffect(() => {
    if (!isFocused) {
      // Arm for the next visit. Done on blur rather than focus so a download that
      // starts while you are already looking at the tab does not yank the list.
      hasScrolledThisVisit.current = false;
      return;
    }
    if (hasScrolledThisVisit.current || !hasActiveDownload) return;
    hasScrolledThisVisit.current = true;

    // Wait for the tab transition to settle. Scrolling mid-animation lands short,
    // because the list has not finished laying out its rows.
    const handle = InteractionManager.runAfterInteractions(() => {
      listRef.current?.scrollToEnd({ animated: true });
    });
    return () => handle.cancel();
  }, [isFocused, hasActiveDownload, listRef]);
}
