export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifyCronAuth } from '@/lib/auth/cron-auth';

// Purges all client data for accounts cancelled 30+ days ago.
// Deletes: voice_calls, leads_voice, agent_learnings, agent_messages, then the agent record.
export async function GET(req: NextRequest) {
  if (!verifyCronAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createAdminClient();
  const cutoff   = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const { data: agents, error: fetchErr } = await supabase
    .from('voice_agents')
    .select('id')
    .eq('billing_status', 'cancelado')
    .lt('cancelled_at', cutoff);

  if (fetchErr) {
    console.error('cleanup-cancelled: fetch error', fetchErr);
    return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  }

  if (!agents || agents.length === 0) {
    return NextResponse.json({ ok: true, purged: 0 });
  }

  const ids = agents.map(a => a.id);

  const tables = ['voice_calls', 'leads_voice', 'agent_learnings', 'agent_messages'] as const;
  for (const table of tables) {
    const { error } = await supabase.from(table).delete().in('agent_id', ids);
    if (error) console.error(`cleanup-cancelled: error deleting ${table}`, error);
  }

  const { error: deleteErr } = await supabase
    .from('voice_agents')
    .delete()
    .in('id', ids);

  if (deleteErr) {
    console.error('cleanup-cancelled: error deleting voice_agents', deleteErr);
    return NextResponse.json({ error: deleteErr.message }, { status: 500 });
  }

  console.log(`cleanup-cancelled: purged ${ids.length} cancelled accounts`);
  return NextResponse.json({ ok: true, purged: ids.length });
}
