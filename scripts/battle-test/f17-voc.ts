/**
 * F17 battle test: send a chat message to Nox asking for extraer_voz_del_cliente
 * and check whether it (a) invoked the tool, (b) wrote a row to voc_insights.
 */
import { loadEnv } from './_env';
loadEnv();

import { battleChat } from './battle-chat';
import { createClient } from '@supabase/supabase-js';

const NOX_ID = 'c45e6e48-1ca5-4d0a-bbd3-2a62b7dbdad2';

async function main() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  const before = await supabase
    .from('voc_insights')
    .select('id, created_at')
    .eq('portal_email', 'studio@pneumastudio.mx')
    .order('created_at', { ascending: false })
    .limit(1);

  console.log('--- BEFORE: last voc_insights row ---');
  console.log(before.data?.[0] ?? '(none)');
  console.log('\n--- SENDING CHAT TO NOX ---\n');

  const t = await battleChat({
    agentId: NOX_ID,
    message: 'Corre la herramienta extraer_voz_del_cliente con fuente=all, dias=180, min_muestras=5. Devuélveme lo que salga aunque sean pocos datos.',
  });

  console.log('\n\n--- SUMMARY ---');
  console.log('text length:', t.text.length);

  // Wait a moment for the fire-and-forget run log
  await new Promise(r => setTimeout(r, 3000));

  const { data: run } = await supabase
    .from('agent_runs')
    .select('started_at, tools_called, llm_calls, duration_ms')
    .eq('agent_id', NOX_ID)
    .order('started_at', { ascending: false })
    .limit(1)
    .single();

  console.log('\n--- LAST agent_runs row for Nox ---');
  console.log(run);

  const after = await supabase
    .from('voc_insights')
    .select('id, source, window_days, sample_count, created_at, summary, phrases, objections')
    .eq('portal_email', 'studio@pneumastudio.mx')
    .order('created_at', { ascending: false })
    .limit(1);

  console.log('\n--- AFTER: last voc_insights row ---');
  const row = after.data?.[0];
  if (!row) {
    console.log('(none) — tool NOT run, or muestras insuficientes and Nox chose not to persist.');
  } else if (before.data?.[0]?.id === row.id) {
    console.log('SAME as before — no new row written.', row);
  } else {
    console.log('NEW ROW:', {
      id:             row.id,
      source:         row.source,
      window_days:    row.window_days,
      sample_count:   row.sample_count,
      created_at:     row.created_at,
      summary_head:   String(row.summary).slice(0, 200),
      phrases_count:  Array.isArray(row.phrases) ? row.phrases.length : 0,
      objections_count: Array.isArray(row.objections) ? row.objections.length : 0,
    });
  }
}

main().catch(err => { console.error('FAIL:', err); process.exit(1); });
