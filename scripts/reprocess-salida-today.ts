import './_bootstrap';
async function main() {
  const { createAdminClient } = await import('../src/lib/supabase/admin');
  const { executeAgentTool } = await import('../src/lib/tools/executor');
  const sb = createAdminClient();
  const { data: agent } = await sb.from('voice_agents').select('*').eq('id', '3245bc1f-89e1-4949-bbed-71a18b05e344').single();
  const a = agent as any;
  const { data: org } = await sb.from('organizations').select('name').eq('portal_email', 'camila@acproyectos.com').single();

  const result = await executeAgentTool('inv_registrar_salida', {
    folio_hoja: '3949',
    cliente_nombre: 'Natural Bags',
    fecha: '2026-06-26',
    series: ['X2446TO182IH0113', 'X2424TO182OH0110'],
  }, {
    agentId: a.id, portalEmail: 'camila@acproyectos.com', agentName: 'Nami',
    businessName: (org as any)?.name ?? 'AC Proyectos', portalToken: a.portal_token ?? '',
    agent: a, supabase: sb as any, channel: 'email', userContext: 'Hoja salida manual OC 6203',
  });
  console.log(JSON.stringify(result, null, 2).slice(0, 2000));
}
main().catch(e => { console.error(e); process.exit(1); });
