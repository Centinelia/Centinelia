import './_bootstrap';
async function main() {
  const { createAdminClient } = await import('../src/lib/supabase/admin');
  const sb = createAdminClient();
  const { data } = await sb.from('inventory_mutations_log')
    .select('created_at, tool_name, serie, patched_columns, success, metadata')
    .eq('tool_name', 'inv_registrar_salida')
    .order('created_at', { ascending: false })
    .limit(10);
  console.log('ÚLTIMAS 10 MUTACIONES inv_registrar_salida:');
  for (const m of (data ?? []) as any[]) {
    console.log(`  [${m.created_at}] serie=${m.serie} ok=${m.success} patched=${JSON.stringify(m.patched_columns)} meta=${JSON.stringify(m.metadata)}`);
  }
}
main().catch(e => { console.error(e); process.exit(1); });
