'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { Search, ChevronDown } from 'lucide-react';

export interface AgentRow {
  id: string;
  business_name: string;
  plan: string;
  active: boolean;
  mxn: number;
  calls: number;
  leads: number;
  avgMin: number;
  minutesUsed: number;
}

const PLAN_META: Record<string, { label: string; color: string }> = {
  pro:       { label: 'Empleado Centinelia', color: '#8B5CF6' },
};

type TierFilter   = 'todos' | 'pro';
type StatusFilter = 'todos' | 'activos' | 'pausados';

export default function AnalyticsAgentsTable({ rows }: { rows: AgentRow[] }) {
  const [search, setSearch]     = useState('');
  const [tier, setTier]         = useState<TierFilter>('todos');
  const [status, setStatus]     = useState<StatusFilter>('todos');
  const [tierOpen, setTierOpen] = useState(false);
  const [statOpen, setStatOpen] = useState(false);

  const filtered = useMemo(() => {
    let result = rows;
    if (tier   !== 'todos')  result = result.filter(r => r.plan === tier);
    if (status === 'activos') result = result.filter(r => r.active);
    if (status === 'pausados') result = result.filter(r => !r.active);
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(r => r.business_name.toLowerCase().includes(q));
    }
    return result;
  }, [rows, tier, status, search]);

  const counts = {
    pro:      rows.filter(r => r.plan === 'pro').length,
    activos:  rows.filter(r => r.active).length,
    pausados: rows.filter(r => !r.active).length,
  };

  const tierMeta   = tier   !== 'todos' ? PLAN_META[tier]   : null;
  const statusDot  = status === 'activos' ? '#10B981' : status === 'pausados' ? '#6B7280' : null;
  const statusLbl  = status === 'activos' ? 'Activos' : status === 'pausados' ? 'Pausados' : 'Estado';

  if (rows.length === 0) {
    return <p className="text-[13px] py-4 text-center" style={{ color: '#6B7280' }}>Sin empleados</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Filters row */}
      <div className="flex flex-col gap-2">
        {/* Search */}
        <div className="relative">
          <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: '#9CA3AF' }} />
          <input
            type="text"
            placeholder="Buscar empleado..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-7 pr-3 py-1.5 rounded-lg text-[12px] outline-none"
            style={{ background: '#FFFFFF', border: '1px solid #E5E7EB', color: '#111827' }}
          />
        </div>

        {/* Collapsible filter buttons */}
        <div className="flex gap-2">

          {/* Tier dropdown */}
          <div className="flex flex-col gap-1">
            <button
              onClick={() => { setTierOpen(o => !o); setStatOpen(false); }}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[12px] font-medium transition-colors"
              style={{
                background: tierMeta ? `${tierMeta.color}14` : '#FFFFFF',
                color:      tierMeta ? tierMeta.color : '#374151',
                border: `1px solid ${tierMeta ? tierMeta.color + '30' : '#E5E7EB'}`,
              }}
            >
              {tierMeta ? tierMeta.label : 'Tier'}
              <ChevronDown size={10} className="transition-transform" style={{ transform: tierOpen ? 'rotate(180deg)' : undefined }} />
            </button>
            {tierOpen && (
              <div
                className="flex gap-1 flex-wrap p-1 rounded-lg bg-white"
                style={{ border: '1px solid #E5E7EB', boxShadow: '0 1px 3px 0 rgb(0 0 0 / 0.05)' }}
              >
                {([
                  { key: 'todos',    label: `Todos (${rows.length})`,                color: undefined },
                  { key: 'pro',      label: `Empleado Centinelia (${counts.pro})`,  color: '#8B5CF6' },
                ] as { key: TierFilter; label: string; color?: string }[]).map(({ key, label, color }) => (
                  <button
                    key={key}
                    onClick={() => { setTier(key); setTierOpen(false); }}
                    className="flex items-center px-2.5 py-1 rounded-md text-[12px] font-medium transition-colors"
                    style={{
                      background: tier === key ? (color ?? '#6C3BFF') : 'transparent',
                      color:      tier === key ? '#FFFFFF' : (color ?? '#374151'),
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Status dropdown */}
          <div className="flex flex-col gap-1">
            <button
              onClick={() => { setStatOpen(o => !o); setTierOpen(false); }}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[12px] font-medium transition-colors"
              style={{
                background: statusDot ? `${statusDot}14` : '#FFFFFF',
                color:      statusDot ? statusDot : '#374151',
                border: `1px solid ${statusDot ? statusDot + '30' : '#E5E7EB'}`,
              }}
            >
              {statusDot && <span className="w-1.5 h-1.5 rounded-full" style={{ background: statusDot }} />}
              {statusLbl}
              <ChevronDown size={10} className="transition-transform" style={{ transform: statOpen ? 'rotate(180deg)' : undefined }} />
            </button>
            {statOpen && (
              <div
                className="flex gap-1 flex-wrap p-1 rounded-lg bg-white"
                style={{ border: '1px solid #E5E7EB', boxShadow: '0 1px 3px 0 rgb(0 0 0 / 0.05)' }}
              >
                {([
                  { key: 'todos',    label: `Todos`,                          dot: undefined },
                  { key: 'activos',  label: `Activos (${counts.activos})`,    dot: '#10B981' },
                  { key: 'pausados', label: `Pausados (${counts.pausados})`,  dot: '#6B7280' },
                ] as { key: StatusFilter; label: string; dot?: string }[]).map(({ key, label, dot }) => (
                  <button
                    key={key}
                    onClick={() => { setStatus(key); setStatOpen(false); }}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[12px] font-medium transition-colors"
                    style={{
                      background: status === key ? (dot ?? '#6C3BFF') : 'transparent',
                      color:      status === key ? '#FFFFFF' : '#374151',
                    }}
                  >
                    {dot && <span className="w-1.5 h-1.5 rounded-full" style={{ background: status === key ? '#FFFFFF' : dot }} />}
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>

        </div>
      </div>

      {/* Agent rows */}
      {filtered.length === 0 ? (
        <p className="text-[12px] py-3 text-center" style={{ color: '#6B7280' }}>Sin resultados</p>
      ) : (
        <div className="flex flex-col gap-1.5">
          {filtered.map(row => {
            const meta = PLAN_META[row.plan] ?? PLAN_META.pro;
            return (
              <Link
                key={row.id}
                href={`/admin/agentes/${row.id}`}
                className="flex flex-col gap-1.5 px-3 py-2.5 rounded-lg transition-colors hover:bg-gray-50"
                style={{ background: '#FFFFFF', border: '1px solid #E5E7EB' }}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className="w-2 h-2 rounded-full flex-shrink-0"
                      style={{ background: row.active ? '#10B981' : '#6B7280' }}
                      title={row.active ? 'Activo' : 'Pausado'}
                    />
                    <span className="text-[13px] truncate font-medium" style={{ color: '#111827' }}>
                      {row.business_name}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span
                      className="inline-flex items-center gap-1.5 text-[12px] px-2 py-0.5 rounded-md font-medium"
                      style={{ background: `${meta.color}14`, color: meta.color, border: `1px solid ${meta.color}30` }}
                    >
                      {meta.label}
                    </span>
                    {row.mxn > 0 && (
                      <span className="text-[12px] tabular-nums" style={{ color: '#6B7280' }}>
                        ${row.mxn.toLocaleString('es-MX')}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex gap-4">
                  <Stat label="Llamadas"    value={row.calls} />
                  <Stat label="Leads"       value={row.leads}       color="#10B981" />
                  <Stat label="Prom."       value={`${row.avgMin}m`} />
                  <Stat label="Min. usados" value={row.minutesUsed} />
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <div>
      <div className="text-[13px] font-medium tabular-nums" style={{ color: color ?? '#111827' }}>{value}</div>
      <div style={{ color: '#9CA3AF', fontSize: '10px' }} className="uppercase tracking-wider mt-0.5">{label}</div>
    </div>
  );
}
