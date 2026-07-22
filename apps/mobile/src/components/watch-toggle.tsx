import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { RemoveDialog } from '@/components/remove-dialog';
import { useIsOnWatchList, useWatchListMutations } from '@/lib/queries';

interface WatchToggleProps {
  podcastId: string;
  episodeGuid: string;
}

export function WatchToggle({ podcastId, episodeGuid }: WatchToggleProps) {
  const { data: onWatchList = false } = useIsOnWatchList(episodeGuid);
  const { add, remove } = useWatchListMutations();
  const [showRemoveDialog, setShowRemoveDialog] = useState(false);

  function handlePress() {
    if (onWatchList) {
      setShowRemoveDialog(true);
    } else {
      add.mutate({ podcastId, episodeGuid });
    }
  }

  return (
    <>
      <Pressable onPress={handlePress} style={styles.button} hitSlop={8}>
        <View pointerEvents="none">
          <SymbolView
            name={{ ios: 'applewatch', android: 'watch', web: 'watch' }}
            size={24}
            tintColor={onWatchList ? '#34C759' : '#8E8E93'}
            weight={onWatchList ? 'bold' : 'regular'}
          />
        </View>
      </Pressable>
      <RemoveDialog
        visible={showRemoveDialog}
        title="Remove from watch?"
        message="This will remove the episode from your watch queue."
        onConfirm={() => {
          remove.mutate({ episodeGuid });
          setShowRemoveDialog(false);
        }}
        onDismiss={() => setShowRemoveDialog(false)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  button: {
    padding: 4,
  },
});
