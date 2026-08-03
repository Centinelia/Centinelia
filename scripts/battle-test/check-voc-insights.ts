import { loadEnv } from './_env';
loadEnv();
import { createClient } from '@supabase/supabase-js';

async function main() {
  const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  // Direct insert probe first — does the table shape match?
  for (const src of ['all', 'calls', 'emails', 'tickets', 'call', 'email']) {
    const { error: e } = await s.from('voc_insights').insert({
      portal_email: 'studio@pneumastudio.mx', source: src, window_days: 30, sample_count: 1, summary: 'probe',
    });
    console.log(`source="${src}" →`, e ? `ERR ${e.code}: ${e.message}` : 'OK (rolling back)');
    if (!e) {
      await s.from('voc_insights').delete().eq('summary', 'probe').eq('source', src);
    }
  }
  const { data: probe, error: probeErr } = await s
    .from('voc_insights')
    .insert({
      portal_email: 'studio@pneumastudio.mx',
      source:       'all',
      window_days:  180,
      sample_count: 3,
      phrases:      ['x'],
      objections:   [],
      retention_reasons: [],
      churn_reasons: [],
      headline_candidates: [],
      summary:      'probe row — delete me',
    })
    .select('id')
    .single();
  if (probeErr) console.log('❌ probe insert err:', probeErr);
  else {
    console.log('✅ probe insert ok, id:', probe?.id);
    await s.from('voc_insights').delete().eq('id', probe!.id);
  }

  // List everything
  const { data: all } = await s.from('voc_insights').select('id, portal_email, source, sample_count, created_at').order('created_at', { ascending: false }).limit(10);
  console.log('\nAll voc_insights rows:');
  console.log(all);
}
main().catch(err => { console.error(err); process.exit(1); });
