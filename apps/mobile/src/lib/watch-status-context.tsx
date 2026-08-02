import { createContext, useContext, useEffect, useState } from 'react';
import { Platform } from 'react-native';

import WearDataLayerModule, {
  type WatchEpisodeStatus,
} from '../../modules/wear-data-layer/src';
import { requestWatchDownloadStatus } from '@/hooks/useWearDataLayer';

const isAndroid = Platform.OS === 'android';

const WatchStatusContext = createContext<Map<string, WatchEpisodeStatus>>(new Map());

/**
 * Holds the watch's per-episode download status for the whole app.
 *
 * One Data Layer listener, not one per row. The watch toggle on every episode row
 * needs this, and subscribing per row would mean dozens of native listeners.
 */
export function WatchStatusProvider({ children }: { children: React.ReactNode }) {
  const [statuses, setStatuses] = useState<Map<string, WatchEpisodeStatus>>(new Map());

  useEffect(() => {
    if (!isAndroid) return;

    const subscription = WearDataLayerModule.addListener(
      'onWatchDownloadStatus',
      (event: { statuses: WatchEpisodeStatus[] }) => {
        setStatuses(new Map(event.statuses.map((s) => [s.guid, s])));
      },
    );

    requestWatchDownloadStatus().catch(() => {});

    return () => subscription.remove();
  }, []);

  return (
    <WatchStatusContext.Provider value={statuses}>{children}</WatchStatusContext.Provider>
  );
}

/** Whole map, keyed by episode guid. */
export function useWatchStatuses(): Map<string, WatchEpisodeStatus> {
  return useContext(WatchStatusContext);
}

/** Status for one episode, or undefined when the watch has not reported it. */
export function useWatchStatus(episodeGuid: string): WatchEpisodeStatus | undefined {
  return useContext(WatchStatusContext).get(episodeGuid);
}
