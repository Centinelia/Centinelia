import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);
const PORTAL_EMAIL = 'camila@acproyectos.com';

async function main() {
  // ops_inbox doesn't have portal_email, needs agent_id lookup first
  const { data: agents } = await sb
    .from('voice_agents')
    .select('id, agent_name')
    .eq('portal_email', PORTAL_EMAIL);
  const agentIds = (agents ?? []).map((a: any) => a.id);
  console.log('Agent IDs:', agents);

  const { data: rows, error } = await sb
    .from('ops_inbox')
    .select('*')
    .in('agent_id', agentIds)
    .gte('created_at', '2026-10-06T00:00:00Z')
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) {
    console.error('ERROR:', error);
    process.exit(1);
  }
  console.log(`ops_inbox rows last 24-48h: ${rows?.length ?? 0}`);
  if (rows && rows[0]) {
    console.log('Columns:', Object.keys(rows[0]).join(', '));
  }
  for (const r of rows ?? []) {
    const row = r as any;
    console.log('---');
    console.log(`  created_at: ${row.created_at}`);
    console.log(`  from:       ${row.email_from ?? '?'}`);
    console.log(`  subject:    ${(row.email_subject ?? '').slice(0, 100)}`);
    console.log(`  message_id: ${(row.raw_message_id ?? '').slice(0, 60)}...`);
    console.log(`  sent_at:    ${row.sent_at ?? '(no reply sent)'}`);
    console.log(`  auto_mode:  ${row.auto_mode ?? '?'}`);
    console.log(`  status:     ${row.status ?? '?'}`);
  }

  // Aggregate by sender
  console.log('\n--- SENDERS AGGREGATE (24h) ---');
  const senders: Record<string, number> = {};
  for (const r of rows ?? []) {
    const row = r as any;
    const s = row.email_from ?? 'unknown';
    senders[s] = (senders[s] ?? 0) + 1;
  }
  for (const [s, n] of Object.entries(senders).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${s.padEnd(50)}  ${n}`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
