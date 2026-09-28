// Verifica el estado de Nia Santiago en producción:
// - active_version en meerkat_active_versions.nia (debe ser 5 = Sonnet 4.6)
// - agente Santiago tiene features.use_custom_llm=true
//
// USO: pnpm tsx scripts/check-nia-santiago-version.ts

import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local' });

async function main() {
  const { createAdminClient } = await import('../src/lib/supabase/admin');
  const supabase = createAdminClient();

  // 1) Versión activa global del rol nia
  const { data: activeVer, error: verErr } = await supabase
    .from('meerkat_active_versions')
    .select('meerkat_id, active_version')
    .eq('meerkat_id', 'nia')
    .maybeSingle();
  if (verErr) { console.error('[meerkat_active_versions query]', verErr); process.exit(1); }

  console.log('meerkat_active_versions.nia:');
  if (!activeVer) {
    console.log('  (no row) — fallback a la version mas alta en meerkat-configs, que hoy es 5 (Sonnet 4.6)');
  } else {
    console.log(`  active_version=${activeVer.active_version} (esperado: 5)`);
    if (activeVer.active_version !== 5) {
      console.log('  ATENCION: active_version != 5. Nia Santiago NO esta en Sonnet 4.6.');
    }
  }

  // 2) Agente(s) que usan rol nia (para Santiago debe existir uno)
  const { data: niaAgents, error: agErr } = await supabase
    .from('voice_agents')
    .select('id, business_name, portal_email, active, vapi_agent_id, phone_number, features')
    .filter('features->>meerkat_id', 'eq', 'nia');
  if (agErr) { console.error('[voice_agents query]', agErr); process.exit(1); }

  console.log(`\nAgentes con rol nia (${niaAgents?.length ?? 0}):`);
  for (const a of niaAgents ?? []) {
    const feats = (a.features ?? {}) as Record<string, unknown>;
    console.log(`  - "${a.business_name}" id=${a.id}`);
    console.log(`    portal=${a.portal_email}  active=${a.active}  phone=${a.phone_number ?? '(none)'}`);
    console.log(`    vapi_agent_id=${a.vapi_agent_id ?? '(none)'}`);
    console.log(`    features.use_custom_llm=${feats.use_custom_llm ?? '(ausente)'}  client_memory=${feats.client_memory ?? '(ausente)'}  fichas_informativas=${feats.fichas_informativas ?? '(ausente)'}`);
    const pinnedVersion = feats.pinned_meerkat_version;
    if (pinnedVersion !== undefined) console.log(`    features.pinned_meerkat_version=${pinnedVersion}`);
  }
}

main().catch(err => { console.error(err); process.exit(1); });
