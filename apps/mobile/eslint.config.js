// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ["dist/*"],
  },
  {
    // Remote images need our User-Agent or some hosts 403 them — see
    // src/components/image.tsx. Importing expo-image's Image directly skips that,
    // and the failure is silent: a blank thumbnail, no error. Route it through
    // the wrapper so nobody has to remember.
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/components/image.tsx"],
    rules: {
      "no-restricted-imports": ["error", {
        paths: [{
          name: "expo-image",
          importNames: ["Image"],
          message: "Import { Image } from '@/components/image' instead — it adds the User-Agent that remote artwork needs.",
        }],
      }],
    },
  },
]);
