import './_bootstrap';
async function main() {
  const { createAdminClient } = await import('../src/lib/supabase/admin');
  const sb = createAdminClient();
  const { data: agent } = await sb.from('voice_agents').select('role_knowledge_base, knowledge_base').eq('id', '3245bc1f-89e1-4949-bbed-71a18b05e344').single();
  const a = agent as any;
  console.log('role_knowledge_base len:', (a.role_knowledge_base ?? '').length);
  console.log('knowledge_base len:', (a.knowledge_base ?? '').length);
  const all = (a.role_knowledge_base ?? '') + '\n' + (a.knowledge_base ?? '');
  // Buscar menciones de FECHA DE VENTA, FOLIO, RECIBO
  for (const kw of ['FECHA DE VENTA', 'RECIBO2', 'FOLIO SALIDA', 'folio de salida', 'folio de la hoja', 'folio hoja', 'hoja de salida', 'FOLIO ']) {
    const idx = all.toLowerCase().indexOf(kw.toLowerCase());
    if (idx >= 0) {
      console.log(`\n[match "${kw}" @ ${idx}]:`);
      console.log(all.slice(Math.max(0, idx - 100), idx + 400));
    }
  }
}
main().catch(e => console.error(e));
