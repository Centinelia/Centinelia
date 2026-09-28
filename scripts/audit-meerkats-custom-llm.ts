// Audit rapido del estado de custom-llm por agente para planear rollout.
// Lista: id, business, role, active, use_custom_llm, model tier via meerkat-configs.

import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local' });

const ROLES_SONNET_YA  = new Set(['nelia', 'noah', 'nox', 'niva']);  // v activa hoy = Sonnet
const ROLES_NIA_SPECIAL = new Set(['nia']);                          // v5 Sonnet global
const ROLES_HAIKU_HOY  = new Set(['nico', 'nara', 'naia', 'neo', 'nova']); // v1 Haiku; v2 Sonnet staged

async function main() {
  const { createAdminClient } = await import('../src/lib/supabase/admin');
  const supabase = createAdminClient();

  // Traer todos los agentes voice activos con rol
  const { data: agents, error } = await supabase
    .from('voice_agents')
    .select('id, business_name, portal_email, active, vapi_agent_id, features')
    .eq('active', true)
    .not('vapi_agent_id', 'is', null);
  if (error) { console.error(error); process.exit(1); }

  const byRole = new Map<string, Array<typeof agents[number]>>();
  for (const a of agents ?? []) {
    const role = ((a.features ?? {}) as Record<string, unknown>).meerkat_role_id as string | undefined;
    if (!role) continue;
    if (!byRole.has(role)) byRole.set(role, []);
    byRole.get(role)!.push(a);
  }

  const roleTier = (role: string): string => {
    if (ROLES_SONNET_YA.has(role))  return 'SONNET-YA';
    if (ROLES_NIA_SPECIAL.has(role)) return 'NIA-v5-SONNET';
    if (ROLES_HAIKU_HOY.has(role))  return 'HAIKU (necesita active_version=2)';
    return 'OTRO';
  };

  console.log(`\nAgentes activos con voice: ${agents?.length ?? 0}\n`);

  for (const role of Array.from(byRole.keys()).sort()) {
    const rows = byRole.get(role)!;
    console.log(`\n=== rol='${role}' [${roleTier(role)}] (${rows.length}) ===`);
    for (const a of rows) {
      const feats = (a.features ?? {}) as Record<string, unknown>;
      const flag = feats.use_custom_llm === true ? 'ON ' : 'off';
      const pinned = feats.pinned_meerkat_version ?? '-';
      console.log(`  [${flag}] ${a.business_name?.padEnd(40).slice(0, 40)}  portal=${a.portal_email}  pin=${pinned}`);
    }
  }

  console.log('\n---');
  console.log('Rollout sugerido:');
  console.log('  1) Roles Sonnet ya listos (nelia, noah, nox, niva) sin ON: correr enable-custom-llm --apply.');
  console.log('  2) Rol nia: ya v5 global. Solo enable-custom-llm --apply para agentes con flag off.');
  console.log('  3) Roles Haiku (nico, nara, naia, neo, nova) sin ON: primero activar meerkat_active_versions.<rol>.active_version=2 (via SQL o /admin/versiones), despues enable-custom-llm --apply.');
}

main().catch(err => { console.error(err); process.exit(1); });
