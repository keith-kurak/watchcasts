import { XMLParser } from 'fast-xml-parser';

import type { Episode, Podcast } from './types';

const MAX_EPISODES = 50;

function hashFeedUrl(url: string): string {
  let hash = 0;
  for (let i = 0; i < url.length; i++) {
    hash = (hash << 5) - hash + url.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
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
