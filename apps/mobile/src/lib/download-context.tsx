import { useQueryClient } from '@tanstack/react-query';
import { DownloadTask, File } from 'expo-file-system';
import {
  addNetworkStateListener,
  getNetworkStateAsync,
  NetworkStateType,
  useNetworkState,
} from 'expo-network';
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

import { HTTP_HEADERS } from './http';
import {
  episodesDir,
  getCachedEpisodes,
  getDownloadPath,
  getDownloads,
  getWifiOnlyDownloads,
  updateDownloadItem,
} from './storage';

interface DownloadContextValue {
  startDownload: (audioUrl: string, podcastId: string, episodeGuid: string) => void;
  cancelDownload: (episodeGuid: string) => void;
  getProgress: (episodeGuid: string) => number | undefined;
  /**
   * True when Wi-Fi-only downloads are on and this phone is not on an unmetered
   * network. Queued episodes hold rather than spend cellular data.
   */
  isWaitingForWifi: boolean;
  /**
   * Start every queued download that is currently allowed to run. Called when an
   * unmetered network arrives, and by Settings when the Wi-Fi-only switch is turned
   * off — otherwise held episodes would sit there until something else nudged them.
   */
  drainPendingDownloads: () => void;
}

const DownloadContext = createContext<DownloadContextValue | null>(null);

export function DownloadProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const [progressMap, setProgressMap] = useState<Map<string, number>>(new Map());
  const tasksRef = useRef<Map<string, DownloadTask>>(new Map());
  const networkState = useNetworkState();

  // Treat an unknown network type as metered. Guessing "probably Wi-Fi" would be
  // the expensive way to be wrong.
  const isUnmetered = networkState.type === NetworkStateType.WIFI ||
    networkState.type === NetworkStateType.ETHERNET;
  const isWaitingForWifi = getWifiOnlyDownloads() && !isUnmetered;

  /**
   * Whether downloads are currently blocked, read at call time rather than closure
   * time. `startDownload` must not be re-created on every network change — callers
   * hold it in their own dependency arrays.
   */
  const isBlocked = useCallback(async () => {
    if (!getWifiOnlyDownloads()) return false;
    const state = await getNetworkStateAsync();
    return !(
      state.type === NetworkStateType.WIFI || state.type === NetworkStateType.ETHERNET
    );
  }, []);

  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['downloads'] });
  }, [queryClient]);

  const startDownload = useCallback(
    async (audioUrl: string, _podcastId: string, episodeGuid: string) => {
      if (await isBlocked()) {
        // Stay 'pending'. The queue is picked up again once Wi-Fi returns.
        invalidate();
        return;
      }

      if (!episodesDir.exists) {
        episodesDir.create();
      }

      const localPath = getDownloadPath(episodeGuid);
      const destFile = new File(localPath);

      updateDownloadItem(episodeGuid, { status: 'downloading' });
      invalidate();

      const task = new DownloadTask(audioUrl, destFile, {
        headers: HTTP_HEADERS,
        onProgress: (progress) => {
          const fraction =
            progress.totalBytes > 0 ? progress.bytesWritten / progress.totalBytes : 0;
          setProgressMap((prev) => {
            const next = new Map(prev);
            next.set(episodeGuid, fraction);
            return next;
          });
        },
      });

      tasksRef.current.set(episodeGuid, task);

      try {
        await task.downloadAsync();
        updateDownloadItem(episodeGuid, { status: 'complete', localPath });
        setProgressMap((prev) => {
          const next = new Map(prev);
          next.delete(episodeGuid);
          return next;
        });
      } catch {
        updateDownloadItem(episodeGuid, { status: 'error' });
      } finally {
        tasksRef.current.delete(episodeGuid);
        invalidate();
      }
    },
    [invalidate, isBlocked],
  );

  const cancelDownload = useCallback((episodeGuid: string) => {
    const task = tasksRef.current.get(episodeGuid);
    if (task) {
      task.cancel();
      tasksRef.current.delete(episodeGuid);
    }
    setProgressMap((prev) => {
      const next = new Map(prev);
      next.delete(episodeGuid);
      return next;
    });
  }, []);

  const getProgress = useCallback(
    (episodeGuid: string) => progressMap.get(episodeGuid),
    [progressMap],
  );

  // Mark downloads that were cut off mid-transfer as errored. 'pending' is left
  // alone: with Wi-Fi-only downloads it is a legitimate resting state, not a
  // sign that something died.
  useEffect(() => {
    const items = getDownloads();
    for (const item of items) {
      if (item.status === 'downloading') {
        updateDownloadItem(item.episodeGuid, { status: 'error' });
      }
    }
  }, []);

  /** Start every queued download that is currently allowed to run. */
  const drainPendingDownloads = useCallback(() => {
    for (const item of getDownloads()) {
      if (item.status !== 'pending') continue;
      const episode = getCachedEpisodes(item.podcastId)?.find(
        (e) => e.guid === item.episodeGuid,
      );
      if (episode?.audioUrl) {
        startDownload(episode.audioUrl, item.podcastId, item.episodeGuid);
      }
    }
  }, [startDownload]);

  // Drain when an unmetered network arrives. Driven from the subscription callback
  // rather than an effect body: this reacts to an external system rather than
  // synchronising React state, and starting a download writes state immediately.
  useEffect(() => {
    const subscription = addNetworkStateListener((event) => {
      const unmetered =
        event.type === NetworkStateType.WIFI || event.type === NetworkStateType.ETHERNET;
      if (unmetered) drainPendingDownloads();
    });
    return () => subscription.remove();
  }, [drainPendingDownloads]);

  return (
    <DownloadContext.Provider
      value={{
        startDownload,
        cancelDownload,
        getProgress,
        isWaitingForWifi,
        drainPendingDownloads,
      }}>
      {children}
    </DownloadContext.Provider>
  );
}

export function useDownloadContext() {
  const ctx = useContext(DownloadContext);
  if (!ctx) throw new Error('useDownloadContext must be used within DownloadProvider');
  return ctx;
}
