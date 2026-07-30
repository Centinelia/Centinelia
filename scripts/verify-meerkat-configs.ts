// Static snapshot verification for MEERKAT_CONFIGS.
// No DB required — compares config values directly.
// Run: npx tsx scripts/verify-meerkat-configs.ts

import * as fs from 'fs';
import * as path from 'path';
import { MEERKAT_CONFIGS } from '@/lib/vapi/meerkat-configs';

const SNAPSHOT_PATH = path.join(process.cwd(), '__snapshots__', 'meerkat-configs.json');

const golden = JSON.parse(fs.readFileSync(SNAPSHOT_PATH, 'utf-8'));

const actualStr = JSON.stringify(MEERKAT_CONFIGS, null, 2);
const goldenStr = JSON.stringify(golden, null, 2);

if (actualStr === goldenStr) {
  console.log('All 10 meerkat configs match golden snapshot.');
  process.exit(0);
}

// Print per-meerkat diff
const actualMeerkats = Object.keys(MEERKAT_CONFIGS);
const goldenMeerkats = Object.keys(golden);
const allMeerkats = Array.from(new Set([...actualMeerkats, ...goldenMeerkats]));

console.error('MEERKAT CONFIG MISMATCH — diff below:\n');

for (const meerkat of allMeerkats) {
  const actualVersions = MEERKAT_CONFIGS[meerkat] ?? {};
  const goldenVersions = golden[meerkat] ?? {};
  const allVersions = Array.from(
    new Set([...Object.keys(actualVersions), ...Object.keys(goldenVersions)].map(Number))
  );

  for (const v of allVersions) {
    const actual = actualVersions[v];
    const goldenV = goldenVersions[v];

    if (!actual) {
      console.error(`  [${meerkat}] v${v}: missing in MEERKAT_CONFIGS (exists in snapshot)`);
      continue;
    }
    if (!goldenV) {
      console.error(`  [${meerkat}] v${v}: missing in snapshot (exists in MEERKAT_CONFIGS)`);
      continue;
    }

    const allFields = Array.from(
      new Set([...Object.keys(actual), ...Object.keys(goldenV)])
    ) as (keyof typeof actual)[];

    for (const field of allFields) {
      if (actual[field] !== goldenV[field]) {
        console.error(
          `  [${meerkat}] v${v}.${field}: got ${JSON.stringify(actual[field])}, want ${JSON.stringify(goldenV[field])}`
        );
      }
    }
  }
}

process.exit(1);
