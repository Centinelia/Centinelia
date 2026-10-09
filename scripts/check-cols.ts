import './_bootstrap';
async function main() {
  const { createAdminClient } = await import('../src/lib/supabase/admin');
  const sb = createAdminClient();
  const { data } = await sb.from('organizations')
    .select('inventory_excel_config, name')
    .ilike('name', '%AC Proyectos%');
  for (const r of (data ?? []) as any[]) {
    console.log(`org: ${r.name}`);
    const cfg = r.inventory_excel_config;
    if (!cfg) { console.log('  no config'); continue; }
    const cols = cfg.columns_historico;
    console.log(`  fecha_venta:   ${JSON.stringify(cols?.fecha_venta)}`);
    console.log(`  mes_venta:     ${JSON.stringify(cols?.mes_venta)}`);
    console.log(`  ano_venta:     ${JSON.stringify(cols?.ano_venta)}`);
    console.log(`  factor:        ${JSON.stringify(cols?.factor)}`);
    console.log(`  factura_venta: ${JSON.stringify(cols?.factura_venta)}`);
    console.log(`  costo_venta_mx:${JSON.stringify(cols?.costo_venta_mx)}`);
  }
}
main().catch(e => { console.error(e); process.exit(1); });
