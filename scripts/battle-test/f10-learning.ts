/**
 * F10 battle test: opt Sofia into weekly_insights, trigger the cron, verify
 * agent_recommendations rows land + last_ran_at gets stamped. Then restore
 * prior opt-in state.
 */
import { loadEnv } from './_env';
loadEnv();
import { createClient } from '@supabase/supabase-js';

const APP = process.env.BATTLE_TEST_URL ?? 'http://localhost:3000';
const SOFIA_ID = '9a0c935a-2b47-432a-a2c3-c67bbf915905';

async function main() {
  const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  const { data: before } = await s.from('voice_agents').select('features').eq('id', SOFIA_ID).single();
  const feats = (before?.features ?? {}) as Record<string, any>;
  const prevInsights = feats.automations?.weekly_insights;

  // Turn on
  await s.from('voice_agents').update({
    features: { ...feats, automations: { ...(feats.automations ?? {}), weekly_insights: { ...(prevInsights ?? {}), enabled: true } } },
  }).eq('id', SOFIA_ID);
  console.log('weekly_insights enabled for Sofia.');

  // Trigger cron
  const secret = process.env.CRON_SECRET!;
  console.log('Triggering /api/cron/weekly-insights…');
  const res = await fetch(`${APP}/api/cron/weekly-insights`, { headers: { Authorization: `Bearer ${secret}` } });
  console.log('Cron:', res.status, await res.text());

  await new Promise(r => setTimeout(r, 2000));

  // Verify recs
  const { data: recs } = await s
    .from('agent_recommendations')
    .select('title, body, priority, week_start, mode')
    .eq('agent_id', SOFIA_ID)
    .order('created_at', { ascending: false })
    .limit(5);
  console.log('\nagent_recommendations rows:');
  for (const r of recs ?? []) {
    console.log(`  [${r.priority}] ${r.title}`);
    console.log(`    ${String(r.body).slice(0, 120)}…`);
  }

  // Check last_ran_at
  const { data: after } = await s.from('voice_agents').select('features').eq('id', SOFIA_ID).single();
  const lastRan = (after?.features as any)?.automations?.weekly_insights?.last_ran_at;
  console.log(`\nlast_ran_at: ${lastRan ?? '(missing)'}`);

  // Restore (leave enabled=false if it was disabled before)
  await s.from('voice_agents').update({
    features: { ...(after?.features as any), automations: { ...((after?.features as any).automations ?? {}), weekly_insights: prevInsights ?? { enabled: false } } },
  }).eq('id', SOFIA_ID);
  console.log('Restored prior weekly_insights state.');
}
main().catch(err => { console.error(err); process.exit(1); });
