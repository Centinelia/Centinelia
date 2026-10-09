import './_bootstrap';
async function main() {
  const { createAdminClient } = await import('../src/lib/supabase/admin');
  const sb = createAdminClient();
  // Lista inbox items del día relacionados a OC6203 que sean de hola@centinelia.mx (tests de Nazre)
  const { data: items } = await sb.from('ops_inbox')
    .select('id, created_at, email_subject, email_from, status')
    .eq('agent_id', '3245bc1f-89e1-4949-bbed-71a18b05e344')
    .gte('created_at', '2026-10-08T00:00:00')
    .or('email_subject.ilike.%OC6203%,email_subject.ilike.%OC 6203%,email_subject.ilike.%Hoja de Salida%,email_subject.ilike.%Factura de Cliente OC%')
    .order('created_at', { ascending: false });
  console.log(`A borrar: ${(items ?? []).length}`);
  for (const r of (items ?? []) as any[]) {
    console.log(`  [${r.created_at}] ${r.email_subject} (${r.status})`);
  }
  const ids = (items ?? []).map((r: any) => r.id);
  if (ids.length > 0) {
    const { error } = await sb.from('ops_inbox').delete().in('id', ids);
    if (error) console.log('ERR delete:', error);
    else console.log(`\nDeleted ${ids.length} rows`);
  }
}
main().catch(e => { console.error(e); process.exit(1); });
