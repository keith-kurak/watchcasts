import { SymbolView } from 'expo-symbols';
import { Pressable, StyleSheet } from 'react-native';

import { useIsOnWatchList, useWatchListMutations } from '@/lib/queries';

interface WatchToggleProps {
  podcastId: string;
  episodeGuid: string;
}

export function WatchToggle({ podcastId, episodeGuid }: WatchToggleProps) {
  const { data: onWatchList = false } = useIsOnWatchList(episodeGuid);
  const { add, remove } = useWatchListMutations();

  function handlePress() {
    if (onWatchList) {
      remove.mutate({ episodeGuid });
    } else {
      add.mutate({ podcastId, episodeGuid });
    }
  }

  return (
    <Pressable onPress={handlePress} style={styles.button} hitSlop={8}>
      <SymbolView
        name={{ ios: 'applewatch', android: 'watch', web: 'watch' }}
        size={24}
        tintColor={onWatchList ? '#34C759' : '#8E8E93'}
        weight={onWatchList ? 'bold' : 'regular'}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    padding: 4,
  },
});
