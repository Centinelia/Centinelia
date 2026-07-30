import { createAdminClient } from '@/lib/supabase/admin';
import { buildVapiAssistantForSnapshot } from '@/lib/vapi/sync';
import type { VoiceAgent } from '@/types/agent';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const MEERKATS = ['nia', 'noah', 'nico', 'nelia', 'nara', 'naia', 'neo', 'nova', 'nox', 'niva'];
const SNAPSHOT_DIR = '__snapshots__/vapi-assistants';

// Normaliza el timestamp dinámico del system prompt antes de comparar.
// El prompt incluye "FECHA Y HORA ACTUAL: <date>" que cambia en cada ejecución.
// Reemplazamos ese valor con un token estático para que la comparación sea estructural.
const FECHA_REGEX = /FECHA Y HORA ACTUAL: [^\n]+/g;
const FECHA_PLACEHOLDER = 'FECHA Y HORA ACTUAL: __NORMALIZED__';

function normalizeOutput(obj: unknown): string {
  return JSON.stringify(obj, null, 2).replace(FECHA_REGEX, FECHA_PLACEHOLDER);
}

async function main() {
  const supabase = createAdminClient();
  let failures = 0;

  for (const meerkatId of MEERKATS) {
    const snapshotPath = join(SNAPSHOT_DIR, `${meerkatId}.json`);
    if (!existsSync(snapshotPath)) {
      console.warn(`[skip] no snapshot for ${meerkatId}`);
      continue;
    }

    const { data } = await supabase
      .from('voice_agents')
      .select('*')
      .eq('active', true)
      .filter('features->>meerkat_role_id', 'eq', meerkatId)
      .limit(1)
      .maybeSingle();

    if (!data) { console.warn(`[skip] no agent for ${meerkatId}`); continue; }

    const current = await buildVapiAssistantForSnapshot(data as VoiceAgent);
    const expected = JSON.parse(readFileSync(snapshotPath, 'utf8'));

    const currentStr = normalizeOutput(current);
    const expectedStr = normalizeOutput(expected);

    if (currentStr === expectedStr) {
      console.log(`[ok]   ${meerkatId}`);
    } else {
      console.error(`[FAIL] ${meerkatId} — output differs from snapshot`);
      // Diff simple: primer campo que difiere
      const currKeys = Object.keys(current);
      for (const k of currKeys) {
        const a = normalizeOutput((current as any)[k]);
        const b = normalizeOutput((expected as any)[k]);
        if (a !== b) console.error(`  differs at .${k}`);
      }
      failures++;
    }
  }

  if (failures > 0) {
    console.error(`\n${failures} snapshot mismatch(es) — refactor changed output. Investigate before deploy.`);
    process.exit(1);
  }
  console.log(`\nAll snapshots match. Safe to deploy.`);
}

main().catch(err => { console.error(err); process.exit(1); });
