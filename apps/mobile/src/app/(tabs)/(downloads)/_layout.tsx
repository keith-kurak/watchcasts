import { Stack } from 'expo-router';

export default function DownloadsLayout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ title: 'Downloads' }} />
      <Stack.Screen name="episode/[episodeId]" options={{ headerBackTitle: 'Back' }} />
    </Stack>
  );
}
