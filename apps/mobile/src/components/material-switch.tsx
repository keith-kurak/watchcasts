import { Host, Switch } from '@expo/ui/jetpack-compose';

/**
 * A real Material switch, in place of React Native's.
 *
 * RN's `Switch` renders through AppCompat, which on this app picked up AppCompat's own
 * default teal accent — a colour that appears nowhere else in the app and follows nothing.
 * This is the Compose Material 3 switch, so it takes its colours from the same palette as
 * the rest of the Expo UI components.
 *
 * `Host` bridges Compose into the React Native tree and has to be sized; `matchContents`
 * sizes it to the switch, the same arrangement the FAB uses on the subscriptions screen.
 */
export function MaterialSwitch({
  value,
  onValueChange,
  enabled,
}: {
  value: boolean;
  onValueChange: (value: boolean) => void;
  enabled?: boolean;
}) {
  return (
    <Host matchContents>
      <Switch value={value} onCheckedChange={onValueChange} enabled={enabled} />
    </Host>
  );
}
