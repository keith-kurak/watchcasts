import { Image } from 'expo-image';
import { Stack, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors, Spacing } from '@/constants/theme';
import { useColorScheme } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { fetchFeed } from '@/lib/rss';
import {
  addSubscription,
  getSubscriptions,
  setCachedEpisodes,
} from '@/lib/storage';
import type { Podcast } from '@/lib/types';

export default function SubscriptionsScreen() {
  const router = useRouter();
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'dark' ? 'dark' : 'light'];

  const [podcasts, setPodcasts] = useState<Podcast[]>([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [feedUrl, setFeedUrl] = useState('');
  const [loading, setLoading] = useState(false);

  useFocusEffect(
    useCallback(() => {
      setPodcasts(getSubscriptions());
    }, []),
  );

  async function handleAddFeed() {
    const url = feedUrl.trim();
    if (!url) return;

    setLoading(true);
    try {
      const { podcast, episodes } = await fetchFeed(url);
      addSubscription(podcast);
      setCachedEpisodes(podcast.id, episodes);
      setPodcasts(getSubscriptions());
      setFeedUrl('');
      setModalVisible(false);
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'Failed to fetch feed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen
        options={{
          headerRight: () => (
            <Pressable onPress={() => setModalVisible(true)}>
              <ThemedText style={styles.addButtonText}>+</ThemedText>
            </Pressable>
          ),
        }}
      />

      <FlatList
        data={podcasts}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[
          styles.list,
          podcasts.length === 0 && styles.emptyList,
        ]}
        renderItem={({ item }) => (
          <Pressable
            style={({ pressed }) => [
              styles.row,
              { backgroundColor: pressed ? colors.backgroundSelected : 'transparent' },
            ]}
            onPress={() =>
              router.push({ pathname: '/(subscriptions)/podcast/[id]', params: { id: item.id } })
            }>
            {item.artworkUrl ? (
              <Image source={{ uri: item.artworkUrl }} style={styles.artwork} />
            ) : (
              <View style={[styles.artwork, styles.artworkPlaceholder, { backgroundColor: colors.backgroundElement }]} />
            )}
            <View style={styles.rowText}>
              <ThemedText numberOfLines={1} style={styles.podcastTitle}>
                {item.title}
              </ThemedText>
              {item.author && (
                <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                  {item.author}
                </ThemedText>
              )}
            </View>
          </Pressable>
        )}
        ListEmptyComponent={
          <ThemedText type="small" themeColor="textSecondary" style={styles.emptyText}>
            No subscriptions yet. Tap + to add a podcast.
          </ThemedText>
        }
      />

      <Modal
        visible={modalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setModalVisible(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setModalVisible(false)}>
          <Pressable
            style={[styles.modalContent, { backgroundColor: colors.background }]}
            onPress={() => {}}>
            <ThemedText style={styles.modalTitle}>
              Add Podcast
            </ThemedText>
            <TextInput
              style={[
                styles.input,
                {
                  backgroundColor: colors.backgroundElement,
                  color: colors.text,
                },
              ]}
              placeholder="RSS feed URL"
              placeholderTextColor={colors.textSecondary}
              value={feedUrl}
              onChangeText={setFeedUrl}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              returnKeyType="done"
              onSubmitEditing={handleAddFeed}
              editable={!loading}
            />
            <View style={styles.modalButtons}>
              <Pressable
                style={[styles.modalButton, { backgroundColor: colors.backgroundElement }]}
                onPress={() => setModalVisible(false)}
                disabled={loading}>
                <ThemedText>Cancel</ThemedText>
              </Pressable>
              <Pressable
                style={[styles.modalButton, styles.modalButtonPrimary]}
                onPress={handleAddFeed}
                disabled={loading}>
                {loading ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <ThemedText style={styles.modalButtonPrimaryText}>Add</ThemedText>
                )}
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  addButtonText: {
    fontSize: 28,
    lineHeight: 32,
  },
  podcastTitle: {
    fontWeight: '600',
  },
  list: {
    paddingHorizontal: Spacing.three,
  },
  emptyList: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    textAlign: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.two,
    borderRadius: Spacing.two,
    gap: Spacing.three,
  },
  artwork: {
    width: 56,
    height: 56,
    borderRadius: Spacing.two,
  },
  artworkPlaceholder: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  rowText: {
    flex: 1,
    gap: 2,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.four,
  },
  modalContent: {
    width: '100%',
    maxWidth: 400,
    borderRadius: Spacing.three,
    padding: Spacing.four,
    gap: Spacing.three,
  },
  modalTitle: {
    textAlign: 'center',
    fontWeight: '600',
  },
  input: {
    height: 48,
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    fontSize: 16,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  modalButton: {
    flex: 1,
    height: 44,
    borderRadius: Spacing.two,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalButtonPrimary: {
    backgroundColor: '#208AEF',
  },
  modalButtonPrimaryText: {
    color: '#fff',
  },
});
