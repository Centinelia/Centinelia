import './_bootstrap';
async function main() {
  const { createAdminClient } = await import('../src/lib/supabase/admin');
  const sb = createAdminClient();
  const { data: agents } = await sb.from('voice_agents').select('id, role_knowledge_base').eq('id', '3245bc1f-89e1-4949-bbed-71a18b05e344');
  const a = (agents ?? [])[0] as any;
  const { data: org } = await sb.from('organizations').select('knowledge_base').eq('portal_email', 'camila@acproyectos.com').single();
  const kb = (a?.role_knowledge_base ?? '') + '\n' + ((org as any)?.knowledge_base ?? '');
  console.log('KB total:', kb.length);
  for (const kw of ['FECHA DE VENTA', 'RECIBO2', 'folio de salida', 'folio de la hoja', 'folio hoja', 'hoja de salida', 'inv_registrar_salida']) {
    const idx = kb.toLowerCase().indexOf(kw.toLowerCase());
    if (idx >= 0) {
      console.log(`\n[${kw} @ ${idx}]:`);
      console.log(kb.slice(Math.max(0, idx - 80), idx + 400));
    }
  }
}
main().catch(e => console.error(e));
