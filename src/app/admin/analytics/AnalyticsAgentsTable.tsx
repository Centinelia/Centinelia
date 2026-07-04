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
  comercial: { label: 'Comercial', color: '#3b82f6' },
  pro:       { label: 'Pro',       color: '#a855f7' },
};

type TierFilter   = 'todos' | 'comercial' | 'pro';
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
    comercial: rows.filter(r => r.plan === 'comercial').length,
    pro:      rows.filter(r => r.plan === 'pro').length,
    activos:  rows.filter(r => r.active).length,
    pausados: rows.filter(r => !r.active).length,
  };

  const tierMeta   = tier   !== 'todos' ? PLAN_META[tier]   : null;
  const statusDot  = status === 'activos' ? '#22c55e' : status === 'pausados' ? '#6b7280' : null;
  const statusLbl  = status === 'activos' ? 'Activos' : status === 'pausados' ? 'Pausados' : 'Estado';

  if (rows.length === 0) {
    return <p className="text-sm py-4 text-center" style={{ color: 'var(--c-text-3)' }}>Sin agentes</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Filters row */}
      <div className="flex flex-col gap-2">
        {/* Search */}
        <div className="relative">
          <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--c-text-3)' }} />
          <input
            type="text"
            placeholder="Buscar agente…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-7 pr-3 py-1.5 rounded-lg text-xs outline-none"
            style={{ background: 'var(--c-input-bg)', border: '1px solid var(--c-input-border)', color: 'var(--c-text)' }}
          />
        </div>

        {/* Collapsible filter buttons */}
        <div className="flex gap-2">

          {/* Tier dropdown */}
          <div className="flex flex-col gap-1">
            <button
              onClick={() => { setTierOpen(o => !o); setStatOpen(false); }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
              style={{
                background: tierMeta ? `${tierMeta.color}18` : 'var(--c-surface-2)',
                color:      tierMeta ? tierMeta.color : 'var(--c-text-2)',
                border: `1px solid ${tierMeta ? tierMeta.color + '40' : 'var(--c-border)'}`,
              }}
            >
              {tierMeta ? tierMeta.label : 'Tier'}
              <ChevronDown size={10} className="transition-transform" style={{ transform: tierOpen ? 'rotate(180deg)' : undefined }} />
            </button>
            {tierOpen && (
              <div className="flex gap-1 flex-wrap p-1 rounded-lg" style={{ background: 'var(--c-surface-2)', border: '1px solid var(--c-border)' }}>
                {([
                  { key: 'todos',    label: `Todos (${rows.length})`,          color: undefined },
                  { key: 'comercial', label: `Comercial (${counts.comercial})`, color: '#3b82f6' },
                  { key: 'pro',      label: `Pro (${counts.pro})`,             color: '#a855f7' },
                ] as { key: TierFilter; label: string; color?: string }[]).map(({ key, label, color }) => (
                  <button
                    key={key}
                    onClick={() => { setTier(key); setTierOpen(false); }}
                    className="flex items-center px-2.5 py-1 rounded-md text-xs font-medium transition-all"
                    style={{
                      background: tier === key ? (color ?? '#6C3BFF') : 'transparent',
                      color:      tier === key ? '#fff' : (color ?? 'var(--c-text-3)'),
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
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
              style={{
                background: statusDot ? `${statusDot}18` : 'var(--c-surface-2)',
                color:      statusDot ? statusDot : 'var(--c-text-2)',
                border: `1px solid ${statusDot ? statusDot + '40' : 'var(--c-border)'}`,
              }}
            >
              {statusDot && <span className="w-1.5 h-1.5 rounded-full" style={{ background: statusDot }} />}
              {statusLbl}
              <ChevronDown size={10} className="transition-transform" style={{ transform: statOpen ? 'rotate(180deg)' : undefined }} />
            </button>
            {statOpen && (
              <div className="flex gap-1 flex-wrap p-1 rounded-lg" style={{ background: 'var(--c-surface-2)', border: '1px solid var(--c-border)' }}>
                {([
                  { key: 'todos',    label: `Todos`,                          dot: undefined },
                  { key: 'activos',  label: `Activos (${counts.activos})`,    dot: '#22c55e' },
                  { key: 'pausados', label: `Pausados (${counts.pausados})`,  dot: '#6b7280' },
                ] as { key: StatusFilter; label: string; dot?: string }[]).map(({ key, label, dot }) => (
                  <button
                    key={key}
                    onClick={() => { setStatus(key); setStatOpen(false); }}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-all"
                    style={{
                      background: status === key ? (dot ?? '#6C3BFF') : 'transparent',
                      color:      status === key ? '#fff' : 'var(--c-text-3)',
                    }}
                  >
                    {dot && <span className="w-1.5 h-1.5 rounded-full" style={{ background: status === key ? '#fff' : dot }} />}
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
        <p className="text-xs py-3 text-center" style={{ color: 'var(--c-text-3)' }}>Sin resultados</p>
      ) : (
        <div className="flex flex-col gap-1.5">
          {filtered.map(row => {
            const meta = PLAN_META[row.plan] ?? PLAN_META.comercial;
            return (
              <Link
                key={row.id}
                href={`/admin/agentes/${row.id}`}
                className="flex flex-col gap-1.5 px-3 py-2.5 rounded-lg transition-all hover:opacity-80"
                style={{ background: 'var(--c-surface-2)', border: '1px solid var(--c-border)' }}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className="w-2 h-2 rounded-full flex-shrink-0"
                      style={{ background: row.active ? '#22c55e' : '#6b7280' }}
                      title={row.active ? 'Activo' : 'Pausado'}
                    />
                    <span className="text-sm truncate font-medium" style={{ color: 'var(--c-text)' }}>
                      {row.business_name}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span
                      className="text-xs px-2 py-0.5 rounded-full font-semibold"
                      style={{ background: `${meta.color}18`, color: meta.color, border: `1px solid ${meta.color}40` }}
                    >
                      {meta.label}
                    </span>
                    {row.mxn > 0 && (
                      <span className="text-xs" style={{ color: 'var(--c-text-3)' }}>
                        ${row.mxn.toLocaleString('es-MX')}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex gap-4">
                  <Stat label="Llamadas"    value={row.calls} />
                  <Stat label="Leads"       value={row.leads}       color="#22c55e" />
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
      <div className="text-xs" style={{ color: color ?? 'var(--c-text)' }}>{value}</div>
      <div style={{ color: 'var(--c-text-3)', fontSize: '10px' }}>{label}</div>
    </div>
  );
}
