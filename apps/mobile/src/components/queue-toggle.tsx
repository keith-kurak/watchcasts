import { SymbolView } from 'expo-symbols';
import { Platform, Pressable, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { useIsInQueue, useQueueMutations } from '@/lib/queries';

interface QueueToggleProps {
  podcastId: string;
  episodeGuid: string;
}

export function QueueToggle({ podcastId, episodeGuid }: QueueToggleProps) {
  const { data: inQueue = false } = useIsInQueue(episodeGuid);
  const { add, remove } = useQueueMutations();

  function handlePress() {
    if (inQueue) {
      remove.mutate({ episodeGuid });
    } else {
      add.mutate({ podcastId, episodeGuid });
    }
  }

  return (
    <Pressable onPress={handlePress} style={styles.button} hitSlop={8}>
      {Platform.OS === 'ios' ? (
        <SymbolView
          name={inQueue ? 'checkmark.circle.fill' : 'plus.circle'}
          size={24}
          tintColor={inQueue ? '#34C759' : '#8E8E93'}
        />
      ) : (
        <ThemedText
          style={[styles.fallback, inQueue && styles.fallbackActive]}
        >
          {inQueue ? '✓' : '+'}
        </ThemedText>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    padding: 4,
  },
  fallback: {
    fontSize: 22,
    fontWeight: '700',
    color: '#8E8E93',
  },
  fallbackActive: {
    color: '#34C759',
  },
});
