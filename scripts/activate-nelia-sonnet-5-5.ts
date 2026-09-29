// Activa Nelia v4 (Sonnet 5.5) tras validacion del canario Nia Santiago.
// Sube meerkat_active_versions.nelia.active_version=4 y resync Vapi.
//
// ROLLBACK: correr con --rollback para volver a v3 (Sonnet 4.6).

import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local' });

const NELIA_TORTILLERIA_ID = 'e22fbc64-c01c-4184-8365-62e423052d7a';
const ROLLBACK = process.argv.includes('--rollback');
const TARGET_VERSION = ROLLBACK ? 3 : 4;

async function main() {
  const { createAdminClient } = await import('../src/lib/supabase/admin');
  const { updateVapiAssistant } = await import('../src/lib/vapi/sync');
  const supabase = createAdminClient();

  console.log(`Nelia active_version -> v${TARGET_VERSION} (${ROLLBACK ? 'ROLLBACK a Sonnet 4.6' : 'Sonnet 5.5'})`);

  // 1) upsert version activa del rol
  const { error: verErr } = await supabase
    .from('meerkat_active_versions')
    .upsert({ meerkat_id: 'nelia', active_version: TARGET_VERSION }, { onConflict: 'meerkat_id' });
  if (verErr) { console.error('[upsert]', verErr); process.exit(1); }
  console.log(`  OK meerkat_active_versions.nelia = v${TARGET_VERSION}`);

  // 2) resync Vapi assistant Tortilleria (Nelia)
  const { data: fresh, error: agentErr } = await supabase
    .from('voice_agents').select('*').eq('id', NELIA_TORTILLERIA_ID).single();
  if (agentErr || !fresh) { console.error('[reread]', agentErr); process.exit(1); }
  const vapiId = fresh.vapi_agent_id as string;

  try {
    const ok = await updateVapiAssistant(vapiId, fresh as any, { force: true, syncPeers: false });
    if (!ok) throw new Error('updateVapiAssistant returned false');
    console.log(`  OK Vapi assistant ${vapiId} re-sincronizado`);
  } catch (err) {
    console.error(`  FALLO sync Vapi:`, err);
    process.exit(1);
  }

  // 3) verificar model en Vapi
  await new Promise(r => setTimeout(r, 1000));
  const res = await fetch(`https://api.vapi.ai/assistant/${vapiId}`, {
    headers: { Authorization: `Bearer ${process.env.VAPI_API_KEY}` },
  });
  const asst = await res.json();
  const provider = asst?.model?.provider;
  const model    = asst?.model?.model;
  console.log(`\nVapi ahora: provider=${provider}  model=${model}`);
  const expected = ROLLBACK ? 'claude-sonnet-4-6' : 'claude-sonnet-5-5';
  if (model !== expected) {
    console.error(`\n⚠  ESPERADO ${expected} PERO VAPI TIENE ${model}. Investigar.`);
    process.exit(1);
  }
  console.log(`\nOK. ${ROLLBACK ? 'Rollback completo.' : 'Nelia Tortilleria activa con Sonnet 5.5.'}`);
}

main().catch(err => { console.error(err); process.exit(1); });
