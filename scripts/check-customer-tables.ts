import { createClient } from '@supabase/supabase-js';

async function main() {
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const portalEmail = 'santiago-dev@centinelia.mx';
  const phoneNorm   = '8112803360';

  const { data: c, error: cErr } = await sb.from('customers')
    .select('*').eq('portal_email', portalEmail).eq('phone_normalized', phoneNorm);
  console.log('customers rows:', c?.length ?? 0, ' error:', cErr?.message ?? 'none');
  console.log(c);

  if (c && c.length > 0) {
    const cid = c[0].id;
    const { data: ints } = await sb.from('customer_interactions')
      .select('*').eq('customer_id', cid).order('created_at', { ascending: false });
    console.log('customer_interactions rows:', ints?.length ?? 0);
    console.log(ints);
  }

  console.log('\n--- all customers for this portal (any phone) ---');
  const { data: all } = await sb.from('customers')
    .select('id, name, phone_normalized, created_at')
    .eq('portal_email', portalEmail)
    .order('created_at', { ascending: false })
    .limit(10);
  console.log(all);
}
main().catch(e => { console.error(e); process.exit(1); });
