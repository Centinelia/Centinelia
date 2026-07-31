import { readFileSync } from 'node:fs';
import { GOLDEN_SCENARIOS } from '@/lib/golden-tests/registry';
import { hashScenarioSet } from '@/lib/golden-tests/hash';
import { MEERKAT_IDS } from '@/lib/golden-tests/types';

const SNAPSHOT = '__snapshots__/golden-scenarios.json';

function main() {
  const snapshot = JSON.parse(readFileSync(SNAPSHOT, 'utf8'));
  let failures = 0;

  for (const meerkatId of MEERKAT_IDS) {
    const currentHash = hashScenarioSet(meerkatId);
    const currentCount = GOLDEN_SCENARIOS[meerkatId].length;
    const expected = snapshot[meerkatId];

    if (!expected) {
      console.error(`[FAIL] ${meerkatId} missing from snapshot`);
      failures++;
      continue;
    }

    if (expected.hash !== currentHash || expected.count !== currentCount) {
      console.error(
        `[FAIL] ${meerkatId} — expected count=${expected.count} hash=${expected.hash.slice(0, 12)}, ` +
        `got count=${currentCount} hash=${currentHash.slice(0, 12)}`,
      );
      failures++;
    } else {
      console.log(`[ok]   ${meerkatId} (count=${currentCount})`);
    }
  }

  if (failures > 0) {
    console.error(
      `\n${failures} snapshot mismatch(es). If intentional, update __snapshots__/golden-scenarios.json ` +
      `and re-run. If not, revert the scenario changes.`,
    );
    process.exit(1);
  }
  console.log(`\nAll snapshots match.`);
}

main();
