// ─────────────────────────────────────────────────────────────────────────────
// ⚠️  SHARED APP IDENTITY — MUST MATCH THE WATCH APP
//
// The phone app and the Wear OS app are linked by having the SAME applicationId
// AND the same signing key. The watch app's applicationId is set in
// apps/watch/gradle.properties with an `applicationIdSuffix = "dev"` on its
// debug build type. Both sides must resolve to the same package per variant:
//   dev:  com.keithkurak.tinypodcatcher.dev
//   prod: com.keithkurak.tinypodcatcher
// ─────────────────────────────────────────────────────────────────────────────
// Shared with the JS splash overlay in src/components/animated-icon.tsx, which covers
// the screen for a moment after the native splash hands over. Both must use the same
// colour or the handoff flashes.
const splashColors = require("./splash-colors.json");

const IS_DEV = (process.env.APP_VARIANT ?? "development") === "development";
const APPLICATION_ID = IS_DEV
  ? "com.keithkurak.tinypodcatcher.dev"
  : "com.keithkurak.tinypodcatcher";

module.exports = ({ config }) => ({
  ...config,
  name: IS_DEV ? "PDuck (Dev)" : "Podcast Duck",
  slug: "podcatch",
  version: "1.0.0",
  orientation: "portrait",
  icon: "./assets/images/icon.png",
  scheme: "podcatch",
  userInterfaceStyle: "automatic",
  ios: {
    icon: "./assets/expo.icon",
    bundleIdentifier: APPLICATION_ID,
    infoPlist: {
      UIBackgroundModes: ["audio"],
    },
  },
  android: {
    package: APPLICATION_ID,
    adaptiveIcon: {
      backgroundColor: "#FAF3E3",
      foregroundImage: "./assets/images/android-icon-foreground.png"
    },
    predictiveBackGestureEnabled: false,
  },
  web: {
    output: "static",
    favicon: "./assets/images/favicon.png",
  },
  plugins: [
    "expo-router",
    "expo-sqlite",
    "expo-font",
    "expo-image",
    "expo-status-bar",
    "expo-web-browser",
    "expo-sharing",
    [
      "expo-splash-screen",
      {
        // The launcher icon's own foreground, so the splash reads as that icon
        // expanding rather than a second, unrelated mark. The old splash-icon.png was a
        // white silhouette that only worked against the hardcoded blue.
        //
        // Light background matches `android.adaptiveIcon.backgroundColor` exactly — the
        // artwork was drawn against that cream. Dark matches the app's own dark
        // background, so the splash hands over to the first screen without a flash.
        backgroundColor: splashColors.light,
        image: "./assets/images/android-icon-foreground.png",
        // The foreground carries the adaptive-icon safe-zone padding, so the duck fills
        // only the middle ~44% of the canvas. This is the whole canvas width; the glyph
        // lands smaller than this number suggests.
        imageWidth: 180,
        dark: {
          backgroundColor: splashColors.dark,
          image: "./assets/images/android-icon-foreground.png",
        },
      },
    ],
    [
      "expo-audio",
      {
        enableBackgroundPlayback: true,
      },
    ],
    [
      "expo-build-properties",
      {
        android: {
          // Android 12+ only. Expo's default is 24 (Android 7.0); this is a
          // deliberate floor, not an inherited value.
          minSdkVersion: 31,
          usePrecompiledModules: true,
        },
      },
    ],
    // Material You for the views AppCompat draws (text cursor, selection handles,
    // native ripples). minSdkVersion 31 above means the dynamic palette is always
    // available, so this never falls back to the Material 3 baseline.
    "./plugins/with-material3-dynamic-colors",
  ],
  experiments: {
    typedRoutes: true,
    reactCompiler: true,
  },
  extra: {
    eas: {
      projectId: "0b463a40-4929-4d6e-a899-6d2d886a0b85",
    },
  },
  updates: {
    url: "https://u.expo.dev/0b463a40-4929-4d6e-a899-6d2d886a0b85",
  },
  runtimeVersion: {
    policy: "appVersion",
  },
});
