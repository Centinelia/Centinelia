import './_bootstrap';
async function main() {
  const { createAdminClient } = await import('../src/lib/supabase/admin');
  const sb = createAdminClient();
  const { data: org } = await sb.from('organizations').select('inventory_excel_config').eq('portal_email', 'camila@acproyectos.com').single();
  const cfg = (org as any).inventory_excel_config as any;
  console.log('columns_historico:', JSON.stringify(cfg.columns_historico, null, 2));
}
main().catch(e => console.error(e));
