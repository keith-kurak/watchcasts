import { useMaterialColors } from '@expo/ui/jetpack-compose';

/**
 * App colors taken from the Material palette instead of hardcoded hex.
 *
 * The literals these replace were iOS system colors — `#007AFF`, `#FF3B30`, `#34C759`,
 * `#FFB300` — in an Android-only app, so they matched nothing around them.
 *
 * Material 3 defines a role for `error` but none for success or warning, so those two
 * are mapped by choice rather than by spec: `primary` for a finished/healthy state and
 * `tertiary` for a holding state, which is the accent Material reserves for exactly this
 * kind of secondary signal. They stay on-palette and shift with the rest of the theme,
 * which is the point — but they are conventions of this app, not of Material.
 */
export function useStatusColors() {
  const m = useMaterialColors();

  return {
    /** Determinate progress indicator. */
    progressFill: m.primary,
    /** Track behind a progress indicator. */
    progressTrack: m.surfaceContainerHighest,
    /** A failed download, or any state needing attention. */
    error: m.error,
    /** Queued but deliberately held — waiting for Wi-Fi, for instance. */
    waiting: m.tertiary,
    /** Finished, present, connected. */
    success: m.primary,
    /** Not started, or nothing to report. */
    idle: m.onSurfaceVariant,
  };
}
