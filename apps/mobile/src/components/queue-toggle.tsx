import { SymbolView } from 'expo-symbols';
import { Pressable, StyleSheet, View } from 'react-native';

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
      <View pointerEvents="none">
        <SymbolView
          name={
            inQueue
              ? { ios: 'checkmark.circle.fill', android: 'check_circle' }
              : { ios: 'plus.circle', android: 'add_circle' }
          }
          size={24}
          tintColor={inQueue ? '#34C759' : '#8E8E93'}
        />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    padding: 4,
  },
});
