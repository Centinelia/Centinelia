'use client';

import { useMemo, useState } from 'react';
import { RefreshCw, RotateCcw, Zap, CreditCard, Phone, SlidersHorizontal, BatteryCharging, X } from 'lucide-react';

export type LedgerSource = 'renovacion' | 'rollover' | 'extra_compra' | 'activacion' | 'ajuste' | 'llamada' | 'auto_recarga';

export interface LedgerEntry {
  id:          string;
  date:        string;
  amount:      number;
  description: string;
  source:      LedgerSource;
  balance:     number;
}

const SOURCE_META: Record<LedgerSource, { iconKey: string; color: string; label: string }> = {
  renovacion:   { iconKey: 'refresh',  color: '#6C3BFF', label: 'Renovación' },
  rollover:     { iconKey: 'rotate',   color: '#a855f7', label: 'Rollover' },
  extra_compra: { iconKey: 'zap',      color: '#f59e0b', label: 'Compra extra' },
  activacion:   { iconKey: 'card',     color: '#3b82f6', label: 'Activación' },
  ajuste:       { iconKey: 'sliders',  color: '#22c55e', label: 'Ajuste' },
  llamada:      { iconKey: 'phone',    color: '#6b7280', label: 'Llamada' },
  auto_recarga: { iconKey: 'battery',  color: '#6C3BFF', label: 'Auto-recarga' },
};

function renderIcon(iconKey: string) {
  switch (iconKey) {
    case 'refresh': return <RefreshCw size={11} />;
    case 'rotate':  return <RotateCcw size={11} />;
    case 'zap':     return <Zap size={11} />;
    case 'card':    return <CreditCard size={11} />;
    case 'sliders': return <SlidersHorizontal size={11} />;
    case 'phone':   return <Phone size={11} />;
    case 'battery': return <BatteryCharging size={11} />;
    default:        return null;
  }
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' });
}
function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
}
function fmtMonth(iso: string) {
  const s = new Date(iso).toLocaleDateString('es-MX', { month: 'long', year: 'numeric' });
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

export default function MinutesLedgerListClient({
  entries,
  callerNames = {},
}: {
  entries:       LedgerEntry[];
  callerNames?:  Record<string, string>;
}) {
  const [fromDate, setFromDate] = useState<string>('');
  const [toDate,   setToDate]   = useState<string>('');

  const filtered = useMemo(() => {
    if (!fromDate && !toDate) return entries;
    const fromTs = fromDate ? new Date(fromDate + 'T00:00:00').getTime() : -Infinity;
    const toTs   = toDate   ? new Date(toDate   + 'T23:59:59').getTime() :  Infinity;
    return entries.filter(e => {
      const t = new Date(e.date).getTime();
      return t >= fromTs && t <= toTs;
    });
  }, [entries, fromDate, toDate]);

  const clearFilters = () => { setFromDate(''); setToDate(''); };
  const hasFilters = !!(fromDate || toDate);

  // Group by month
  const groups = new Map<string, LedgerEntry[]>();
  for (const e of filtered) {
    const key = fmtMonth(e.date);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(e);
  }

  return (
    <div className="flex flex-col">
      {/* Date filter — sticky top */}
      <div className="flex items-center gap-2 mb-3 pb-3 sticky top-0 z-10 flex-wrap"
        style={{ borderBottom: '1px solid var(--c-divider)', background: 'var(--c-surface)' }}>
        <label className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--c-text-3)' }}>
          Desde
          <input
            type="date"
            value={fromDate}
            onChange={e => setFromDate(e.target.value)}
            className="text-xs px-2 py-1 rounded-md"
            style={{ background: 'var(--c-surface-2)', border: '1px solid var(--c-border-2)', color: 'var(--c-text)' }}
          />
        </label>
        <label className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--c-text-3)' }}>
          Hasta
          <input
            type="date"
            value={toDate}
            onChange={e => setToDate(e.target.value)}
            className="text-xs px-2 py-1 rounded-md"
            style={{ background: 'var(--c-surface-2)', border: '1px solid var(--c-border-2)', color: 'var(--c-text)' }}
          />
        </label>
        {hasFilters && (
          <button
            onClick={clearFilters}
            className="flex items-center gap-1 text-xs px-2 py-1 rounded-md transition-opacity hover:opacity-80"
            style={{ color: 'var(--c-text-3)' }}
          >
            <X size={11} /> Limpiar
          </button>
        )}
        {hasFilters && (
          <span className="text-xs ml-auto tabular-nums" style={{ color: 'var(--c-text-4)' }}>
            {filtered.length} de {entries.length} movimientos
          </span>
        )}
      </div>

      {filtered.length === 0 ? (
        <p className="text-xs text-center py-4" style={{ color: 'var(--c-text-3)' }}>
          Sin movimientos en este rango
        </p>
      ) : (
        <>
          {Array.from(groups.entries()).map(([month, rows]) => (
            <div key={month} className="flex flex-col">
              <div className="text-xs font-semibold py-2" style={{ color: 'var(--c-text-4)' }}>
                {month}
              </div>
              {rows.map((e, i) => {
                const meta    = SOURCE_META[e.source] ?? SOURCE_META.ajuste;
                const isCredit = e.amount > 0;
                return (
                  <div
                    key={e.id + i}
                    className="flex items-center gap-2.5 py-2"
                    style={{ borderTop: '1px solid var(--c-divider)' }}
                  >
                    <div
                      className="flex-shrink-0 flex items-center justify-center rounded-full w-6 h-6"
                      style={{ background: `${meta.color}18`, color: meta.color }}
                    >
                      {renderIcon(meta.iconKey)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs leading-snug truncate" style={{ color: 'var(--c-text)' }}>
                        {e.description}
                      </p>
                      {e.source === 'llamada' && (() => {
                        const raw = e.description.split(' · ')[0];
                        const name = callerNames[raw.replace(/\D/g, '')];
                        return name ? (
                          <p className="text-xs leading-none mt-0.5" style={{ color: '#9B6DFF' }}>{name}</p>
                        ) : null;
                      })()}
                      <p className="text-xs mt-0.5" style={{ color: 'var(--c-text-4)' }}>
                        {fmtDate(e.date)} · {fmtTime(e.date)}
                      </p>
                    </div>
                    <div className="flex flex-col items-end flex-shrink-0">
                      <span
                        className="text-xs font-bold tabular-nums"
                        style={{ color: isCredit ? '#22c55e' : 'var(--c-text-2)' }}
                      >
                        {isCredit ? '+' : ''}{e.amount} min
                      </span>
                      <span className="text-xs tabular-nums mt-0.5" style={{ color: 'var(--c-text-4)' }}>
                        saldo {e.balance}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </>
      )}
    </div>
  );
}
