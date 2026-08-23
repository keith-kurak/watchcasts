import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { MaterialSwitch } from '@/components/material-switch';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useStatusColors } from '@/hooks/use-status-colors';
import { useTheme } from '@/hooks/use-theme';
import { BytesPerGb, formatBytes } from '@/lib/format';

type SymbolName = React.ComponentProps<typeof SymbolView>['name'];

interface StorageLimitRowProps {
  icon: SymbolName;
  title: string;
  /** Explains what the limit covers. Shown whether or not the limit is on. */
  description: string;
  enabled: boolean;
  limitBytes: number;
  /** Bytes currently in use, for the "x of y used" line. */
  usedBytes: number;
  onEnabledChange: (enabled: boolean) => void;
  onLimitBytesChange: (bytes: number) => void;
}

/**
 * A storage limit: a switch, and when it is on, a GB text input.
 *
 * The input keeps its own draft string while being edited so a half-typed value
 * ('1.' on the way to '1.5') is not parsed and written back on every keystroke.
 * The committed value is only stored on blur.
 */
export function StorageLimitRow({
  icon,
  title,
  description,
  enabled,
  limitBytes,
  usedBytes,
  onEnabledChange,
  onLimitBytesChange,
}: StorageLimitRowProps) {
  const theme = useTheme();
  const statusColors = useStatusColors();
  const [draft, setDraft] = useState<string | null>(null);
  const gb = limitBytes / BytesPerGb;
  // Round to two decimals, then drop trailing zeros: 10 stays '10', 1.5 stays
  // '1.5', 0.05 stays '0.05'. Formatting to a fixed 1 decimal would render a
  // stored 0.05 as '0.1' — a different number from the one in effect.
  const displayGb = String(parseFloat(gb.toFixed(2)));
  const isOverLimit = enabled && usedBytes >= limitBytes;

  function commitDraft() {
    const text = draft;
    setDraft(null);
    if (text == null) return;
    const value = parseFloat(text);
    // Reject blanks, junk, and zero — the draft is dropped and the input snaps
    // back to the stored value rather than disabling downloads entirely.
    if (!Number.isFinite(value) || value <= 0) return;
    onLimitBytesChange(value * BytesPerGb);
  }

  return (
    <View style={[styles.row, { backgroundColor: theme.backgroundElement }]}>
      <View style={styles.header}>
        <View style={styles.rowIcon}>
          <SymbolView name={icon} size={24} tintColor={theme.text} />
        </View>
        <View style={styles.rowText}>
          <ThemedText style={styles.rowTitle}>{title}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {description}
          </ThemedText>
        </View>
        <MaterialSwitch value={enabled} onValueChange={onEnabledChange} />
      </View>

      {enabled && (
        <View style={styles.limitControls}>
          <TextInput
            value={draft ?? displayGb}
            onChangeText={setDraft}
            onBlur={commitDraft}
            onSubmitEditing={commitDraft}
            keyboardType="decimal-pad"
            returnKeyType="done"
            selectTextOnFocus
            accessibilityLabel={`${title} in gigabytes`}
            style={[
              styles.input,
              { color: theme.text, borderColor: theme.backgroundSelected },
            ]}
          />
          <ThemedText style={styles.unit}>GB</ThemedText>
          <ThemedText
            type="small"
            themeColor={isOverLimit ? undefined : 'textSecondary'}
            style={[styles.usage, isOverLimit && { color: statusColors.waiting }]}>
            {formatBytes(usedBytes) || '0 B'} used
          </ThemedText>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    padding: Spacing.three,
    borderRadius: Spacing.two,
    gap: Spacing.three,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  rowIcon: {
    width: 24,
    alignItems: 'center',
  },
  rowText: {
    flex: 1,
    gap: 2,
  },
  rowTitle: {
    fontWeight: '600',
  },
  limitControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    // Line the input up with the title above it, past the icon column.
    paddingLeft: 24 + Spacing.three,
  },
  input: {
    width: 72,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
    borderWidth: 1,
    borderRadius: Spacing.one,
    fontSize: 16,
    textAlign: 'right',
  },
  unit: {
    fontSize: 16,
  },
  usage: {
    flex: 1,
    textAlign: 'right',
  },
});
