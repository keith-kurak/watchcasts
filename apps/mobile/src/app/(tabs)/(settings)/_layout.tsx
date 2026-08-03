import { Stack } from 'expo-router';

export default function SettingsLayout() {
  return (
    <Stack>
      {/* Root tab screens carry no header — the bottom tab already names them. */}
      <Stack.Screen name="index" options={{ headerShown: false }} />
    </Stack>
  );
}
