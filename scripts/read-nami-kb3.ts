import './_bootstrap';
async function main() {
  const { createAdminClient } = await import('../src/lib/supabase/admin');
  const sb = createAdminClient();
  const { data: agents } = await sb.from('voice_agents').select('role_knowledge_base, knowledge_base').eq('portal_email', 'camila@acproyectos.com').eq('agent_name', 'Nami').limit(1);
  const a = (agents ?? [])[0] as any;
  if (!a) { console.log('NO AGENT'); return; }
  const all = (a.role_knowledge_base ?? '') + '\n' + (a.knowledge_base ?? '');
  console.log('total KB len:', all.length);
  for (const kw of ['FECHA DE VENTA', 'RECIBO2', 'FOLIO SALIDA', 'folio de salida', 'folio de la hoja', 'folio hoja', 'hoja de salida']) {
    const idx = all.toLowerCase().indexOf(kw.toLowerCase());
    if (idx >= 0) {
      console.log(`\n[match "${kw}" @ ${idx}]:`);
      console.log(all.slice(Math.max(0, idx - 100), idx + 500));
    }
  }
}
main().catch(e => console.error(e));
