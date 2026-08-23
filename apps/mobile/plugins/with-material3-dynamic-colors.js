const { withAndroidStyles } = require('expo/config-plugins');

const APP_THEME = 'AppTheme';
const DYNAMIC_PARENT = 'Theme.Material3.DynamicColors.DayNight.NoActionBar';

/**
 * Points the Android app theme at Material 3 with dynamic colors.
 *
 * Expo generates `AppTheme` with `Theme.AppCompat.DayNight.NoActionBar` as its parent and
 * a hardcoded `colorPrimary`. Anything Compose draws already follows Material You —
 * `@expo/ui` calls `dynamicDarkColorScheme(context)` itself, so the FAB, switches and
 * everything reading `useMaterialColors()` track the wallpaper regardless of this theme.
 * What does not are the views AppCompat still draws for React Native: the text cursor and
 * selection handles, and native ripples. Those read `colorPrimary`/`colorControlActivated`
 * off this theme, which is why they stayed a fixed navy while the rest of the app changed.
 *
 * `Theme.Material3.DynamicColors.*` layers `ThemeOverlay.Material3.DynamicColors` over the
 * Material 3 theme, which maps those attributes onto the system palette on Android 12+ and
 * falls back to the Material 3 baseline below it. It still descends from an AppCompat
 * theme, which React Native requires.
 *
 * The theme resource comes from `com.google.android.material` (1.13.0 here), pulled in
 * transitively by `@expo/ui` among others. It is not declared directly in the app, so if
 * every Material-dependent package were ever removed the prebuild would fail on a missing
 * style resource rather than silently drop dynamic colors.
 */
const withMaterial3DynamicColors = (config) =>
  withAndroidStyles(config, (config) => {
    const styles = config.modResults?.resources?.style;

    // Fail the prebuild rather than no-op. A silent skip here would mean the app quietly
    // reverts to a static palette after an Expo upgrade changes this file's shape, and the
    // only symptom would be a cursor colour nobody thinks to check.
    if (!Array.isArray(styles)) {
      throw new Error(
        '[with-material3-dynamic-colors] Unexpected styles.xml shape: no resources.style array.',
      );
    }

    const appTheme = styles.find((style) => style?.$?.name === APP_THEME);
    if (!appTheme) {
      throw new Error(
        `[with-material3-dynamic-colors] No <style name="${APP_THEME}"> in styles.xml. ` +
          'Expo may have renamed the generated theme; update this plugin to match.',
      );
    }

    appTheme.$.parent = DYNAMIC_PARENT;

    // Drop Expo's hardcoded `colorPrimary` (#023c69). Changing the parent alone is not
    // enough: a style's own items beat anything it inherits, so this one item would keep
    // overriding the dynamic colorPrimary the overlay supplies and nothing would visibly
    // change. Other items are left alone — `editTextBackground` is React Native's input
    // drawable, and the transparent system bars are deliberate.
    if (Array.isArray(appTheme.item)) {
      appTheme.item = appTheme.item.filter((item) => item?.$?.name !== 'colorPrimary');
    }

    return config;
  });

module.exports = withMaterial3DynamicColors;
