export const dynamic = 'force-dynamic';

import { redirect } from 'next/navigation';
import { isAdmin } from '@/lib/admin/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { MEERKAT_CONFIGS } from '@/lib/vapi/meerkat-configs';
import { VersionesTable } from '@/components/admin/VersionesTable';


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

  // Pilar 3: flags meerkat.<id>.v<n> son la source of truth per-org.
  // meerkat_active_versions solo se usa como fallback legacy cuando ningún flag matchea.
  const { data: meerkatFlags } = await supabase
    .from('feature_flags')
    .select('flag_key, rollout_pct, killed')
    .like('flag_key', 'meerkat.%');

  const rolloutsByMeerkat = new Map<string, { version: number; pct: number; killed: boolean }[]>();
  for (const f of meerkatFlags ?? []) {
    const m = /^meerkat\.([^.]+)\.v(\d+)$/.exec(f.flag_key as string);
    if (!m) continue;
    const [, mId, vStr] = m;
    const arr = rolloutsByMeerkat.get(mId) ?? [];
    arr.push({ version: Number(vStr), pct: f.rollout_pct as number, killed: f.killed as boolean });
    rolloutsByMeerkat.set(mId, arr);
  }
  for (const [mId, arr] of rolloutsByMeerkat) {
    arr.sort((a, b) => b.version - a.version);
    rolloutsByMeerkat.set(mId, arr);
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
    rollouts: rolloutsByMeerkat.get(r.meerkat_id) ?? [],
  }));

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-[24px] font-semibold tracking-tight" style={{ color: '#111827' }}>
          Versiones de meerkats
        </h1>
        <p className="text-[13px] mt-1.5" style={{ color: '#6B7280' }}>
          El rollout real por organización se controla con flags (ver{' '}
          <a href="/admin/flags" className="font-medium" style={{ color: '#6C3BFF' }}>
            Feature flags
          </a>
          ). La columna &ldquo;Rollout activo&rdquo; muestra los flags meerkat.&lt;id&gt;.v&lt;n&gt; existentes; la columna &ldquo;Fallback&rdquo; muestra la versión legacy que reciben los agentes sin flag aplicable.
        </p>
      </div>
      <VersionesTable rows={rows} />
    </div>
  );
}
