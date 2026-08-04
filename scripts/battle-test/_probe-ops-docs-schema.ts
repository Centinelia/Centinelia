import { loadEnv } from './_env';
loadEnv();
import { createClient } from '@supabase/supabase-js';

async function main() {
  const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const { data } = await s.from('ops_documents').select('*').limit(1);
  const cols = data?.[0] ? Object.keys(data[0]) : [];
  console.log(`ops_documents cols (${cols.length}):`);
  console.log(cols.join(', ') || '(tabla vacía, no puedo inferir)');

  // Fallback: try minimal insert to see what's required
  if (!cols.length) {
    console.log('\nProbing con insert mínimo…');
    for (const col of ['client_name', 'total_amount', 'expiry_date', 'template_type', 'kind', 'size_bytes']) {
      const { error } = await s.from('ops_documents').insert({ agent_id: 'c45e6e48-1ca5-4d0a-bbd3-2a62b7dbdad2', portal_email: 'x', title: 'x', filename: 'x', storage_path: 'x', [col]: col === 'total_amount' ? 1 : col === 'size_bytes' ? 1 : 'x' });
      console.log(`  ${col}:`, error ? `❌ ${error.message}` : 'OK');
      await s.from('ops_documents').delete().eq('portal_email', 'x');
    }
  }
}
main().catch(err => { console.error(err); process.exit(1); });
