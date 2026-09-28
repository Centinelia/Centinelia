// Activa use_custom_llm=true en un agente específico y re-sincroniza tools con Vapi.
//
// Contexto (2026-09-27): política nueva de que todos los meerkats corran con
// custom-llm + Sonnet 4.6 + prompt caching Anthropic. Costo real ~$0.05/min
// vs ~$0.20/min sin cache; margen sano vs precio venta $9.99/min. Además el
// path custom-llm entrega los fixes de los 3 bugs SSE (arguments vacío, IDs
// toolu→call, wrap {results:[{toolCallId,result}]}) que sin él dejan al modelo
// viendo "No result returned" en tools con endpoint propio.
//
// USO:
//   pnpm tsx scripts/enable-custom-llm.ts --portal=X --role=nelia          (dry-run)
//   pnpm tsx scripts/enable-custom-llm.ts --portal=X --role=nelia --apply
//   pnpm tsx scripts/enable-custom-llm.ts --agent-id=UUID --apply
//
// PRE-REQUISITOS:
//   - El meerkat_role_id del agente debe estar en Sonnet 4.6 en meerkat-configs.ts.
//     Si está en Haiku (nia<v5, nico, nara, naia, neo, nova), primero activar la
//     versión Sonnet en meerkat_active_versions.
//   - Todas las tools que use el meerkat deben tener el wrap correcto
//     ({results:[{toolCallId,result}]}). Verificado en sesión 2026-09-27 para el
//     roster actual, más 7 rutas fantasma reasignadas al ruteador genérico.
//
// ROLLBACK:
//   UPDATE voice_agents
//   SET features = features - 'use_custom_llm'
//   WHERE id = '<agent_id>';
//   Luego resincronizar Vapi.

import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local' });

interface Args {
  portal?:   string;
  role?:     string;
  agentId?:  string;
  apply:     boolean;
}

function parseArgs(): Args {
  const args: Args = { apply: false };
  for (const a of process.argv.slice(2)) {
    if (a === '--apply') args.apply = true;
    else if (a.startsWith('--portal='))   args.portal  = a.slice('--portal='.length);
    else if (a.startsWith('--role='))     args.role    = a.slice('--role='.length);
    else if (a.startsWith('--agent-id=')) args.agentId = a.slice('--agent-id='.length);
  }
  if (!args.agentId && (!args.portal || !args.role)) {
    console.error('Uso: --agent-id=UUID  |  --portal=<email> --role=<meerkat_role_id>  [--apply]');
    process.exit(2);
  }
  return args;
}

async function main() {
  const args = parseArgs();
  const { createAdminClient } = await import('../src/lib/supabase/admin');
  const supabase = createAdminClient();

  let query = supabase.from('voice_agents').select('id, business_name, portal_email, active, vapi_agent_id, features');
  if (args.agentId) {
    query = query.eq('id', args.agentId);
  } else {
    query = query.eq('portal_email', args.portal!).filter('features->>meerkat_role_id', 'eq', args.role!);
  }
  const { data: rows, error: qErr } = await query;
  if (qErr) { console.error('[query]', qErr); process.exit(1); }
  if (!rows?.length) { console.error('No encontré agentes con esos criterios.'); process.exit(1); }
  if (rows.length > 1 && !args.agentId) {
    console.warn(`⚠  Encontré ${rows.length} filas. Aplicaría a TODAS. Considera acotar con --agent-id.`);
  }

  const { updateVapiAssistant } = await import('../src/lib/vapi/sync');

  for (const row of rows) {
    const feats = (row.features ?? {}) as Record<string, unknown>;
    const role  = feats.meerkat_role_id ?? '(sin rol)';
    const already = feats.use_custom_llm === true;
    console.log(`\nAgent id=${row.id} name="${row.business_name}" role=${role} active=${row.active}`);
    console.log(`  vapi_agent_id=${row.vapi_agent_id ?? '(none)'}`);
    console.log(`  features.use_custom_llm actual: ${already ? 'true (nada que hacer)' : 'ausente / false'}`);
    if (already) continue;

    if (!args.apply) {
      console.log('  DRY-RUN: SET features.use_custom_llm = true (correr con --apply)');
      continue;
    }

    const nextFeats = { ...feats, use_custom_llm: true };
    const { error: uErr } = await supabase.from('voice_agents').update({ features: nextFeats }).eq('id', row.id);
    if (uErr) { console.error(`  [update ${row.id}]`, uErr); process.exit(1); }
    console.log('  ✅ features.use_custom_llm = true');

    if (row.vapi_agent_id) {
      try {
        const { data: fresh } = await supabase.from('voice_agents').select('*').eq('id', row.id).single();
        if (!fresh) throw new Error('no se pudo releer el agent tras update');
        const ok = await updateVapiAssistant(row.vapi_agent_id as string, fresh as any, { force: true, syncPeers: false });
        if (!ok) throw new Error('updateVapiAssistant devolvió false (rol no-voice?).');
        console.log(`  ✅ Vapi assistant ${row.vapi_agent_id} re-sincronizado`);
      } catch (syncErr) {
        console.error('  ⚠  Update DB OK pero sync Vapi falló:', syncErr);
        console.error('  Correr sync manual desde /admin/agents antes de la siguiente llamada.');
        process.exit(1);
      }
    } else {
      console.warn('  ⚠  Sin vapi_agent_id — no puedo re-sync. Debe estar sincronizado previamente en Vapi.');
    }
  }

  console.log(args.apply ? '\nDone.' : '\nDry-run only. Correr con --apply para efectuar cambios.');
}

main().catch(err => { console.error(err); process.exit(1); });
