import AppTabs from '@/components/app-tabs';
import { NowPlayingBar } from '@/components/now-playing-bar';

/**
 * Back behaviour: leaving another tab returns here.
 *
 * This does NOT decide which tab opens first — that is settled by which group owns `/`.
 * Only `(subscriptions)/index.tsx` does; the other three groups use a named anchor route
 * (`downloads.tsx`, `watch.tsx`, `settings.tsx`) so they claim `/downloads`, `/watch` and
 * `/settings` instead. Before that, four groups all matched `/` and the alphabetically
 * first one — `(downloads)` — won, which opened the app on a bare list.
 *
 * Trigger order in `AppTabs` controls where each tab sits in the bar, and nothing else.
 */
export const unstable_settings = {
  anchor: '(subscriptions)',
};

export default function TabLayout() {
  return (
    <>
      <AppTabs />
      <NowPlayingBar />
    </>
  );
}
