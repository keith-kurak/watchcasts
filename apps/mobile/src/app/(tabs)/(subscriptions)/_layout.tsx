import { Stack } from 'expo-router';

export default function SubscriptionsLayout() {
  return (
    <Stack>
      {/* Root tab screens carry no header — the bottom tab already names them. */}
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="podcast/[id]" options={{ headerBackTitle: 'Back' }} />
      <Stack.Screen name="podcast/episode/[episodeId]" options={{ headerBackTitle: 'Back' }} />
    </Stack>
  );
}
