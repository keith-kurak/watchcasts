import { ObserveInteractiveMarker } from 'expo-observe';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  TextInput,
  useColorScheme,
  View,
} from 'react-native';

import { Image } from '@/components/image';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors, Spacing } from '@/constants/theme';
import { fetchFeed, resolveFeedUrl } from '@/lib/rss';
import { addSubscription, getSubscriptions, setCachedEpisodes } from '@/lib/storage';
import type { Episode, Podcast } from '@/lib/types';

interface FoundFeed {
  podcast: Podcast;
  episodes: Episode[];
}

/**
 * Two-step modal for adding a podcast: find it by URL, then confirm and subscribe.
 *
 * Deliberately does not browse episodes before subscribing — the decision here is only
 * "is this the right show?", which the artwork and title answer.
 */
export default function AddPodcastScreen() {
  const router = useRouter();
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'dark' ? 'dark' : 'light'];

  const [feedUrl, setFeedUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [found, setFound] = useState<FoundFeed | null>(null);

  const canSearch = feedUrl.trim().length > 0 && !loading;

  async function handleFind() {
    const input = feedUrl.trim();
    if (!input) return;

    setLoading(true);
    setError(null);
    try {
      // Accepts an RSS URL or an Apple Podcasts link.
      const url = await resolveFeedUrl(input);
      const { podcast, episodes } = await fetchFeed(url);
      setFound({ podcast, episodes });
    } catch (e: any) {
      setError(e.message ?? 'Could not fetch that feed');
    } finally {
      setLoading(false);
    }
  }

  function handleSubscribe() {
    if (!found) return;
    addSubscription(found.podcast);
    // Cache alongside the subscription so the episode list is populated on first open.
    setCachedEpisodes(found.podcast.id, found.episodes);
    router.back();
  }

  const alreadySubscribed =
    found != null && getSubscriptions().some((s) => s.id === found.podcast.id);

  return (
    <ThemedView style={styles.container}>
      {/*
        TTI for this route. Unconditional: the screen opens on an empty input field, so it
        is ready as soon as it renders — looking up a feed is what the user does next, not
        something they wait on to start.
      */}
      <ObserveInteractiveMarker />
      {found ? (
        <View style={styles.step}>
          {found.podcast.artworkUrl ? (
            <Image
              source={{ uri: found.podcast.artworkUrl }}
              style={styles.artwork}
              contentFit="cover"
              cachePolicy="memory-disk"
            />
          ) : (
            <View style={[styles.artwork, { backgroundColor: colors.backgroundElement }]} />
          )}

          <ThemedText style={styles.foundTitle} numberOfLines={3}>
            {found.podcast.title}
          </ThemedText>
          {found.podcast.author && (
            <ThemedText type="small" themeColor="textSecondary" numberOfLines={2}>
              {found.podcast.author}
            </ThemedText>
          )}
          <ThemedText type="small" themeColor="textSecondary">
            {found.episodes.length === 1
              ? '1 episode'
              : `${found.episodes.length} episodes`}
          </ThemedText>

          <Pressable
            onPress={handleSubscribe}
            disabled={alreadySubscribed}
            accessibilityRole="button"
            accessibilityLabel={alreadySubscribed ? 'Already subscribed' : 'Subscribe'}
            style={({ pressed }) => [
              styles.primaryButton,
              alreadySubscribed && styles.buttonDisabled,
              pressed && !alreadySubscribed && styles.pressed,
            ]}>
            <ThemedText style={styles.primaryButtonText}>
              {alreadySubscribed ? 'Already subscribed' : 'Subscribe'}
            </ThemedText>
          </Pressable>

          {/* Back to step one rather than closing — a wrong feed is the likely reason. */}
          <Pressable
            onPress={() => setFound(null)}
            accessibilityRole="button"
            style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}>
            <ThemedText type="small" themeColor="textSecondary">
              Search again
            </ThemedText>
          </Pressable>
        </View>
      ) : (
        <View style={styles.step}>
          <ThemedText type="small" themeColor="textSecondary">
            Paste an RSS feed URL or an Apple Podcasts link.
          </ThemedText>

          <TextInput
            style={[
              styles.input,
              { backgroundColor: colors.backgroundElement, color: colors.text },
            ]}
            placeholder="https://example.com/feed.xml"
            placeholderTextColor={colors.textSecondary}
            value={feedUrl}
            onChangeText={(text) => {
              setFeedUrl(text);
              setError(null);
            }}
            autoCapitalize="none"
            autoCorrect={false}
            autoFocus
            keyboardType="url"
            returnKeyType="go"
            onSubmitEditing={() => {
              if (canSearch) handleFind();
            }}
            editable={!loading}
          />

          {error && (
            <ThemedText type="small" style={styles.errorText}>
              {error}
            </ThemedText>
          )}

          <Pressable
            onPress={handleFind}
            disabled={!canSearch}
            accessibilityRole="button"
            accessibilityLabel="Find podcast"
            style={({ pressed }) => [
              styles.primaryButton,
              !canSearch && styles.buttonDisabled,
              pressed && canSearch && styles.pressed,
            ]}>
            {loading ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <ThemedText style={styles.primaryButtonText}>Find podcast</ThemedText>
            )}
          </Pressable>
        </View>
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  step: {
    padding: Spacing.three,
    gap: Spacing.three,
    alignItems: 'center',
  },
  input: {
    alignSelf: 'stretch',
    height: 48,
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    fontSize: 16,
  },
  artwork: {
    width: 180,
    height: 180,
    borderRadius: Spacing.three,
    marginTop: Spacing.three,
  },
  foundTitle: {
    fontWeight: '600',
    fontSize: 20,
    textAlign: 'center',
  },
  errorText: {
    color: '#FF3B30',
    alignSelf: 'stretch',
  },
  primaryButton: {
    alignSelf: 'stretch',
    height: 48,
    borderRadius: Spacing.two,
    backgroundColor: '#208AEF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
  secondaryButton: {
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  pressed: {
    opacity: 0.85,
  },
});
