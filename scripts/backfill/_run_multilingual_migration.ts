/**
 * Corre migration 20260804_org_multilingual.sql via Supabase JS.
 * Idempotente (add column if not exists + update).
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const supa = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  db: { schema: 'public' },
});

async function main() {
  const sql = readFileSync(resolve('migrations/20260804_org_multilingual.sql'), 'utf8');
  console.log('=== SQL to run ===');
  console.log(sql);
  console.log('=== Executing via exec_sql RPC ===');
  const { error } = await (supa as unknown as { rpc: (fn: string, args: Record<string, unknown>) => Promise<{ error: Error | null }> })
    .rpc('exec_sql', { sql });
  if (error) {
    console.error('RPC failed:', error);
    console.log('\nCorrela manualmente en Supabase SQL editor:');
    console.log('https://supabase.com/dashboard/project/_/sql/new');
    process.exit(1);
  }
  console.log('✅ Migration applied');
  const { data, count } = await supa.from('organizations').select('portal_email, multilingual', { count: 'exact' });
  console.log(`\n${count} orgs. Distribución:`);
  const multi = (data ?? []).filter(o => o.multilingual).length;
  console.log(`  multilingual=true:  ${multi}`);
  console.log(`  multilingual=false: ${(count ?? 0) - multi}`);
}
main().catch(console.error);
