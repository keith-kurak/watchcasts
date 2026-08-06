import { useQueryClient } from '@tanstack/react-query';
import { createContext, useContext, useEffect, useState } from 'react';
import { Platform } from 'react-native';

import WearDataLayerModule, {
  type WatchEpisodeStatus,
} from '../../modules/wear-data-layer/src';
import { requestWatchDownloadStatus } from '@/hooks/useWearDataLayer';
import { publishWatchList } from '@/lib/queries';
import { mergeWatchReportedSizes, removeFromWatchList } from '@/lib/storage';

const isAndroid = Platform.OS === 'android';

const WatchStatusContext = createContext<Map<string, WatchEpisodeStatus>>(new Map());

/**
 * App-wide hub for messages coming from the watch.
 *
 * One Data Layer listener per message type, not one per row. The watch toggle on every
 * episode row reads download status, and subscribing per row would mean dozens of native
 * listeners.
 */
export function WatchStatusProvider({ children }: { children: React.ReactNode }) {
  const [statuses, setStatuses] = useState<Map<string, WatchEpisodeStatus>>(new Map());
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!isAndroid) return;

    const subscription = WearDataLayerModule.addListener(
      'onWatchDownloadStatus',
      (event: { statuses: WatchEpisodeStatus[] }) => {
        setStatuses(new Map(event.statuses.map((s) => [s.guid, s])));
        // Persist the measured sizes too. The watch storage limit is checked outside
        // React, so it cannot read this context.
        mergeWatchReportedSizes(
          Object.fromEntries(event.statuses.map((s) => [s.guid, s.sizeBytes ?? 0])),
        );
      },
    );

    requestWatchDownloadStatus().catch(() => {});

    return () => subscription.remove();
  }, []);

  // The watch can ask for an episode to be dropped from the queue. The phone owns that
  // list, so the removal happens here and the list is re-published, which is what makes
  // the watch's optimistic removal stick.
  //
  // Every reference here is stable. Depending on a react-query mutation object instead
  // re-ran this effect on every render, and each teardown dropped the native listener —
  // when the count hit zero the module stopped observing and messages were missed.
  useEffect(() => {
    if (!isAndroid) return;

    const subscription = WearDataLayerModule.addListener(
      'onWatchEpisodeRemoved',
      (event: { guid: string }) => {
        if (!event.guid) return;
        removeFromWatchList(event.guid);
        queryClient.invalidateQueries({ queryKey: ['watchList'] });
        publishWatchList();
      },
    );

    return () => subscription.remove();
  }, [queryClient]);

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
