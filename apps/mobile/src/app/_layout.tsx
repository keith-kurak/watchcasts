import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ObserveRoot } from 'expo-observe';
import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { getConnectedNodes } from '@/hooks/useWearDataLayer';
import { AudioProvider } from '@/lib/audio-context';
import { DownloadProvider } from '@/lib/download-context';
import {
  configureObserve,
  logAppStarted,
  logWatchConnectionChecked,
} from '@/lib/observe';
import { WatchStatusProvider } from '@/lib/watch-status-context';

// Before the first render, so startup metrics are collected under this config.
configureObserve();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
    },
  },
});

function RootLayout() {
  const colorScheme = useColorScheme();

  useEffect(() => {
    logAppStarted();
    // Once per launch, as asked. Reported whether or not a watch answers: "no watch
    // paired" is the interesting half of this signal, and an event that only exists on
    // success cannot tell the difference between absent and broken.
    getConnectedNodes()
      .then((nodes) => logWatchConnectionChecked(nodes.length))
      .catch(() => logWatchConnectionChecked(0));
  }, []);

  // Time to Interactive is marked by the landing screen, not here: the router
  // integration reads the current route to attribute the metric, and a layout above the
  // navigator has no route. See the marker in (tabs)/(subscriptions)/index.tsx.

  return (
    <QueryClientProvider client={queryClient}>
      <DownloadProvider>
      <WatchStatusProvider>
      <AudioProvider>
        <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
          <StatusBar style="auto" />
          <AnimatedSplashOverlay />
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="(tabs)" />
            {/* Lives outside the tabs so it covers the tab bar while open. */}
            <Stack.Screen
              name="add-podcast"
              options={{
                presentation: 'modal',
                headerShown: true,
                title: 'Add Podcast',
              }}
            />
          </Stack>
        </ThemeProvider>
      </AudioProvider>
      </WatchStatusProvider>
      </DownloadProvider>
    </QueryClientProvider>
  );
}

// Wrapping the root is what records Time to First Render.
export default ObserveRoot.wrap(RootLayout);
