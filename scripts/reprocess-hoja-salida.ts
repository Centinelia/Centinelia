/**
 * Registra la hoja de salida F-3949 de la OC 6203 directamente, usando los
 * datos extraídos de la imagen (Claude vision) ya que el inbox-processor aún
 * no sabe leer imágenes inline.
 *
 * DATOS (extraídos manualmente de la imagen):
 *   folio_hoja:     3949
 *   cliente:        Natural Bags
 *   fecha:          2026-06-26
 *   series:         X2446TO182IH0113 (4MXW2318), X2424TO182OH0110 (4TXK2318)
 */
import './_bootstrap';

async function main() {
  const dryRun = !process.argv.includes('--apply');
  console.log(`Mode: ${dryRun ? 'DRY-RUN (--apply para escribir)' : 'APPLY (ESCRIBIRÁ al Excel real)'}`);

  const { createAdminClient } = await import('../src/lib/supabase/admin');
  const { executeAgentTool } = await import('../src/lib/tools/executor');
  const sb = createAdminClient();

  const { data: agents } = await sb.from('voice_agents').select('*').eq('portal_email', 'camila@acproyectos.com').eq('agent_name', 'Nami');
  const agent = (agents?.[0] as any);
  if (!agent) throw new Error('No Nami');
  const org = agent.organization_id
    ? (await sb.from('organizations').select('*').eq('id', agent.organization_id).single()).data
    : null;

  const toolInput = {
    folio_hoja:      '3949',
    cliente_nombre:  'Natural Bags',
    fecha:           '2026-06-26',
    series:          ['X2446TO182IH0113', 'X2424TO182OH0110'],
    dry_run:         dryRun,  // la tool no soporta dry_run en firma pero lo paso por si lo lee
  };
  console.log('\nInput:', JSON.stringify(toolInput, null, 2));

  if (dryRun) {
    console.log('\n*** DRY-RUN: NO se invoca la tool. Si todo se ve bien, re-correr con --apply ***');
    return;
  }

  console.log('\nInvocando inv_registrar_salida...');
  const result = await executeAgentTool('inv_registrar_salida', toolInput, {
    agentId: agent.id,
    portalEmail: 'camila@acproyectos.com',
    agentName: 'Nami',
    businessName: (org as any)?.business_name ?? 'AC Proyectos',
    portalToken: agent.portal_token ?? '',
    agent,
    supabase: sb as any,
    channel: 'email',
    userContext: 'Reprocesamiento manual de hoja de salida F-3949 — datos extraídos de imagen inline por operador',
  });

  console.log('\n--- RESULTADO ---');
  console.log(JSON.stringify(result, null, 2).slice(0, 3000));
}
main().catch(e => { console.error('ERROR:', e); process.exit(1); });
