#!/usr/bin/env bun
/**
 * Moves the phone app's remote versionCode on by one, then re-syncs the watch's version.
 *
 * For rebuilding only the watch. The watch's versionCode is derived from the phone's, so a
 * second watch AAB built against an unchanged phone number would carry a versionCode Play
 * has already seen, and be rejected. Bumping first gives the rebuild a fresh number:
 *
 *   bun run bump:phone-version      # phone 2 -> 3, watch 10002 -> 10003
 *   bun run build:production:watch
 *
 * The phone's own next production build then takes 4, so nothing is reused. The cost is a
 * skipped phone versionCode, which is invisible to users and to Play.
 *
 * ⚠️  This needs a terminal. `eas build:version:set` takes the new value from an interactive
 * prompt — as of eas-cli 22.2.0 it has no flag for it, and it refuses a piped stdin — so
 * this script cannot fill the value in for you. It prints the number to type, hands the
 * prompt over, and then checks that what landed is what it asked for.
 */
import { eas, phoneVersionCode, syncWatchVersion } from './lib/watch-version.mjs';

const current = phoneVersionCode();
const target = current + 1;

console.log(`Phone versionCode is ${current}.`);
console.log(`\n  Type ${target} at the prompt below.\n`);

eas(['build:version:set', '--platform', 'android']);

const updated = phoneVersionCode();

if (updated !== target) {
  // Worth stopping for: syncing off a wrong number is how the watch ends up with a
  // versionCode that collides with a release, which Play only reports after the upload.
  throw new Error(
    `Expected the phone versionCode to be ${target}, but it is ${updated}. ` +
      'Nothing was synced to the watch — re-run this command.'
  );
}

console.log('');
syncWatchVersion();
