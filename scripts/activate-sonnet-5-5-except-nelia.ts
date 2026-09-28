// Activa Sonnet 5.5 (v-nueva staged) en 9 roles: nia, noah, nox, niva,
// nico, nara, naia, neo, nova. NELIA se queda en v3 (Sonnet 4.6) intacta
// porque Tortilleria es cliente productivo, se activara despues del canario.
//
// Nia Santiago (LIVE con municipio) sera el primer meerkat con Sonnet 5.5
// en trafico real. Si todo bien, luego Nelia.
//
// USO: pnpm tsx scripts/activate-sonnet-5-5-except-nelia.ts        (dry-run)
//      pnpm tsx scripts/activate-sonnet-5-5-except-nelia.ts --apply

import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local' });

const APPLY = process.argv.includes('--apply');

// meerkatId -> version a activar
const TARGETS: Record<string, number> = {
  nia:  6,
  noah: 2,
  nox:  2,
  niva: 2,
  nico: 3,
  nara: 3,
  naia: 3,
  neo:  3,
  nova: 3,
};

async function main() {
  const { createAdminClient } = await import('../src/lib/supabase/admin');
  const { updateVapiAssistant } = await import('../src/lib/vapi/sync');
  const supabase = createAdminClient();

  console.log(`Sonnet 5.5 rollout (todos menos nelia) — mode=${APPLY ? 'APPLY' : 'DRY-RUN'}`);

  // 1) Estado actual de meerkat_active_versions
  const { data: currentVers } = await supabase
    .from('meerkat_active_versions')
    .select('meerkat_id, active_version')
    .in('meerkat_id', Object.keys(TARGETS));
  const currentMap = new Map((currentVers ?? []).map(r => [r.meerkat_id as string, r.active_version as number]));

  console.log(`\n[1/2] meerkat_active_versions:`);
  for (const [role, targetV] of Object.entries(TARGETS)) {
    const cur = currentMap.get(role) ?? null;
    const arrow = cur === targetV ? 'ya en v' + targetV : `v${cur ?? '?'} -> v${targetV}`;
    console.log(`  ${role.padEnd(6)} ${arrow}`);
    if (cur === targetV) continue;
    if (!APPLY) continue;
    const { error } = await supabase
      .from('meerkat_active_versions')
      .upsert({ meerkat_id: role, active_version: targetV }, { onConflict: 'meerkat_id' });
    if (error) { console.error(`    UPSERT FALLO`, error); process.exit(1); }
    console.log(`    OK v${targetV}`);
  }

  // 2) Resync agentes activos que usen esos 9 roles (excepto nelia)
  console.log(`\n[2/2] Resync Vapi de agentes activos afectados:`);
  const { data: agents } = await supabase
    .from('voice_agents')
    .select('id, business_name, portal_email, features, vapi_agent_id')
    .eq('active', true)
    .not('vapi_agent_id', 'is', null);

  const affected = (agents ?? []).filter(a => {
    const role = ((a.features ?? {}) as Record<string, unknown>).meerkat_role_id as string | undefined;
    return role && role !== 'nelia' && role in TARGETS;
  });

  console.log(`  ${affected.length} agente(s) usando roles en el rollout:`);
  for (const a of affected) {
    const role = ((a.features ?? {}) as Record<string, unknown>).meerkat_role_id;
    console.log(`  - ${a.business_name?.padEnd(35)} role=${role}  vapi=${a.vapi_agent_id}`);
    if (!APPLY) continue;
    try {
      const { data: fresh } = await supabase.from('voice_agents').select('*').eq('id', a.id).single();
      if (!fresh) throw new Error('reread failed');
      const ok = await updateVapiAssistant(a.vapi_agent_id as string, fresh as any, { force: true, syncPeers: false });
      if (!ok) throw new Error('updateVapiAssistant returned false');
      console.log(`    OK resync`);
    } catch (err) {
      console.error(`    RESYNC FALLO`, err);
    }
  }

  console.log(APPLY ? '\nDone.' : '\nDry-run only. Correr con --apply para efectuar.');
}

main().catch(err => { console.error(err); process.exit(1); });
