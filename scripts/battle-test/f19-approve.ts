/**
 * F19 continuation: take the awaiting_plan_approval row we just created and
 * hit /api/portal/agent-tasks/[id]/approve-plan?token=... to simulate the
 * owner clicking the magic link. Then verify the row transitions to 'pending'.
 * Also lets us test the /reject=1 path against a second row.
 */
import { loadEnv } from './_env';
loadEnv();

import { createClient } from '@supabase/supabase-js';

const APP = process.env.BATTLE_TEST_URL ?? 'http://localhost:3000';

async function main() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  const { data: pending } = await supabase
    .from('agent_tasks')
    .select('id, title, plan_approval_token')
    .eq('portal_email', 'studio@pneumastudio.mx')
    .eq('status', 'awaiting_plan_approval')
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (!pending) {
    console.log('No awaiting_plan_approval rows. Run f19-plan-gate.ts first.');
    return;
  }

  console.log(`Approving task ${pending.id} — "${pending.title.slice(0, 60)}"`);
  const url = `${APP}/api/portal/agent-tasks/${pending.id}/approve-plan?token=${pending.plan_approval_token}`;
  const res = await fetch(url, { redirect: 'manual' });
  const body = await res.text();
  console.log(`HTTP ${res.status} — body head:\n${body.slice(0, 400)}`);

  await new Promise(r => setTimeout(r, 1000));
  const { data: after } = await supabase
    .from('agent_tasks')
    .select('id, status, plan_approved_at, plan_approval_token')
    .eq('id', pending.id)
    .single();
  console.log('\nRow after approval:');
  console.log(after);

  // Bonus: also probe the invalid-token path
  const bad = await fetch(`${APP}/api/portal/agent-tasks/${pending.id}/approve-plan?token=WRONG`);
  console.log(`\nBad token → HTTP ${bad.status}`);
}
main().catch(err => { console.error('FAIL:', err); process.exit(1); });
