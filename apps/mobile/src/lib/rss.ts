import { XMLParser } from 'fast-xml-parser';

import type { Episode, Podcast } from './types';

// An RSS feed returns every episode in one document, so this is only an upper
// bound to keep memory in check. The podcast screen pages through the result.
const MAX_EPISODES = 1000;

function hashFeedUrl(url: string): string {
  let hash = 0;
  for (let i = 0; i < url.length; i++) {
    hash = (hash << 5) - hash + url.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

// Apple Podcasts share links look like
// https://podcasts.apple.com/us/podcast/the-daily/id1200361736?i=1000700000000
// The country and slug segments vary, and an episode link carries an extra
// `?i=`, but every form contains the show's numeric id as an `id<digits>` path
// segment.
const APPLE_PODCASTS_HOST = /(^|\.)(podcasts|itunes)\.apple\.com$/i;
const APPLE_SHOW_ID = /\/id(\d+)/;

export function parseApplePodcastsId(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (!APPLE_PODCASTS_HOST.test(parsed.hostname)) return null;
  return parsed.pathname.match(APPLE_SHOW_ID)?.[1] ?? null;
}

// The iTunes Lookup API is public and needs no key. It returns the RSS feed
// URL that Apple Podcasts itself reads.
export async function lookupAppleFeedUrl(showId: string): Promise<string> {
  const res = await fetch(
    `https://itunes.apple.com/lookup?id=${encodeURIComponent(showId)}&entity=podcast`,
  );
  if (!res.ok) throw new Error(`Apple Podcasts lookup failed: ${res.status}`);

  const data = await res.json();
  const result = data?.results?.find((r: any) => r?.feedUrl);
  if (!result) {
    throw new Error('Apple Podcasts did not return an RSS feed for that link');
  }
  return String(result.feedUrl);
}

// Accepts an RSS feed URL or an Apple Podcasts link and returns a feed URL.
export async function resolveFeedUrl(input: string): Promise<string> {
  const url = input.trim();
  const showId = parseApplePodcastsId(url);
  return showId ? lookupAppleFeedUrl(showId) : url;
}

export async function fetchFeed(
  url: string,
): Promise<{ podcast: Podcast; episodes: Episode[] }> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Feed fetch failed: ${res.status}`);
  const xml = await res.text();

  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
  });
  const parsed = parser.parse(xml);
  const channel = parsed.rss?.channel;
  if (!channel) throw new Error('Invalid RSS feed: no <channel> found');

  const id = hashFeedUrl(url);

  const podcast: Podcast = {
    id,
    feedUrl: url,
    title: channel.title ?? 'Untitled',
    author: channel['itunes:author'] ?? undefined,
    description: channel.description ?? undefined,
    artworkUrl:
      channel['itunes:image']?.['@_href'] ??
      channel.image?.url ??
      undefined,
  };

  const rawItems = channel.item
    ? Array.isArray(channel.item)
      ? channel.item
      : [channel.item]
    : [];

  const episodes: Episode[] = rawItems.slice(0, MAX_EPISODES).map((item: any) => ({
    guid: String(
      item.guid?.['#text'] ?? item.guid ?? item.enclosure?.['@_url'] ?? item.title ?? '',
    ),
    title: item.title ?? 'Untitled',
    description: item.description ?? item['itunes:summary'] ?? undefined,
    pubDate: item.pubDate ?? undefined,
    audioUrl: item.enclosure?.['@_url'] ?? undefined,
    duration: item['itunes:duration'] != null ? String(item['itunes:duration']) : undefined,
    imageUrl: item['itunes:image']?.['@_href'] ?? undefined,
  }));

  return { podcast, episodes };
}
