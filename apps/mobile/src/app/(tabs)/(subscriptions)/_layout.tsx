import { Stack } from 'expo-router';

export default function SubscriptionsLayout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ title: 'Subscriptions' }} />
      <Stack.Screen name="podcast/[id]" options={{ headerBackTitle: 'Back' }} />
      <Stack.Screen name="podcast/episode/[episodeId]" options={{ headerBackTitle: 'Back' }} />
    </Stack>
  );
}
