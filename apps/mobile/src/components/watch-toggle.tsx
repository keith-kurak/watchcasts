import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { BadgedIcon, type DestinationState } from '@/components/badged-icon';
import { RemoveDialog } from '@/components/remove-dialog';
import { useIsOnWatchList, useWatchListMutations } from '@/lib/queries';
import { useWatchStatus } from '@/lib/watch-status-context';

interface WatchToggleProps {
  podcastId: string;
  episodeGuid: string;
}

export function WatchToggle({ podcastId, episodeGuid }: WatchToggleProps) {
  const { data: onWatchList = false } = useIsOnWatchList(episodeGuid);
  const { add, remove } = useWatchListMutations();
  const watchStatus = useWatchStatus(episodeGuid);
  const [showRemoveDialog, setShowRemoveDialog] = useState(false);

  function handlePress() {
    if (onWatchList) {
      setShowRemoveDialog(true);
    } else {
      add.mutate({ podcastId, episodeGuid });
    }
  }

  // Queued but the watch has not reported yet — treat as pending rather than idle,
  // so adding an episode gives immediate feedback even when the watch is away.
  let state: DestinationState = 'idle';
  if (onWatchList) {
    switch (watchStatus?.status) {
      case 'complete':
        state = 'complete';
        break;
      case 'error':
        state = 'error';
        break;
      case 'downloading':
        state = 'downloading';
        break;
      default:
        state = 'pending';
    }
  }

  return (
    <>
      <Pressable onPress={handlePress} style={styles.button} hitSlop={8}>
        <View pointerEvents="none">
          <BadgedIcon
            name={{ ios: 'applewatch', android: 'watch', web: 'watch' }}
            state={state}
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
