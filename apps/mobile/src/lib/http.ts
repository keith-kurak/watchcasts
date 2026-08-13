import Constants from 'expo-constants';

// React Native routes fetch through OkHttp on Android, and expo-file-system and
// expo-image do the same. None of them set a User-Agent, so OkHttp falls back to
// its own `okhttp/<version>`. Buzzsprout's Cloudflare WAF blocks that token with
// a 403 — every Buzzsprout-hosted show fails to load without this override.
// Notably a *blank* User-Agent passes their rule, so this is not about being
// anonymous: it is about not carrying a signature that hosts have blocklisted.
//
// Sending a real product token is also the right thing to do regardless. Hosts
// attribute downloads by User-Agent, and an unattributable request may be thrown
// out of the podcaster's numbers.
export const USER_AGENT = `PodcastDuck/${Constants.expoConfig?.version ?? '1.0.0'}`;

export const HTTP_HEADERS: Record<string, string> = { 'User-Agent': USER_AGENT };
