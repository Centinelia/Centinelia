/**
 * Try to insert a minimal row into agent_tasks with the plan-gate columns and
 * report the exact PostgREST error so we know whether the migration is really
 * applied.
 */
import { loadEnv } from './_env';
loadEnv();

import { createClient } from '@supabase/supabase-js';

async function main() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  const probe = {
    portal_email:        'studio@pneumastudio.mx',
    assigned_to:         '3b3dbeb4-8235-4b98-913a-0208e585d2e3',
    created_by:          '9a0c935a-2b47-432a-a2c3-c67bbf915905',
    title:               'PROBE — delete me',
    status:              'awaiting_plan_approval',
    trigger_type:        'delegation',
    max_iterations:      3,
    plan:                { goal: 'probe', steps: [], summary: 'probe', success_metric: 'x', assets: [], risks: [] },
    plan_approval_token: 'probe-token-abc-123',
  };

  const { data, error } = await supabase.from('agent_tasks').insert(probe).select('id, status, plan, plan_approval_token').single();
  if (error) {
    console.log('❌ INSERT FAILED');
    console.log('  code:',    error.code);
    console.log('  message:', error.message);
    console.log('  details:', error.details);
    console.log('  hint:',    error.hint);
    return;
  }
  console.log('✅ INSERT OK:', data);

  // Cleanup
  await supabase.from('agent_tasks').delete().eq('id', data.id);
  console.log('Probe row deleted.');

  // Bonus: auto_approve column on organizations
  const { data: org, error: orgErr } = await supabase
    .from('organizations')
    .select('auto_approve_task_plans')
    .eq('portal_email', 'studio@pneumastudio.mx')
    .single();
  if (orgErr) console.log('org auto_approve read err:', orgErr.message);
  else console.log('auto_approve_task_plans =', org?.auto_approve_task_plans);
}

main().catch(err => { console.error(err); process.exit(1); });
