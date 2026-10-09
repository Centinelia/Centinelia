import './_bootstrap';
async function main() {
  const { createAdminClient } = await import('../src/lib/supabase/admin');
  const sb = createAdminClient();
  const { data: agent } = await sb.from('voice_agents').select('role_knowledge_base').eq('id', '3245bc1f-89e1-4949-bbed-71a18b05e344').single();
  const kb = (agent as any).role_knowledge_base ?? '';
  // Busco secciones relevantes a hoja de salida / folio / fecha venta
  const lines = kb.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i].toLowerCase();
    if (/hoja|salida|folio|fecha de venta|recibo2|cuando camila|cuando sale/i.test(l)) {
      // Imprime contexto 2 líneas antes y 3 después
      const ctx = lines.slice(Math.max(0, i - 1), Math.min(lines.length, i + 4)).join('\n');
      console.log(`─── línea ${i} ───`);
      console.log(ctx);
      console.log();
    }
  }
}
main().catch(e => console.error(e));
