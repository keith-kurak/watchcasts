import { SymbolView } from 'expo-symbols';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type SymbolName = React.ComponentProps<typeof SymbolView>['name'];

export interface SegmentedTab<T extends string> {
  value: T;
  label: string;
  icon: SymbolName;
}

interface SegmentedTabsProps<T extends string> {
  tabs: SegmentedTab<T>[];
  value: T;
  onChange: (value: T) => void;
}

/**
 * Top-level tabs within a screen.
 *
 * Deliberately a segmented control rather than a swipeable pager: the lists underneath
 * are drag-reorderable, and a horizontal page swipe would compete with the drag gesture
 * for the same touch.
 */
export function SegmentedTabs<T extends string>({
  tabs,
  value,
  onChange,
}: SegmentedTabsProps<T>) {
  const theme = useTheme();

  return (
    <View style={[styles.container, { backgroundColor: theme.backgroundElement }]}>
      {tabs.map((tab) => {
        const selected = tab.value === value;
        return (
          <Pressable
            key={tab.value}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            onPress={() => onChange(tab.value)}
            style={({ pressed }) => [
              styles.tab,
              selected && { backgroundColor: theme.backgroundSelected },
              pressed && !selected && styles.pressed,
            ]}>
            <SymbolView
              name={tab.icon}
              size={18}
              tintColor={selected ? theme.text : theme.textSecondary}
            />
            <ThemedText
              type="smallBold"
              themeColor={selected ? 'text' : 'textSecondary'}>
              {tab.label}
            </ThemedText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    margin: Spacing.three,
    marginBottom: Spacing.two,
    padding: Spacing.half,
    borderRadius: Spacing.three,
    gap: Spacing.half,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.two,
    borderRadius: Spacing.two + Spacing.half,
  },
  pressed: {
    opacity: 0.6,
  },
});
