import { Stack } from 'expo-router';

export default function SettingsLayout() {
  return (
    <Stack>
      <Stack.Screen name="settings" options={{ title: 'Settings' }} />
    </Stack>
  );
}
