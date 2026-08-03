import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useColorScheme } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

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
    // Gesture handler needs one of these above anything using a gesture. The queue lists'
    // drag-to-reorder is the first such consumer; the drag library used to ship its own
    // wrapper, which hid the fact that this app had none.
    <GestureHandlerRootView style={{ flex: 1 }}>
    <QueryClientProvider client={queryClient}>
      <DownloadProvider>
      <WatchStatusProvider>
      <AudioProvider>
        <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
          <StatusBar style="auto" />
          <AnimatedSplashOverlay />
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="(tabs)" />
          </Stack>
        </ThemeProvider>
      </AudioProvider>
      </WatchStatusProvider>
      </DownloadProvider>
    </QueryClientProvider>
    </GestureHandlerRootView>
  );
}
