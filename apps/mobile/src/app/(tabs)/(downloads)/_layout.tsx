import { Stack } from 'expo-router';

export default function DownloadsLayout() {
  return (
    <Stack>
      {/* The segmented Watch/Phone control sits at the top of this screen and does the
          job a title bar would, so the stack header is redundant here. Pushed screens
          keep theirs — they need the back affordance. */}
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="episode/[episodeId]" options={{ headerBackTitle: 'Back' }} />
    </Stack>
  );
}
