import './_bootstrap';
async function main() {
  const { createAdminClient } = await import('../src/lib/supabase/admin');
  const sb = createAdminClient();
  const { data: buckets, error } = await sb.storage.listBuckets();
  if (error) { console.error(error); process.exit(1); }
  const exists = buckets?.find(b => b.name === 'ops-attachments');
  if (exists) {
    console.log('✓ Bucket ops-attachments existe', JSON.stringify(exists));
    return;
  }
  console.log('Creando bucket ops-attachments...');
  const { data, error: cErr } = await sb.storage.createBucket('ops-attachments', { public: false });
  if (cErr) { console.error(cErr); process.exit(1); }
  console.log('✓ Creado:', JSON.stringify(data));
}
main().catch(e => { console.error(e); process.exit(1); });
