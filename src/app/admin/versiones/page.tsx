export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { isAdmin } from '@/lib/admin/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { MEERKAT_CONFIGS } from '@/lib/vapi/meerkat-configs';
import { VersionesTable } from '@/components/admin/VersionesTable';
import { GoldenTestsHealthTable } from '@/components/admin/GoldenTestsHealthTable';
import { Play, AlertOctagon, DollarSign } from 'lucide-react';

type TabKey = 'deploys' | 'health';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'deploys', label: 'Deploys' },
  { key: 'health',  label: 'Golden tests' },
];

interface Props {
  searchParams: Promise<{ tab?: string }>;
}

export default async function VersionesPage({ searchParams }: Props) {
  if (!(await isAdmin())) redirect('/admin/login');

  const { tab: rawTab } = await searchParams;
  const tab: TabKey = rawTab === 'health' ? 'health' : 'deploys';

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] mb-1" style={{ color: '#9B6DFF' }}>Meerkats · Rollouts</p>
        <h1 className="text-[28px] font-bold leading-tight tracking-tight" style={{ color: '#1A0A3B' }}>
          Versiones de meerkats
        </h1>
        <p className="text-[13px] mt-1.5 max-w-2xl" style={{ color: '#6B6480' }}>
          Rollouts activos por meerkat, versiones fijadas por cliente, y salud de las golden tests en las últimas 24 horas.
        </p>
      </div>

      <nav className="flex items-center gap-1" style={{ borderBottom: '1px solid #E8E3F5' }}>
        {TABS.map(t => {
          const active = tab === t.key;
          return (
            <Link
              key={t.key}
              href={`/admin/versiones?tab=${t.key}`}
              className="px-4 py-2.5 text-[13px] font-semibold transition-colors"
              style={{
                color:        active ? '#6C3BFF' : '#6B6480',
                borderBottom: active ? '2px solid #6C3BFF' : '2px solid transparent',
                marginBottom: '-1px',
              }}
            >
              {t.label}
            </Link>
          );
        })}
      </nav>

      {tab === 'deploys' && <DeploysTab />}
      {tab === 'health'  && <HealthTab />}
    </div>
  );
}

async function DeploysTab() {
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
    <>
      <p className="text-[12px]" style={{ color: '#6B6480' }}>
        El rollout real por organización se controla con flags (ver{' '}
        <a href="/admin/flags" className="font-semibold" style={{ color: '#6C3BFF' }}>Feature flags</a>).
        &ldquo;Rollout activo&rdquo; muestra los flags meerkat.&lt;id&gt;.v&lt;n&gt; existentes;
        &ldquo;Fallback&rdquo; muestra la versión legacy que reciben los agentes sin flag aplicable.
      </p>
      <VersionesTable rows={rows} />
    </>
  );
}

async function HealthTab() {
  const supabase = createAdminClient();

  const { data: recentRuns } = await supabase
    .from('golden_test_runs')
    .select('id, meerkat_id, versions, trigger, status, total_scenarios, completed_scenarios, created_at, completed_at')
    .order('created_at', { ascending: false })
    .limit(20);

  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: recent24h } = await supabase
    .from('golden_test_scenario_runs')
    .select('score, error, cost_usd')
    .gte('created_at', since24h);

  const total24h  = recent24h?.length ?? 0;
  const failed24h = recent24h?.filter(r => r.error != null).length ?? 0;
  const cost24h   = recent24h?.reduce((sum, r) => sum + Number(r.cost_usd ?? 0), 0) ?? 0;
  const failRate  = total24h > 0 ? failed24h / total24h : 0;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <HealthCard label="Scenario runs 24h" value={String(total24h)} accent="#6C3BFF" icon={<Play size={16} />} />
        <HealthCard
          label="Fallos técnicos 24h"
          value={`${failed24h} (${(failRate * 100).toFixed(1)}%)`}
          accent={failRate > 0.10 ? '#B45309' : '#22C55E'}
          icon={<AlertOctagon size={16} />}
          warn={failRate > 0.10}
        />
        <HealthCard
          label="Costo 24h"
          value={cost24h.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 })}
          accent="#9B6DFF"
          icon={<DollarSign size={16} />}
          hint="Anthropic tokens · USD"
        />
      </div>
      <GoldenTestsHealthTable runs={recentRuns ?? []} />
    </div>
  );
}

function HealthCard({ label, value, accent, icon, warn, hint }: { label: string; value: string; accent: string; icon: React.ReactNode; warn?: boolean; hint?: string }) {
  return (
    <div
      className="rounded-2xl transition-all"
      style={{
        background: warn ? '#FFFBEB' : '#ffffff',
        border:     warn ? '1px solid rgba(180,83,9,0.25)' : '1px solid #E8E3F5',
        padding:    '16px 18px',
        boxShadow:  '0 1px 3px rgba(15,5,34,0.04)',
      }}
    >
      <div className="flex items-center gap-2 mb-2">
        <div className="flex items-center justify-center rounded-lg" style={{ background: `${accent}1A`, color: accent, width: 28, height: 28 }}>
          {icon}
        </div>
        <p className="text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: '#6B6480' }}>{label}</p>
      </div>
      <p className="text-[24px] font-bold tracking-tight leading-none tabular-nums" style={{ color: warn ? '#B45309' : '#1A0A3B' }}>
        {value}
      </p>
      {hint && <p className="text-[11px] mt-1" style={{ color: '#9B8FB5' }}>{hint}</p>}
    </div>
  );
}
