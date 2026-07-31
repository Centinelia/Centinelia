export const dynamic = 'force-dynamic';

import { redirect } from 'next/navigation';
import { isAdmin } from '@/lib/admin/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { GoldenTestsHealthTable } from '@/components/admin/GoldenTestsHealthTable';


export default async function HealthPage() {
  if (!(await isAdmin())) redirect('/admin/login');

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

  const total24h = recent24h?.length ?? 0;
  const failed24h = recent24h?.filter(r => r.error != null).length ?? 0;
  const cost24h = recent24h?.reduce((sum, r) => sum + Number(r.cost_usd ?? 0), 0) ?? 0;
  const failRate = total24h > 0 ? failed24h / total24h : 0;

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6" style={{ color: 'var(--c-text)' }}>
      <div>
        <h1 className="text-2xl font-semibold" style={{ color: 'var(--c-text)' }}>Golden tests: health</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--c-text-2)' }}>
          Últimos runs, costo, y tasa de fallo técnico.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card label="Scenario runs 24h" value={String(total24h)} />
        <Card
          label="Fallos técnicos 24h"
          value={`${failed24h} (${(failRate * 100).toFixed(1)}%)`}
          warn={failRate > 0.10}
        />
        <Card label="Costo 24h" value={`$${cost24h.toFixed(2)}`} />
      </div>

      <GoldenTestsHealthTable runs={recentRuns ?? []} />
    </div>
  );
}

function Card({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div
      className="rounded-lg border p-4"
      style={{
        borderColor: warn ? 'rgba(251,191,36,0.5)' : 'var(--c-border)',
        background: warn ? 'rgba(251,191,36,0.10)' : 'var(--c-surface)',
      }}
    >
      <div className="text-xs uppercase tracking-wide" style={{ color: 'var(--c-text-3)' }}>{label}</div>
      <div className="text-xl font-semibold mt-1" style={{ color: 'var(--c-text)' }}>{value}</div>
    </div>
  );
}
