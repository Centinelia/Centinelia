import { NextResponse } from 'next/server';
import { isAdmin } from '@/lib/admin/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { MEERKAT_CONFIGS } from '@/lib/vapi/meerkat-configs';


export async function GET() {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = createAdminClient();

  const { data: activeRows, error: activeErr } = await supabase
    .from('meerkat_active_versions')
    .select('meerkat_id, active_version, activated_at, activated_by, notes');

  if (activeErr) return NextResponse.json({ error: activeErr.message }, { status: 500 });

  // Counts de agentes por meerkat + pinned counts
  const { data: agents, error: agentsErr } = await supabase
    .from('voice_agents')
    .select('features')
    .eq('active', true);

  if (agentsErr) return NextResponse.json({ error: agentsErr.message }, { status: 500 });

  const agentCountByMeerkat = new Map<string, number>();
  const pinnedCountByMeerkat = new Map<string, number>();
  for (const a of agents ?? []) {
    const mId = (a.features as Record<string, unknown>)?.meerkat_role_id as string | undefined;
    if (!mId) continue;
    agentCountByMeerkat.set(mId, (agentCountByMeerkat.get(mId) ?? 0) + 1);
    if ((a.features as Record<string, unknown>)?.pinned_meerkat_version != null) {
      pinnedCountByMeerkat.set(mId, (pinnedCountByMeerkat.get(mId) ?? 0) + 1);
    }
  }

  const meerkats = (activeRows ?? []).map(row => ({
    meerkat_id: row.meerkat_id,
    active_version: row.active_version,
    activated_at: row.activated_at,
    activated_by: row.activated_by,
    notes: row.notes,
    available_versions: Object.keys(MEERKAT_CONFIGS[row.meerkat_id] ?? {}).map(Number).sort((a, b) => a - b),
    agent_count: agentCountByMeerkat.get(row.meerkat_id) ?? 0,
    pinned_count: pinnedCountByMeerkat.get(row.meerkat_id) ?? 0,
  }));

  return NextResponse.json({ meerkats });
}
