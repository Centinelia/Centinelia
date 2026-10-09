import './_bootstrap';
async function main() {
  const { createAdminClient } = await import('../src/lib/supabase/admin');
  const sb = createAdminClient();
  const { data: inbox } = await sb.from('ops_inbox')
    .select('id, created_at, email_subject, status, category, auto_mode_reason, auto_mode_signals, tools_invoked, sent_at')
    .eq('agent_id', '3245bc1f-89e1-4949-bbed-71a18b05e344')
    .gte('created_at', '2026-10-08T20:50:00')
    .order('created_at', { ascending: false });
  for (const r of (inbox ?? []) as any[]) {
    console.log(`[${r.created_at}] ${r.email_subject}`);
    console.log(`  status=${r.status} sent_at=${r.sent_at}`);
    console.log(`  reason=${r.auto_mode_reason}`);
    console.log(`  tools=${JSON.stringify(r.tools_invoked)}`);
  }
  // Verify Excel
  const { resolveInventoryContext, GraphExcel } = await import('../src/lib/inventory/adapter');
  const ctx = await resolveInventoryContext('camila@acproyectos.com', sb as any, '3245bc1f-89e1-4949-bbed-71a18b05e344');
  if ('error' in ctx) return;
  const inv = ctx as any;
  const headers = await GraphExcel.getTableHeader(inv.token, inv.config.location, inv.config.sheets.historico.table);
  const rows = await GraphExcel.listTableRows(inv.token, inv.config.location, inv.config.sheets.historico.table);
  const oc = rows.filter((r: any) => String((r.values as unknown[])[0] ?? '').trim().toUpperCase() === 'OC06203');
  const cols = ['MODELO','SERIE','ESTATUS','FOLIO','CLIENTE','SALIDA','FECHA DE VENTA ','FACTURA'];
  const idx = cols.map(c => headers.indexOf(c));
  console.log(`\n=== Excel OC06203 (${oc.length} filas) ===`);
  for (const r of oc) {
    const v = r.values as unknown[];
    const o: any = {}; cols.forEach((c, i) => { o[c] = v[idx[i]]; });
    console.log(JSON.stringify(o));
  }
}
main().catch(e => { console.error(e); process.exit(1); });
