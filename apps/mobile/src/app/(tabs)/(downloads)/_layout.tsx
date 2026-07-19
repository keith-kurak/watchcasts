import { Stack } from 'expo-router';

export default function QueueLayout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ title: 'Queue' }} />
      <Stack.Screen name="episode/[episodeId]" options={{ headerBackTitle: 'Back' }} />
    </Stack>
  );
}
