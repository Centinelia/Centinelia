export const dynamic = 'force-dynamic';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import { GoldenTestsHealthTable } from '@/components/admin/GoldenTestsHealthTable';

async function isAdmin(): Promise<boolean> {
  const store = await cookies();
  return store.get('Centinelia_admin')?.value === process.env.ADMIN_SECRET;
}

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
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Golden tests: health</h1>
        <p className="text-sm text-slate-600 mt-1">Últimos runs, costo, y tasa de fallo técnico.</p>
      </div>

      <div className="grid grid-cols-3 gap-4">
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
      className={`rounded-lg border p-4 ${
        warn ? 'border-amber-300 bg-amber-50' : 'border-slate-200 bg-white'
      }`}
    >
      <div className="text-xs text-slate-500 uppercase tracking-wide">{label}</div>
      <div className="text-xl font-semibold mt-1">{value}</div>
    </div>
  );
}
