import './_bootstrap';
async function main() {
  const { createAdminClient } = await import('../src/lib/supabase/admin');
  const { resolveInventoryContext, GraphExcel } = await import('../src/lib/inventory/adapter');
  const sb = createAdminClient();
  const ctx = await resolveInventoryContext('camila@acproyectos.com', sb as any, '3245bc1f-89e1-4949-bbed-71a18b05e344');
  if ('error' in ctx) return;
  const inv = ctx as any;
  const headers = await GraphExcel.getTableHeader(inv.token, inv.config.location, inv.config.sheets.historico.table);
  const recibo2Idx = headers.indexOf('RECIBO2');
  const fechaVentaIdx = headers.findIndex(h => /^FECHA DE VENTA/i.test(h));
  const toLetter = (i: number) => { let s=''; let n=i; while(n>=0){s=String.fromCharCode(65+(n%26))+s; n=Math.floor(n/26)-1;} return s; };
  await GraphExcel.withSession(inv.token, inv.config.location, async session => {
    const sheet = inv.config.sheets.historico.name;
    for (const abs of [5313, 5314]) {  // dataStartRow=3, rows 5310+3=5313 & 5311+3=5314
      await GraphExcel.patchCell(inv.token, session, sheet, `${toLetter(recibo2Idx)}${abs}`, '3949');
      await GraphExcel.patchCell(inv.token, session, sheet, `${toLetter(fechaVentaIdx)}${abs}`, '');
      console.log(`row ${abs}: RECIBO2=3949, FECHA DE VENTA=cleared`);
    }
  });
  console.log('DONE');
}
main().catch(e => { console.error(e); process.exit(1); });
