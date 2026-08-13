import { Image as ExpoImage, type ImageProps, type ImageSource } from 'expo-image';

import { HTTP_HEADERS } from '@/lib/http';

/**
 * `expo-image`'s Image with our User-Agent attached to remote sources.
 *
 * Artwork is fetched by the native image loader rather than by `fetch`, so the
 * header has to ride on the source object. Without it the loader sends OkHttp's
 * default `okhttp/<version>`, which some hosts block outright — Buzzsprout's WAF
 * 403s it, so every image from a Buzzsprout-hosted show came back empty.
 *
 * Import this instead of `expo-image` anywhere in the app; an ESLint rule enforces
 * it. Bundled `require()` assets, `file://` paths, SF Symbols and shared refs pass
 * through untouched, so this is a drop-in replacement with nothing to remember at
 * the call site.
 */
export function Image(props: ImageProps) {
  return <ExpoImage {...props} source={withHeaders(props.source)} />;
}

function isRemote(uri: string): boolean {
  return /^https?:/i.test(uri);
}

/**
 * Normalise one entry to an `ImageSource`, adding our headers when it points at a
 * remote URL. Returns null for anything that cannot become an object — a bundled
 * asset id, an `sf:` symbol name, or a shared ref — so the caller leaves it alone.
 */
function toSourceObject(entry: unknown): ImageSource | null {
  if (typeof entry === 'string') {
    // `sf:heart.fill` names a system symbol, not a URL. It has to stay a string.
    if (entry.startsWith('sf:')) return null;
    // A bare string is expo-image's shorthand for `{ uri }`, local paths included.
    return isRemote(entry) ? { uri: entry, headers: HTTP_HEADERS } : { uri: entry };
  }
  if (entry != null && typeof entry === 'object' && 'uri' in entry) {
    const source = entry as ImageSource;
    if (typeof source.uri === 'string' && isRemote(source.uri)) {
      // A caller-supplied header wins: it was set deliberately for that one image.
      return { ...source, headers: { ...HTTP_HEADERS, ...source.headers } };
    }
    return source;
  }
  return null;
}

function withHeaders(source: ImageProps['source']): ImageProps['source'] {
  if (source == null) return source;

  if (Array.isArray(source)) {
    const mapped = source.map(toSourceObject);
    // The prop accepts `ImageSource[]` or `string[]`, never a mix, so only swap the
    // array in when every entry converted. Otherwise leave the original as it was.
    return mapped.every((entry) => entry != null) ? (mapped as ImageSource[]) : source;
  }

  return toSourceObject(source) ?? source;
}
