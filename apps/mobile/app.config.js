// ─────────────────────────────────────────────────────────────────────────────
// ⚠️  SHARED APP IDENTITY — MUST MATCH THE WATCH APP
//
// The phone app and the Wear OS app are linked by having the SAME applicationId
// AND the same signing key. This `applicationId` MUST stay identical to
// `appId` in apps/watch/gradle.properties, or:
//   • the Wearable Data Layer will not route messages/data between them, and
//   • Google Play will reject the second APK uploaded under this package.
//
// Single source of truth lives here for the JS side. The Gradle side mirrors it
// (see apps/watch/gradle.properties). Keep them in sync.
// ─────────────────────────────────────────────────────────────────────────────
const APPLICATION_ID = "dev.podcatch.app";

module.exports = ({ config }) => ({
  ...config,
  name: "Podcatch",
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
    //"./plugins/withWearableDataLayer",
    [
      "expo-audio",
      {
        enableBackgroundPlayback: true,
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
    reactCompiler: true,
    inlineModules: {
      watchedDirectories: ["modules"],
    },
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
