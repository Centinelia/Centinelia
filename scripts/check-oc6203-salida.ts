import './_bootstrap';
async function main() {
  const { createAdminClient } = await import('../src/lib/supabase/admin');
  const sb = createAdminClient();
  const { resolveInventoryContext, GraphExcel } = await import('../src/lib/inventory/adapter');
  const ctx = await resolveInventoryContext('camila@acproyectos.com', sb as any, '3245bc1f-89e1-4949-bbed-71a18b05e344');
  if ('error' in ctx) return;
  const inv = ctx as any;
  const headers = await GraphExcel.getTableHeader(inv.token, inv.config.location, inv.config.sheets.historico.table);
  const rows = await GraphExcel.listTableRows(inv.token, inv.config.location, inv.config.sheets.historico.table);
  const oc = rows.filter((r: any) => String((r.values as unknown[])[0] ?? '').trim().toUpperCase() === 'OC06203');
  const cols = ['MODELO','SERIE','ESTATUS','FOLIO','CLIENTE','RECIBO2','SALIDA','FECHA DE VENTA ','FACTURA'];
  const idx = cols.map(c => headers.indexOf(c));
  console.log(`OC06203: ${oc.length} filas`);
  for (const r of oc) {
    const v = r.values as unknown[];
    const out: Record<string, unknown> = {};
    cols.forEach((c, i) => { out[c] = v[idx[i]]; });
    console.log(JSON.stringify(out));
  }

  // Why pending? Check if there's any send attempt log
  const { data: inbox } = await sb.from('ops_inbox')
    .select('status,sent_at,action,auto_mode_reason,is_approved,approval_token,approved_at,needs_info')
    .eq('id', '84b2d1b7-f3b2-4e56-967f-35d33d61e323').single();
  const i = inbox as any;
  console.log('\nStatus details:', JSON.stringify(i, null, 2));
}
main().catch(e => { console.error(e); process.exit(1); });
