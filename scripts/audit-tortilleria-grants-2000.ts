import { config } from 'dotenv';
config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const PORTAL = 'servicioalcliente@tortillasestrella.com.mx';
(async () => {
  const { data: ledger } = await s.from('minutes_ledger')
    .select('amount, kind, source, created_at, description, reference_id')
    .eq('portal_email', PORTAL)
    .gt('amount', 0)
    .order('created_at', { ascending: true });
  console.log(`=== POSITIVE amounts (grants/renewals/rollovers) ${ledger?.length} rows ===`);
  for (const r of ledger ?? []) {
    console.log(`  ${r.created_at.slice(0,19)}  +${String(r.amount).padStart(5)}  kind=${r.kind}  src=${r.source || '-'}`);
    console.log(`    ref=${(r.reference_id ?? '').slice(0,60)}`);
    console.log(`    desc=${(r.description ?? '').slice(0,100)}`);
  }
  const sum = (ledger ?? []).reduce((s, r) => s + (r.amount as number), 0);
  console.log(`\nSuma positiva (otorgado): ${sum}`);
})().catch(e => { console.error(e); process.exit(1); });
