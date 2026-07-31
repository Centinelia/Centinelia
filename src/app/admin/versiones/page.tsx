export const dynamic = 'force-dynamic';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import { MEERKAT_CONFIGS } from '@/lib/vapi/meerkat-configs';
import { VersionesTable } from '@/components/admin/VersionesTable';

async function isAdmin(): Promise<boolean> {
  const store = await cookies();
  return store.get('Centinelia_admin')?.value === process.env.ADMIN_SECRET;
}

export default async function VersionesPage() {
  if (!(await isAdmin())) redirect('/admin/login');

  const supabase = createAdminClient();

  const { data: activeRows } = await supabase
    .from('meerkat_active_versions')
    .select('meerkat_id, active_version, activated_at, activated_by, notes')
    .order('meerkat_id');

  const { data: agents } = await supabase
    .from('voice_agents')
    .select('features')
    .eq('active', true);

  const agentCounts = new Map<string, number>();
  const pinnedCounts = new Map<string, number>();
  for (const a of agents ?? []) {
    const mId = (a.features as any)?.meerkat_role_id;
    if (!mId) continue;
    agentCounts.set(mId, (agentCounts.get(mId) ?? 0) + 1);
    if ((a.features as any)?.pinned_meerkat_version != null) {
      pinnedCounts.set(mId, (pinnedCounts.get(mId) ?? 0) + 1);
    }
  }

  const rows = (activeRows ?? []).map(r => ({
    meerkat_id: r.meerkat_id,
    active_version: r.active_version,
    activated_at: r.activated_at,
    activated_by: r.activated_by,
    notes: r.notes,
    available_versions: Object.keys(MEERKAT_CONFIGS[r.meerkat_id] ?? {}).map(Number).sort((a, b) => a - b),
    agent_count: agentCounts.get(r.meerkat_id) ?? 0,
    pinned_count: pinnedCounts.get(r.meerkat_id) ?? 0,
  }));

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold" style={{ color: 'var(--c-text)' }}>Versiones de meerkats</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--c-text-2)' }}>
          Cada meerkat corre en la versión activa listada. Rollback = activar versión anterior. Cambios propagan en ≤60s + resync a Vapi.
        </p>
      </div>
      <VersionesTable rows={rows} />
    </div>
  );
}
