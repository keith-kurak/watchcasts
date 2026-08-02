import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { BadgedIcon, type DestinationState } from '@/components/badged-icon';
import { RemoveDialog } from '@/components/remove-dialog';
import { useDownloadContext } from '@/lib/download-context';
import { useDownloadMutations, useIsInDownloads } from '@/lib/queries';

interface DownloadToggleProps {
  podcastId: string;
  episodeGuid: string;
  audioUrl?: string;
}

export function DownloadToggle({ podcastId, episodeGuid, audioUrl }: DownloadToggleProps) {
  const { data: downloadItem } = useIsInDownloads(episodeGuid);
  const { add, remove } = useDownloadMutations();
  const { getProgress } = useDownloadContext();
  const [showRemoveDialog, setShowRemoveDialog] = useState(false);

  const isDownloaded = downloadItem != null;
  const status = downloadItem?.status;
  const progress = getProgress(episodeGuid);
  const isDownloading = status === 'downloading' || progress != null;

  function handlePress() {
    if (status === 'complete') {
      setShowRemoveDialog(true);
    } else if (isDownloaded) {
      remove.mutate({ episodeGuid });
    } else if (audioUrl) {
      add.mutate({ podcastId, episodeGuid, audioUrl });
    }
  }

  let state: DestinationState;
  if (status === 'complete') {
    state = 'complete';
  } else if (status === 'error') {
    state = 'error';
  } else if (isDownloading) {
    state = 'downloading';
  } else if (isDownloaded) {
    state = 'pending';
  } else {
    state = 'idle';
  }

  return (
    <>
      <Pressable onPress={handlePress} style={styles.button} hitSlop={8}>
        <View pointerEvents="none">
          <BadgedIcon name={{ ios: 'iphone', android: 'smartphone' }} state={state} />
        </View>
      </Pressable>
      <RemoveDialog
        visible={showRemoveDialog}
        title="Remove from phone?"
        message="This will delete the downloaded episode from your phone."
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
