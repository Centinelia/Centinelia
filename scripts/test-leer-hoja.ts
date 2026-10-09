import './_bootstrap';
async function main() {
  const { createAdminClient } = await import('../src/lib/supabase/admin');
  const { executeAgentTool } = await import('../src/lib/tools/executor');
  const sb = createAdminClient();
  const { data: agent } = await sb.from('voice_agents').select('*').eq('id', '3245bc1f-89e1-4949-bbed-71a18b05e344').single();
  const execCtx = {
    agentId: '3245bc1f-89e1-4949-bbed-71a18b05e344',
    portalEmail: 'camila@acproyectos.com',
    agentName: 'Nami',
    businessName: 'AC Proyectos',
    portalToken: (agent as any).portal_token ?? '',
    agent: agent as any,
    supabase: sb as any,
    channel: 'chat' as const,
    userContext: 'test',
  };
  // Test con STOCK rango chico
  const r1 = await executeAgentTool('inv_leer_hoja', { sheet_name: 'STOCK', range: 'A1:C5' }, execCtx);
  console.log('--- STOCK A1:C5 ---');
  console.log(JSON.stringify(r1, null, 2));
  // Test con ORDEN VARIAS trailing space
  const r2 = await executeAgentTool('inv_leer_hoja', { sheet_name: 'orden varias', range: 'A1:B3' }, execCtx);
  console.log('\n--- ORDEN VARIAS (lowercase sin trim) ---');
  console.log(JSON.stringify(r2, null, 2).slice(0, 400));
  // Test rango too large
  const r3 = await executeAgentTool('inv_leer_hoja', { sheet_name: 'STOCK', range: 'A1:Z1000' }, execCtx);
  console.log('\n--- STOCK A1:Z1000 too large ---');
  console.log(JSON.stringify(r3, null, 2).slice(0, 300));
}
main().catch(e => { console.error('ERR', e); process.exit(1); });
