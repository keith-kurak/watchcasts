import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useColorScheme } from 'react-native';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { AudioProvider } from '@/lib/audio-context';
import { DownloadProvider } from '@/lib/download-context';
import { WatchStatusProvider } from '@/lib/watch-status-context';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
    },
  },
});

export default function RootLayout() {
  const colorScheme = useColorScheme();
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
