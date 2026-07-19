import { Stack } from 'expo-router';

export default function WatchLayout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ title: 'Watch Downloads' }} />
      <Stack.Screen name="episode/[episodeId]" options={{ headerBackTitle: 'Back' }} />
    </Stack>
  );
}
