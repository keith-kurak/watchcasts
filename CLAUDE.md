# Watchcasts

## Project

Podcast app built with Expo Router and React Native. Monorepo with the mobile app at `apps/mobile/`. This is an **Android-only** app — always use the `{ ios, android }` object form of `SymbolView` `name` to include Material Symbol names (e.g. `{ ios: 'arrow.trianglehead.2.clockwise', android: 'sync' }`). Never pass iOS-only SF Symbol strings.

## Phone ↔ Watch Sync

`docs/watch-sync.md` is the living reference for how the phone app and the Wear OS app
(`apps/watch/`) exchange data, and for how the watch downloads episodes.

**Read it before changing any of:**

- The Data Layer contract (`packages/shared/src/datalayer.ts`, `DataLayerContract.kt`,
  `WearDataLayerModule.kt` — the paths are mirrored by hand in all three)
- `EpisodeDownloadWorker`, `SyncedWatchEpisodes`, `SyncedSubscriptions`,
  `WatchDownloadStatusReporter`, `DataLayerListenerService`
- `syncWatchEpisodes` / `useWatchDownloadStatusListener` on the phone

**Update it in the same commit as the change.** Revise the affected section, resolve or
amend the matching entry in its Known issues table, and add a Change log entry at the top
of that section. A behavior change that lands without a doc update is incomplete.

## Argent Testing Workflow

After making code changes that affect the mobile UI:

1. **Reload the app** — Run `debugger-reload-metro` to push JS changes to the emulator/simulator (don't wait for auto-refresh).
2. **Verify visually** — Take a `screenshot` to confirm the change rendered correctly.
3. **Use discovery before interaction** — Always call `describe` (or `debugger-component-tree`) before tapping. Never guess coordinates from screenshots.

### Device preferences

- Use `list-devices` at session start and prefer already-running devices.
- The user typically has a Pixel 9a Android emulator and an iPhone iOS simulator running.

### When to test

- Any change to UI components, layout, styling, navigation, or screen composition.
- Route structure changes (adding/removing screens, changing tab order).
- Don't need to test for pure logic/data changes with no visual impact.
