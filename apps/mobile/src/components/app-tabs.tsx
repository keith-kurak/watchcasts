import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { useColorScheme } from 'react-native';

import { Colors } from '@/constants/theme';

export default function AppTabs() {
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'unspecified' ? 'light' : scheme];

  return (
    <NativeTabs
      backgroundColor={colors.background}
      indicatorColor={colors.backgroundElement}
      labelStyle={{ selected: { color: colors.text } }}>
      <NativeTabs.Trigger name="(subscriptions)">
        <NativeTabs.Trigger.Label>Subscriptions</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="list.bullet" md="format_list_bulleted" />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="(watch)">
        <NativeTabs.Trigger.Label>Watch</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="applewatch" md="watch" />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="(downloads)">
        <NativeTabs.Trigger.Label>Phone</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="iphone" md="smartphone" />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
