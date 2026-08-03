// ─────────────────────────────────────────────────────────────────────────────
// ⚠️  SHARED APP IDENTITY — MUST MATCH THE WATCH APP
//
// The phone app and the Wear OS app are linked by having the SAME applicationId
// AND the same signing key. The watch app's applicationId is set in
// apps/watch/gradle.properties with an `applicationIdSuffix = "dev"` on its
// debug build type. Both sides must resolve to the same package per variant:
//   dev:  com.keithkurak.watchcasts.dev
//   prod: com.keithkurak.watchcasts
// ─────────────────────────────────────────────────────────────────────────────
const IS_DEV = (process.env.APP_VARIANT ?? "development") === "development";
const APPLICATION_ID = IS_DEV
  ? "com.keithkurak.watchcasts.dev"
  : "com.keithkurak.watchcasts";

module.exports = ({ config }) => ({
  ...config,
  name: IS_DEV ? "TinyP (Dev)" : "Tiny Podcatcher",
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
      backgroundColor: "#E6F4FE",
      foregroundImage: "./assets/images/android-icon-foreground.png",
      backgroundImage: "./assets/images/android-icon-background.png",
      monochromeImage: "./assets/images/android-icon-monochrome.png",
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
        backgroundColor: "#208AEF",
        android: {
          image: "./assets/images/splash-icon.png",
          imageWidth: 76,
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
        usePrecompiledModules: true,
      },
    ],
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
