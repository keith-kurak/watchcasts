#!/usr/bin/env bun
/**
 * Publishes the phone app's version to the watch app, as EAS environment variables.
 *
 * The two apps share an applicationId and therefore one Play listing, and Play rejects a
 * release whose artifacts share a versionCode. The phone's versionCode is owned by EAS
 * (`appVersionSource: remote`, `autoIncrement` on the production profile); the watch has no
 * versioning of its own, and takes what this script writes:
 *
 *   WATCH_VERSION_CODE = phone versionCode + 10000   (phone 13 -> watch 10013)
 *   WATCH_VERSION_NAME = phone version               (the x.y.z users see)
 *
 * apps/watch/.eas/build/watch-production.yml reads both and passes them to gradle. Run this
 * after every production phone build — `bun run build:production:mobile` does it for you.
 *
 * Both apps live in one EAS project, so the variables are set once, on the project, in the
 * `production` environment. That is the environment a store-distribution build profile uses
 * by default, which is what `production-watch` is.
 */
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** The offset that keeps the watch's numbering clear of the phone's for the listing's life. */
const WATCH_VERSION_CODE_OFFSET = 10000;

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const mobileDir = join(repoRoot, 'apps', 'mobile');

function eas(args, { capture = false } = {}) {
  // Run from the mobile app: it holds the eas.json that declares the remote version source,
  // and resolves to the same EAS project the watch belongs to.
  const result = spawnSync('bunx', ['eas', ...args], {
    cwd: mobileDir,
    encoding: 'utf8',
    stdio: capture ? ['inherit', 'pipe', 'inherit'] : 'inherit',
  });

  if (result.status !== 0) {
    throw new Error(`eas ${args.join(' ')} failed with status ${result.status}`);
  }

  return result.stdout;
}

function phoneVersionCode() {
  const output = eas(
    ['build:version:get', '--platform', 'android', '--json', '--non-interactive'],
    { capture: true }
  );
  // Reported as a string, and only after a build has been created — a fresh project with no
  // production build yet has no remote version to read.
  const { versionCode } = JSON.parse(output);
  const parsed = Number.parseInt(versionCode, 10);

  if (!Number.isInteger(parsed)) {
    throw new Error(
      `EAS returned no Android versionCode for this project (got ${JSON.stringify(versionCode)}). ` +
        'Create a production phone build first, or seed it with `eas build:version:set`.'
    );
  }

  return parsed;
}

function phoneVersionName() {
  // app.config.js is a function of the static config; calling it with an empty base is
  // enough to read `version`, which is a literal in that file.
  const require = createRequire(import.meta.url);
  const { version } = require(join(mobileDir, 'app.config.js'))({ config: {} });

  if (typeof version !== 'string') {
    throw new Error('apps/mobile/app.config.js did not resolve a `version`');
  }

  return version;
}

function setProductionVariable(name, value) {
  eas([
    'env:set',
    '--name',
    name,
    '--value',
    value,
    '--environment',
    'production',
    '--scope',
    'project',
    '--type',
    'string',
    '--visibility',
    'plaintext',
    '--non-interactive',
  ]);
}

const versionCode = phoneVersionCode();
const versionName = phoneVersionName();
const watchVersionCode = versionCode + WATCH_VERSION_CODE_OFFSET;

console.log(`Phone: ${versionName} (${versionCode})`);
console.log(`Watch: ${versionName} (${watchVersionCode})`);

setProductionVariable('WATCH_VERSION_CODE', String(watchVersionCode));
setProductionVariable('WATCH_VERSION_NAME', versionName);

console.log('Wrote WATCH_VERSION_CODE and WATCH_VERSION_NAME to the production environment.');
