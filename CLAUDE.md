# Watchcasts

## Project

Podcast app built with Expo Router and React Native. Monorepo with the mobile app at `apps/mobile/`.

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
