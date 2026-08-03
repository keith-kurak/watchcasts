import { useCallback, useEffect, useState } from 'react';
import { Platform } from 'react-native';

import {
  getConnectedNodes,
  requestWatchDownloadStatus,
  sendForceDownload,
} from '@/hooks/useWearDataLayer';
import { useWatchListMutations } from '@/lib/queries';

/** Minimum time the refresh spinner stays visible, so it does not just flicker. */
const MIN_SPINNER_MS = 600;

/**
 * Watch connection state and the manual "sync now" action.
 *
 * Lifted out of the watch queue screen because the refresh control now lives in the
 * shared Downloads header while the connection banner stays with the watch list — both
 * need the same state, and polling the Data Layer twice for it would be wasteful.
 */
export function useWatchRefresh() {
  const { triggerSync } = useWatchListMutations();
  const [connected, setConnected] = useState<boolean | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);

  const checkConnection = useCallback(() => {
    if (Platform.OS !== 'android') {
      setConnected(null);
      return;
    }
    getConnectedNodes().then((nodes) => setConnected(nodes.length > 0));
  }, []);

  useEffect(() => {
    checkConnection();
  }, [checkConnection]);

  const refresh = useCallback(async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    try {
      checkConnection();
      triggerSync();
      await Promise.all([
        sendForceDownload().catch(() => {}),
        requestWatchDownloadStatus().catch(() => {}),
      ]);
      // These resolve as soon as the messages are handed to the Data Layer, which is
      // near-instant. Hold the spinner briefly so the refresh reads as an action
      // rather than a flicker.
      await new Promise((resolve) => setTimeout(resolve, MIN_SPINNER_MS));
    } finally {
      setIsSyncing(false);
    }
  }, [checkConnection, triggerSync, isSyncing]);

  return { connected, isSyncing, refresh };
}
