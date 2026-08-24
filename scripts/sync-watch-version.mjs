#!/usr/bin/env bun
/**
 * Publishes the phone app's version to the watch app, as EAS environment variables.
 *
 * Run after every production phone build — `bun run build:production:mobile` does it for
 * you. To rebuild only the watch, use `bun run bump:phone-version` instead, which moves the
 * phone's number on first so the watch gets one Play has not seen.
 *
 * See scripts/lib/watch-version.mjs for the numbering scheme.
 */
import { syncWatchVersion } from './lib/watch-version.mjs';

syncWatchVersion();
