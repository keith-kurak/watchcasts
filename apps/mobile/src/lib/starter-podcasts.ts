import { fetchFeed } from '@/lib/rss';
import { addSubscription, getSubscriptions, setCachedEpisodes } from '@/lib/storage';

/**
 * A handful of shows to subscribe to in one tap, so a fresh install has something in it.
 *
 * Feed URLs, not Apple Podcasts links: resolving an Apple link costs an extra lookup per
 * show, and it is a second thing that can fail on a first run.
 *
 * The names are here only for the failure message. Everything else — title, artwork,
 * author — comes from the feed, exactly as it does for a manually added podcast.
 */
export const STARTER_PODCASTS = [
  { name: 'NPR News Now', feedUrl: 'https://feeds.npr.org/500005/podcast.xml' },
  { name: 'Retronauts', feedUrl: 'https://retronauts.libsyn.com/rss' },
  { name: 'The Vergecast', feedUrl: 'https://feeds.megaphone.fm/vergecast' },
  { name: 'Acquired', feedUrl: 'https://feeds.transistor.fm/acquired' },
  {
    name: 'Axe of the Blood God',
    feedUrl: 'https://feeds.megaphone.fm/LDSPO7715218750',
  },
  {
    name: 'This Day',
    feedUrl: 'https://rss.pdrl.fm/2d6447/thisday.feed.electionhistory.show/',
  },
  // WIRED's show. Several unrelated podcasts share the name, so the feed id is the only
  // unambiguous way to name it.
  { name: 'Uncanny Valley', feedUrl: 'https://feeds.megaphone.fm/CNE6423132305' },
  {
    name: 'Talking Simpsons',
    feedUrl: 'https://rss.libsyn.com/shows/73326/destinations/317509.xml',
  },
] as const;

export interface StarterResult {
  added: number;
  /** Names of shows whose feed could not be fetched or parsed. */
  failed: string[];
}

/**
 * Subscribe to every starter show that is not already subscribed.
 *
 * Feeds are fetched concurrently — six sequential round trips is a long wait on a first
 * run — but written in list order afterwards, so the subscription list does not come out
 * shuffled by whichever feed happened to answer first.
 *
 * One dead feed does not sink the rest. A show that fails is named back to the caller
 * rather than silently missing.
 */
export async function subscribeToStarterPodcasts(): Promise<StarterResult> {
  const results = await Promise.all(
    STARTER_PODCASTS.map(async (starter) => {
      try {
        return { starter, feed: await fetchFeed(starter.feedUrl) };
      } catch {
        return { starter, feed: null };
      }
    }),
  );

  const existing = new Set(getSubscriptions().map((s) => s.id));
  let added = 0;
  const failed: string[] = [];

  for (const { starter, feed } of results) {
    if (!feed) {
      failed.push(starter.name);
      continue;
    }
    if (existing.has(feed.podcast.id)) continue;
    addSubscription(feed.podcast);
    // Cached alongside the subscription so each show's episode list is populated the
    // first time it is opened, matching what adding a podcast by hand does.
    setCachedEpisodes(feed.podcast.id, feed.episodes);
    existing.add(feed.podcast.id);
    added++;
  }

  return { added, failed };
}
