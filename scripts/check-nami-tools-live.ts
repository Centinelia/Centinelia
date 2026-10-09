import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
async function main() {
  // Simula lo que hace el inbox-processor para Nami
  const { resolveOrgPackContext, resolveActivePacks, meerkatActivePacks, TOOL_TO_PACK } = await import('../src/lib/tools/packs');
  const { data: agents } = await sb.from('voice_agents').select('id, features').eq('portal_email', 'camila@acproyectos.com').eq('agent_name', 'Nami');
  const nami = (agents?.[0] as any);
  
  const packCtx = await resolveOrgPackContext('camila@acproyectos.com', sb as any);
  const orgActive = resolveActivePacks(packCtx);
  const agentFeat = (nami.features ?? {}) as Record<string, unknown>;
  const activePacks = meerkatActivePacks(orgActive, agentFeat);
  
  console.log('Active packs:', [...activePacks]);
  console.log('\ninv_procesar_oc_qb → pack:', TOOL_TO_PACK['inv_procesar_oc_qb']);
  console.log('inv_agregar_equipo → pack:', TOOL_TO_PACK['inv_agregar_equipo']);
  console.log('inv_procesar_factura_trane → pack:', TOOL_TO_PACK['inv_procesar_factura_trane']);
  console.log('inv_importar_backlog → pack:', TOOL_TO_PACK['inv_importar_backlog']);
  
  console.log('\n¿inv_procesar_oc_qb pasa pack filter?', !TOOL_TO_PACK['inv_procesar_oc_qb'] || activePacks.has(TOOL_TO_PACK['inv_procesar_oc_qb']));
}
main().catch(e => { console.error(e); process.exit(1); });
