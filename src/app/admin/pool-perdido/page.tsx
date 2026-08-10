import { redirect } from 'next/navigation';
import { isAdmin } from '@/lib/admin/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import Link from 'next/link';
import { AlertTriangle, Info, RotateCcw, TrendingDown } from 'lucide-react';

export const dynamic = 'force-dynamic';

const DEMO_EMAILS = ['demo@centinelia.mx', 'centinelia.dev@gmail.com'];

type Tab = 'minutos' | 'ops-rollover' | 'ops-annual';

const TABS: { id: Tab; label: string; unit: string }[] = [
  { id: 'minutos',      label: 'Minutos (rollover cap)',              unit: 'min'    },
  { id: 'ops-rollover', label: 'Tareas (rollover cap)',               unit: 'tareas' },
  { id: 'ops-annual',   label: 'Tareas (no consumidas · anual)',      unit: 'tareas' },
];

interface LedgerRow {
  portal_email: string;
  amount: number;
  created_at: string;
  description: string | null;
}

interface AggRow {
  portal_email: string;
  total: number;
  count: number;
  last_at: string;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('es-MX', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
}

function fmtAmount(n: number, unit: string): string {
  const abs = Math.abs(n);
  if (unit === 'min') {
    const h = Math.floor(abs / 60);
    const m = abs % 60;
    return h > 0 ? `${h}h ${m}min` : `${m}min`;
  }
  return `${abs.toLocaleString('es-MX')} tareas`;
}

interface Props { searchParams: Promise<{ tab?: string }> }

export default async function PoolPerdidoPage({ searchParams }: Props) {
  if (!await isAdmin()) {
    redirect('/admin/login?from=/admin/pool-perdido');
  }

  const sp = await searchParams;
  const tab: Tab = (['minutos', 'ops-rollover', 'ops-annual'] as const).includes(sp.tab as Tab)
    ? (sp.tab as Tab)
    : 'minutos';

  const tabMeta = TABS.find(t => t.id === tab)!;
  const unit = tabMeta.unit;

  const supabase = createAdminClient();

  // Build exclusion filter string for demo emails
  const demoExcl = `(${DEMO_EMAILS.map(e => `"${e}"`).join(',')})`;

  let rows: LedgerRow[] = [];

  if (tab === 'minutos') {
    const { data } = await supabase
      .from('minutes_ledger')
      .select('portal_email, amount, created_at, description')
      .eq('kind', 'rollover_cap')
      .not('portal_email', 'in', demoExcl)
      .order('created_at', { ascending: false });
    rows = (data ?? []) as LedgerRow[];
  } else if (tab === 'ops-rollover') {
    const { data } = await supabase
      .from('ops_ledger')
      .select('portal_email, amount, created_at, description')
      .eq('kind', 'rollover_cap')
      .not('portal_email', 'in', demoExcl)
      .order('created_at', { ascending: false });
    rows = (data ?? []) as LedgerRow[];
  } else {
    const { data } = await supabase
      .from('ops_ledger')
      .select('portal_email, amount, created_at, description')
      .eq('kind', 'unused_forfeited')
      .not('portal_email', 'in', demoExcl)
      .order('created_at', { ascending: false });
    rows = (data ?? []) as LedgerRow[];
  }

  // Aggregate por portal_email
  const aggMap = new Map<string, AggRow>();
  for (const r of rows) {
    const email = r.portal_email ?? 'sin-email';
    const existing = aggMap.get(email);
    if (existing) {
      existing.total += Math.abs(r.amount);
      existing.count += 1;
      if (r.created_at > existing.last_at) existing.last_at = r.created_at;
    } else {
      aggMap.set(email, {
        portal_email: email,
        total: Math.abs(r.amount),
        count: 1,
        last_at: r.created_at,
      });
    }
  }

  const aggRows = Array.from(aggMap.values()).sort((a, b) => b.total - a.total);

  const totalLost = aggRows.reduce((s, r) => s + r.total, 0);
  const totalEvents = rows.length;
  const totalAccounts = aggRows.length;

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-[24px] font-semibold tracking-tight" style={{ color: '#111827' }}>
          Pool perdido
        </h1>
        <p className="text-[13px] mt-1.5" style={{ color: '#6B7280' }}>
          Saldo descartado por cap de rollover o no consumido al vencer un contrato anual.
        </p>
      </div>

      {/* Tab strip */}
      <div className="flex gap-0 border-b" style={{ borderColor: '#E5E7EB' }}>
        {TABS.map(t => (
          <Link
            key={t.id}
            href={`/admin/pool-perdido?tab=${t.id}`}
            className="px-4 py-2.5 text-[13px] font-medium whitespace-nowrap transition-colors"
            style={{
              color: tab === t.id ? '#111827' : '#6B7280',
              borderBottom: tab === t.id ? '2px solid #6C3BFF' : '2px solid transparent',
              marginBottom: '-1px',
            }}
          >
            {t.label}
          </Link>
        ))}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <SummaryCard
          icon={<TrendingDown size={13} />}
          label={`Total perdido (${unit})`}
          value={fmtAmount(totalLost, unit)}
          color="#EF4444"
        />
        <SummaryCard
          icon={<AlertTriangle size={13} />}
          label="Eventos de pérdida"
          value={totalEvents.toLocaleString('es-MX')}
          color="#F59E0B"
        />
        <SummaryCard
          icon={<RotateCcw size={13} />}
          label="Cuentas afectadas"
          value={totalAccounts.toLocaleString('es-MX')}
          color="#6C3BFF"
        />
      </div>

      {/* Main table */}
      {aggRows.length === 0 ? (
        <div
          className="p-10 text-center rounded-xl bg-white"
          style={{ border: '1px solid #E5E7EB', boxShadow: '0 1px 3px 0 rgb(0 0 0 / 0.05)' }}
        >
          <RotateCcw size={20} style={{ color: '#D1D5DB', margin: '0 auto 12px' }} />
          <p className="text-[13px]" style={{ color: '#6B7280' }}>
            Sin eventos de pérdida en esta categoria.
          </p>
        </div>
      ) : (
        <div
          className="rounded-xl overflow-hidden bg-white"
          style={{ border: '1px solid #E5E7EB', boxShadow: '0 1px 3px 0 rgb(0 0 0 / 0.05)' }}
        >
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead style={{ background: '#F9FAFB' }}>
                <tr>
                  <Th align="left">Cuenta</Th>
                  <Th align="right">Total perdido</Th>
                  <Th align="right">Eventos</Th>
                  <Th align="right">Ultimo evento</Th>
                </tr>
              </thead>
              <tbody>
                {aggRows.map((r, i) => (
                  <AggregatedRow
                    key={r.portal_email}
                    row={r}
                    unit={unit}
                    index={i}
                  />
                ))}
                {/* Totales */}
                <tr style={{ background: '#F9FAFB', borderTop: '2px solid #E5E7EB' }}>
                  <td className="px-4 py-3 font-semibold" style={{ color: '#111827' }}>
                    Total — {totalAccounts} cuenta{totalAccounts !== 1 ? 's' : ''}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums font-bold" style={{ color: '#EF4444' }}>
                    {fmtAmount(totalLost, unit)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums font-semibold" style={{ color: '#374151' }}>
                    {totalEvents}
                  </td>
                  <td />
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Detail table — last 50 raw events */}
      {rows.length > 0 && (
        <div className="space-y-2">
          <p className="text-[12px] font-medium uppercase tracking-wider" style={{ color: '#9CA3AF' }}>
            Ultimos eventos ({Math.min(rows.length, 50)} de {rows.length})
          </p>
          <div
            className="rounded-xl overflow-hidden bg-white"
            style={{ border: '1px solid #E5E7EB', boxShadow: '0 1px 3px 0 rgb(0 0 0 / 0.05)' }}
          >
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead style={{ background: '#F9FAFB' }}>
                  <tr>
                    <Th align="left">Cuenta</Th>
                    <Th align="right">Monto</Th>
                    <Th align="left">Descripcion</Th>
                    <Th align="right">Fecha</Th>
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 50).map((r, i) => (
                    <tr
                      key={`${r.portal_email}-${r.created_at}-${i}`}
                      style={{ borderTop: '1px solid #F3F4F6' }}
                      className="hover:bg-gray-50"
                    >
                      <td className="px-4 py-2.5" style={{ color: '#374151' }}>{r.portal_email}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums font-medium" style={{ color: '#EF4444' }}>
                        {fmtAmount(r.amount, unit)}
                      </td>
                      <td className="px-4 py-2.5 max-w-xs truncate" style={{ color: '#6B7280' }}>
                        {r.description ?? '-'}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums" style={{ color: '#9CA3AF' }}>
                        {fmtDate(r.created_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Info footer */}
      <div
        className="p-4 rounded-xl flex items-start gap-3 bg-white"
        style={{ border: '1px solid #E5E7EB', boxShadow: '0 1px 3px 0 rgb(0 0 0 / 0.05)' }}
      >
        <Info size={14} style={{ color: '#9CA3AF', flexShrink: 0, marginTop: 2 }} />
        <div className="text-[12px] space-y-1" style={{ color: '#6B7280', lineHeight: 1.7 }}>
          <p className="text-[13px] font-semibold" style={{ color: '#111827' }}>Como se genera este pool</p>
          <p>
            <strong style={{ color: '#374151' }}>Minutos (rollover cap):</strong>{' '}
            Al renovarse el plan mensual, los minutos que exceden el cap de rollover se descartan y quedan registrados con kind=&apos;rollover_cap&apos; en minutes_ledger (valor negativo).
          </p>
          <p>
            <strong style={{ color: '#374151' }}>Tareas (rollover cap):</strong>{' '}
            Lo mismo para tareas en ops_ledger. Se aplica el mismo cap de saldo maximal de rollover.
          </p>
          <p>
            <strong style={{ color: '#374151' }}>Tareas (no consumidas · anual):</strong>{' '}
            Al vencer un contrato anual, las tareas acumuladas no consumidas se registran con kind=&apos;unused_forfeited&apos; en ops_ledger.
          </p>
        </div>
      </div>
    </div>
  );
}

function Th({ children, align = 'right' }: { children: React.ReactNode; align?: 'left' | 'right' | 'center' }) {
  return (
    <th
      className="px-4 py-3 text-[11px] font-medium uppercase tracking-wider"
      style={{ color: '#6B7280', textAlign: align }}
    >
      {children}
    </th>
  );
}

function SummaryCard({ icon, label, value, sub, color }: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  color: string;
}) {
  return (
    <div
      className="rounded-xl bg-white px-5 py-4"
      style={{ border: '1px solid #E5E7EB', boxShadow: '0 1px 3px 0 rgb(0 0 0 / 0.05)' }}
    >
      <div className="flex items-center gap-2 mb-2">
        <span style={{ color }}>{icon}</span>
        <p className="text-[11px] uppercase tracking-wider font-medium" style={{ color: '#9CA3AF' }}>{label}</p>
      </div>
      <p className="text-[24px] font-semibold leading-none tabular-nums" style={{ color: '#111827' }}>{value}</p>
      {sub && <p className="text-[12px] mt-1.5" style={{ color: '#6B7280' }}>{sub}</p>}
    </div>
  );
}

function AggregatedRow({ row, unit, index }: { row: AggRow; unit: string; index: number }) {
  return (
    <tr
      style={{ borderTop: index > 0 ? '1px solid #F3F4F6' : '1px solid #F3F4F6' }}
      className="hover:bg-gray-50"
    >
      <td className="px-4 py-2.5" style={{ color: '#111827' }}>{row.portal_email}</td>
      <td className="px-4 py-2.5 text-right tabular-nums font-semibold" style={{ color: '#EF4444' }}>
        {fmtAmount(row.total, unit)}
      </td>
      <td className="px-4 py-2.5 text-right tabular-nums" style={{ color: '#6B7280' }}>
        {row.count}
      </td>
      <td className="px-4 py-2.5 text-right tabular-nums" style={{ color: '#9CA3AF' }}>
        {fmtDate(row.last_at)}
      </td>
    </tr>
  );
}
