import { createAdminClient } from '@/lib/supabase/admin';
import { buildVapiAssistantForSnapshot } from '@/lib/vapi/sync';
import type { VoiceAgent } from '@/types/agent';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const MEERKATS = ['nia', 'noah', 'nico', 'nelia', 'nara', 'naia', 'neo', 'nova', 'nox', 'niva'];
const OUT_DIR = '__snapshots__/vapi-assistants';

async function main() {
  const supabase = createAdminClient();
  mkdirSync(OUT_DIR, { recursive: true });

  for (const meerkatId of MEERKATS) {
    // Toma el primer agente activo con este meerkat_role_id
    const { data } = await supabase
      .from('voice_agents')
      .select('*')
      .eq('active', true)
      .filter('features->>meerkat_role_id', 'eq', meerkatId)
      .limit(1)
      .maybeSingle();

    if (!data) {
      console.warn(`[skip] no active agent found for meerkat=${meerkatId}`);
      continue;
    }

    const assistant = await buildVapiAssistantForSnapshot(data as VoiceAgent);
    const filepath = join(OUT_DIR, `${meerkatId}.json`);
    writeFileSync(filepath, JSON.stringify(assistant, null, 2));
    console.log(`[snapshot] ${meerkatId} → ${filepath} (${JSON.stringify(assistant).length} bytes)`);
  }
}

main().catch(err => { console.error(err); process.exit(1); });
