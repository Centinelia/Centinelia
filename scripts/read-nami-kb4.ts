import './_bootstrap';
async function main() {
  const { createAdminClient } = await import('../src/lib/supabase/admin');
  const sb = createAdminClient();
  const { data: agents, error } = await sb.from('voice_agents').select('id, agent_name, role_knowledge_base, knowledge_base').eq('id', '3245bc1f-89e1-4949-bbed-71a18b05e344');
  if (error) console.error(error);
  console.log('found:', agents?.length ?? 0);
  if (agents && agents[0]) {
    const a = agents[0] as any;
    const kb = (a.role_knowledge_base ?? '') + '\n' + (a.knowledge_base ?? '');
    console.log('KB total:', kb.length);
    for (const kw of ['FECHA DE VENTA', 'RECIBO2', 'folio de salida', 'folio de la hoja', 'folio hoja', 'hoja de salida', 'folio\s*salida', 'inv_registrar_salida']) {
      const re = new RegExp(kw, 'i');
      const m = kb.match(re);
      if (m && m.index != null) {
        console.log(`\n[${kw} @ ${m.index}]:`);
        console.log(kb.slice(Math.max(0, m.index - 100), m.index + 500));
      }
    }
  }
}
main().catch(e => console.error(e));
