import { loadEnv } from './_env';
loadEnv();
import { createClient } from '@supabase/supabase-js';

async function main() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  const { data, error } = await supabase.rpc('exec_sql', { sql: `
    SELECT pg_get_constraintdef(c.oid) AS def
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    WHERE t.relname = 'agent_tasks' AND c.conname = 'agent_tasks_status_check';
  ` });
  if (error) {
    console.log('exec_sql not exposed; falling back to querying pg_constraint via a direct approach.');
    console.log('error:', error.message);
    // Try a distinct on the current status values instead
    const { data: statuses } = await supabase
      .from('agent_tasks')
      .select('status')
      .limit(200);
    const set = new Set((statuses ?? []).map(r => r.status));
    console.log('Distinct existing statuses:', [...set]);
    return;
  }
  console.log(data);
}
main().catch(e => { console.error(e); process.exit(1); });
