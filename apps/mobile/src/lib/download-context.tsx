import { useQueryClient } from '@tanstack/react-query';
import { DownloadTask, File } from 'expo-file-system';
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

import { episodesDir, getDownloadPath, getDownloads, updateDownloadItem } from './storage';

interface DownloadContextValue {
  startDownload: (audioUrl: string, podcastId: string, episodeGuid: string) => void;
  cancelDownload: (episodeGuid: string) => void;
  getProgress: (episodeGuid: string) => number | undefined;
}

const DownloadContext = createContext<DownloadContextValue | null>(null);

export function DownloadProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const [progressMap, setProgressMap] = useState<Map<string, number>>(new Map());
  const tasksRef = useRef<Map<string, DownloadTask>>(new Map());

  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['downloads'] });
  }, [queryClient]);

  const startDownload = useCallback(
    async (audioUrl: string, _podcastId: string, episodeGuid: string) => {
      if (!episodesDir.exists) {
        episodesDir.create();
      }

      const localPath = getDownloadPath(episodeGuid);
      const destFile = new File(localPath);

      updateDownloadItem(episodeGuid, { status: 'downloading' });
      invalidate();

      const task = new DownloadTask(audioUrl, destFile, {
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
    [invalidate],
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

  // Mark any stale pending/downloading items as error on mount
  useEffect(() => {
    const items = getDownloads();
    for (const item of items) {
      if (item.status === 'pending' || item.status === 'downloading') {
        updateDownloadItem(item.episodeGuid, { status: 'error' });
      }
    }
  }, []);

  return (
    <DownloadContext.Provider value={{ startDownload, cancelDownload, getProgress }}>
      {children}
    </DownloadContext.Provider>
  );
}

export function useDownloadContext() {
  const ctx = useContext(DownloadContext);
  if (!ctx) throw new Error('useDownloadContext must be used within DownloadProvider');
  return ctx;
}
