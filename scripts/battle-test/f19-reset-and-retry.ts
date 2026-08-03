/**
 * Rolls the failed campaign task back to 'pending' so the (now fixed) cron
 * process-tasks route can pick it up on the next tick. Then triggers the cron.
 */
import { loadEnv } from './_env';
loadEnv();
import { createClient } from '@supabase/supabase-js';

async function main() {
  const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const { data: t } = await s
    .from('agent_tasks')
    .select('id, status, title')
    .eq('portal_email', 'studio@pneumastudio.mx')
    .eq('status', 'failed')
    .order('updated_at', { ascending: false })
    .limit(1)
    .single();
  if (!t) { console.log('No failed tasks to reset.'); return; }

  const { error } = await s
    .from('agent_tasks')
    .update({ status: 'pending', started_at: null, result: null })
    .eq('id', t.id);
  if (error) { console.error(error); return; }
  console.log(`Reset ${t.id} to pending.`);

  const secret = process.env.CRON_SECRET!;
  const app    = process.env.BATTLE_TEST_URL ?? 'http://localhost:3000';
  console.log('Triggering cron…');
  const res = await fetch(`${app}/api/cron/process-tasks`, {
    headers: { Authorization: `Bearer ${secret}` },
  });
  console.log('cron:', res.status, await res.text());

  await new Promise(r => setTimeout(r, 2000));
  const { data: after } = await s
    .from('agent_tasks')
    .select('id, status, result, started_at, completed_at')
    .eq('id', t.id)
    .single();
  console.log('\nAfter cron:', after);
}
main().catch(err => { console.error(err); process.exit(1); });
