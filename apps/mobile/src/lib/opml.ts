import { XMLParser } from 'fast-xml-parser';

import type { Podcast } from './types';

// A subscription entry read out of an OPML file. Only the feed URL is
// guaranteed; the title is a hint until the feed itself is fetched.
export interface OpmlFeed {
  feedUrl: string;
  title?: string;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function buildOpml(podcasts: Podcast[]): string {
  const outlines = podcasts
    .map((p) => {
      const attrs = [
        'type="rss"',
        `text="${escapeXml(p.title)}"`,
        `title="${escapeXml(p.title)}"`,
        `xmlUrl="${escapeXml(p.feedUrl)}"`,
      ];
      return `      <outline ${attrs.join(' ')} />`;
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <head>
    <title>Podcatch Subscriptions</title>
  </head>
  <body>
${outlines}
  </body>
</opml>
`;
}

// OPML nests <outline> elements freely: some apps put every feed at the top
// level, others group them into folders. Walk the whole tree and keep any
// node carrying an xmlUrl.
function collectOutlines(node: any, found: OpmlFeed[]): void {
  if (!node) return;

  const children = node.outline
    ? Array.isArray(node.outline)
      ? node.outline
      : [node.outline]
    : [];

  for (const child of children) {
    const feedUrl = child?.['@_xmlUrl'];
    if (typeof feedUrl === 'string' && feedUrl.trim()) {
      found.push({
        feedUrl: feedUrl.trim(),
        title: child['@_title'] ?? child['@_text'] ?? undefined,
      });
    }
    collectOutlines(child, found);
  }
}

export function parseOpml(xml: string): OpmlFeed[] {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
  });
  const parsed = parser.parse(xml);
  const body = parsed?.opml?.body;
  if (!body) throw new Error('Invalid OPML file: no <body> found');

  const feeds: OpmlFeed[] = [];
  collectOutlines(body, feeds);

  // The same feed can appear in more than one folder.
  const seen = new Set<string>();
  return feeds.filter((f) => {
    if (seen.has(f.feedUrl)) return false;
    seen.add(f.feedUrl);
    return true;
  });
}
