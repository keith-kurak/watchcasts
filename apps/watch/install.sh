#!/bin/bash
set -e
cd "$(dirname "$0")/android"
./gradlew :app:assembleDebug
SERIAL=$(adb devices -l | grep gwear | awk '{print $1}')
if [ -z "$SERIAL" ]; then
  echo "Error: No Wear OS emulator found. Start one first." >&2
  exit 1
fi
adb -s "$SERIAL" install app/build/outputs/apk/debug/app-debug.apk
