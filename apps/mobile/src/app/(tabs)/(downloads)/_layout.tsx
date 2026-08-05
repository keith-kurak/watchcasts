import { Stack } from 'expo-router';

export default function DownloadsLayout() {
  return (
    <Stack>
      <Stack.Screen name="downloads" options={{ title: 'Phone Downloads' }} />
      <Stack.Screen name="episode/[episodeId]" options={{ headerBackTitle: 'Back' }} />
    </Stack>
  );
}
