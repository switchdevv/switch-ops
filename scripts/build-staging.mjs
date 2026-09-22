// `npm run build:staging`: the static export built with .env.staging, then refused if it could
// reach production. CI deploys exactly this bundle to staging (docs/staging.md), so neither a
// local staging build nor the deployed one can name the production backend. The check reads
// the exported files in out/, not the config: they are what browsers get.
//
// - Every NEXT_PUBLIC_* value in .env.staging must be in the bundle (the build used the file).
// - No production value may be in it.
//
// The same file is in switch-ops and switch-finance; keep them identical.
import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { extname, join } from 'node:path';

// Values only a production build contains. They are public, but a staging bundle that names one
// sends testers' requests, sign-ins and dispatches to production.
const PRODUCTION_VALUES = [
  'api.switchfood.net', // the production Parse server
  'b4cb8ea88897dba8ec3b', // the production Pusher key
];

const ENV_FILE = '.env.staging';
const OUT_DIR = 'out';
// Pages, scripts and the router's payloads: where NEXT_PUBLIC_* values are inlined.
const TEXT_FILES = new Set(['.html', '.js', '.txt', '.json']);

function fail(problems) {
  const prefix = process.env.GITHUB_ACTIONS ? '::error::' : '✗ ';
  for (const problem of problems) console.error(prefix + problem);
  console.error('\nThis staging build must not be deployed.');
  process.exit(1);
}

// Into process.env, where Next reads them first: .env.local (production values) only fills in
// what is missing. A variable already exported in the shell still wins; the check catches it.
// (`node --env-file` can't do this: Next hands that flag on to its workers, which refuse it.)
process.loadEnvFile(ENV_FILE);
const next = createRequire(import.meta.url).resolve('next/dist/bin/next');
const build = spawnSync(process.execPath, [next, 'build'], { stdio: 'inherit' });
if (build.status !== 0) process.exit(build.status ?? 1);

const expected = Object.entries(process.env).filter(
  ([key, value]) => key.startsWith('NEXT_PUBLIC_') && value,
);
const problems = [];

const serverURL = process.env.NEXT_PUBLIC_PARSE_SERVER_URL ?? '';
if (!serverURL.startsWith('https://')) {
  problems.push(`NEXT_PUBLIC_PARSE_SERVER_URL must be the staging server's https:// URL (${ENV_FILE}).`);
}

const unused = new Set(expected.map(([key]) => key));
const leaks = new Map(); // production value → first file that contains it
for (const file of readdirSync(OUT_DIR, { recursive: true })) {
  if (!TEXT_FILES.has(extname(file))) continue;
  const text = readFileSync(join(OUT_DIR, file), 'utf8');
  for (const [key, value] of expected) if (unused.has(key) && text.includes(value)) unused.delete(key);
  for (const value of PRODUCTION_VALUES) if (!leaks.has(value) && text.includes(value)) leaks.set(value, file);
}

for (const [value, file] of leaks) problems.push(`${OUT_DIR}/${file} contains the production value "${value}".`);
for (const key of unused) {
  problems.push(`The bundle doesn't contain ${key}: no code reads it any more, or the build didn't use ${ENV_FILE}.`);
}

if (problems.length > 0) fail(problems);
console.log(`\nStaging bundle checked: it talks to ${serverURL} and contains no production value.`);
