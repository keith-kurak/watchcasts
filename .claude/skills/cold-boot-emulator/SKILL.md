---
name: cold-boot-emulator
description: Cold boot an Android emulator to fix networking or other state issues. Use when the emulator has broken networking, is stuck, or needs a fresh start.
---

## When to use

- Emulator networking is broken (no internet, adb reverse not working, Metro can't connect)
- Emulator is stuck or unresponsive
- User asks to cold boot or restart an emulator

## Available AVDs

- `Pixel_9a` — phone emulator
- `Wear_OS_Large_Round` — Wear OS watch emulator

## Steps

1. **Kill the running emulator** — find the serial with `adb devices -l`, then shut it down cleanly:
   ```
   adb -s <serial> emu kill
   ```
   Wait a few seconds for the process to exit. If it doesn't respond, use `pkill -f "avd <avdName>"` as a last resort.

2. **Cold boot** — launch with `-no-snapshot-load` to skip restoring state:
   ```
   ~/Library/Android/sdk/emulator/emulator -avd <avdName> -no-snapshot-load &
   ```
   For the phone: `<avdName>` = `Pixel_9a`
   For the watch: `<avdName>` = `Wear_OS_Large_Round`

3. **Wait for boot** — poll until the device is ready:
   ```
   adb -s <serial> wait-for-device
   adb -s <serial> shell getprop sys.boot_completed
   ```
   Wait until `boot_completed` returns `1`.

4. **Restore adb reverse (if needed)** — for Metro/React Native:
   ```
   adb -s <serial> reverse tcp:8081 tcp:8081
   ```

## Notes

- Cold boot takes longer than a snapshot restore (1-3 minutes vs ~30 seconds) but guarantees clean networking state.
- If the emulator is completely stuck and `emu kill` doesn't work, `pkill -f "avd Pixel_9a"` is acceptable, but a subsequent cold boot may take longer to recover the disk image.
- The emulator binary is at `~/Library/Android/sdk/emulator/emulator` (not on PATH by default).
