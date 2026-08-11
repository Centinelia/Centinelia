'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { labelKind } from '@/lib/admin/consumo-labels';
import type { LedgerEntry } from './page';

interface Props {
  entries:      LedgerEntry[];
  fromDate:     string;
  toDate:       string;
  kindFilter:   string;
  portalEmail:  string;
  csvHref:      string;
}

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString('es-MX', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', timeZone: 'America/Mexico_City',
  });
}

export default function ConsumoClient({ entries, fromDate, toDate, kindFilter, csvHref }: Props) {
  const router = useRouter();
  const [from, setFrom] = useState(fromDate);
  const [to,   setTo]   = useState(toDate);
  const [kind, setKind] = useState(kindFilter);

  const applyFilters = () => {
    const qs = new URLSearchParams();
    if (from) qs.set('from', from);
    if (to)   qs.set('to',   to);
    if (kind) qs.set('kind', kind);
    router.push(`?${qs.toString()}`);
  };

  const clearFilters = () => {
    setFrom(''); setTo(''); setKind('');
    router.push('?');
  };

  const applyQuickRange = (days: number | 'month' | 'all') => {
    if (days === 'all') { setFrom(''); setTo(''); return; }
    const now = new Date();
    const iso = (d: Date) => d.toISOString().slice(0, 10);
    if (days === 'month') {
      setFrom(iso(new Date(now.getFullYear(), now.getMonth(), 1)));
      setTo(iso(now));
    } else {
      const f = new Date(now); f.setDate(f.getDate() - days + 1);
      setFrom(iso(f)); setTo(iso(now));
    }
  };

  // Running balances + summaries
  const summary = useMemo(() => {
    const minutesSum: Record<string, number> = {};
    const opsSum: Record<string, number> = {};
    let runningMin = 0, runningOps = 0;
    const withBalance = entries.map(e => {
      const key = e.kind;
      if (e.ledger_type === 'minutes' || e.ledger_type === 'minutes_archive') {
        minutesSum[key] = (minutesSum[key] ?? 0) + e.amount;
        runningMin += e.amount;
        return { ...e, balance: runningMin };
      }
      opsSum[key] = (opsSum[key] ?? 0) + e.amount;
      runningOps += e.amount;
      return { ...e, balance: runningOps };
    });
    return {
      entries:  withBalance,
      minutesTotal: Object.values(minutesSum).reduce((a, b) => a + b, 0),
      opsTotal:     Object.values(opsSum).reduce((a, b) => a + b, 0),
      minutesByKind: minutesSum,
      opsByKind:     opsSum,
    };
  }, [entries]);

  const uniqueKinds = useMemo(() => {
    const set = new Set<string>();
    for (const e of entries) set.add(e.kind);
    return Array.from(set).sort();
  }, [entries]);

  return (
    <div className="flex flex-col gap-4">
      {/* Filters bar */}
      <div className="rounded-lg p-4" style={{ background: '#fff', border: '1px solid #E8E3F5' }}>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider mb-1 opacity-60">Desde</label>
            <input type="date" value={from} onChange={e => setFrom(e.target.value)}
              className="text-[12px] px-3 py-2 rounded-md" style={{ border: '1px solid #E8E3F5' }} />
          </div>
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider mb-1 opacity-60">Hasta</label>
            <input type="date" value={to} onChange={e => setTo(e.target.value)}
              className="text-[12px] px-3 py-2 rounded-md" style={{ border: '1px solid #E8E3F5' }} />
          </div>
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider mb-1 opacity-60">Tipo de movimiento</label>
            <select value={kind} onChange={e => setKind(e.target.value)}
              className="text-[12px] px-3 py-2 rounded-md" style={{ border: '1px solid #E8E3F5' }}>
              <option value="">Todos los movimientos</option>
              {uniqueKinds.map(k => <option key={k} value={k}>{labelKind(k)}</option>)}
            </select>
          </div>
          <button onClick={applyFilters}
            className="text-[12px] px-4 py-2 rounded-md font-semibold"
            style={{ background: '#6C3BFF', color: '#fff' }}>
            Aplicar
          </button>
          <button onClick={clearFilters}
            className="text-[12px] px-3 py-2 rounded-md" style={{ border: '1px solid #E8E3F5' }}>
            Limpiar
          </button>
          <div className="flex-1" />
          <a href={csvHref} download
            className="text-[12px] px-4 py-2 rounded-md font-semibold"
            style={{ background: '#1A0A3B', color: '#fff' }}>
            Exportar CSV
          </a>
        </div>
        <div className="flex gap-2 mt-3 flex-wrap">
          <button onClick={() => applyQuickRange(1)}    className="text-[10px] px-2 py-1 rounded-full" style={{ border: '1px solid #E8E3F5' }}>Hoy</button>
          <button onClick={() => applyQuickRange(7)}    className="text-[10px] px-2 py-1 rounded-full" style={{ border: '1px solid #E8E3F5' }}>7 días</button>
          <button onClick={() => applyQuickRange(30)}   className="text-[10px] px-2 py-1 rounded-full" style={{ border: '1px solid #E8E3F5' }}>30 días</button>
          <button onClick={() => applyQuickRange('month')} className="text-[10px] px-2 py-1 rounded-full" style={{ border: '1px solid #E8E3F5' }}>Este mes</button>
          <button onClick={() => applyQuickRange('all')}   className="text-[10px] px-2 py-1 rounded-full" style={{ border: '1px solid #E8E3F5' }}>Todo</button>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <SummaryCard title="Minutos" total={summary.minutesTotal} byKind={summary.minutesByKind} unit="min" />
        <SummaryCard title="Tareas"  total={summary.opsTotal}     byKind={summary.opsByKind}     unit="tareas" />
      </div>

      {/* Ledger table */}
      <div className="rounded-lg overflow-x-auto" style={{ background: '#fff', border: '1px solid #E8E3F5' }}>
        <table className="w-full text-[12px]">
          <thead style={{ background: '#FAFAFB' }}>
            <tr>
              <th className="p-2 text-left">Fecha</th>
              <th className="p-2 text-left">Recurso</th>
              <th className="p-2 text-left">Tipo de movimiento</th>
              <th className="p-2 text-right">Monto</th>
              <th className="p-2 text-right">Saldo acumulado</th>
              <th className="p-2 text-left">Referencia técnica</th>
              <th className="p-2 text-left">Descripción</th>
            </tr>
          </thead>
          <tbody>
            {summary.entries.length === 0 && (
              <tr><td colSpan={7} className="p-4 text-center opacity-60">Sin movimientos en este rango</td></tr>
            )}
            {summary.entries.map(e => (
              <tr key={e.id} style={{ borderTop: '1px solid #F0EDF9' }}>
                <td className="p-2 tabular-nums">{fmtDateTime(e.created_at)}</td>
                <td className="p-2">
                  {e.ledger_type.startsWith('minutes') ? 'Minutos' : 'Tareas'}
                  {e.archived && <span className="ml-1 text-[10px] opacity-60">(histórico)</span>}
                </td>
                <td className="p-2">{labelKind(e.kind)}</td>
                <td className="p-2 text-right tabular-nums font-semibold" style={{ color: e.amount < 0 ? '#dc2626' : '#16a34a' }}>
                  {e.amount > 0 ? '+' : ''}{e.amount}
                </td>
                <td className="p-2 text-right tabular-nums opacity-70">{(e as { balance: number }).balance}</td>
                <td className="p-2 font-mono text-[10px] opacity-70">{e.reference_id ?? '—'}</td>
                <td className="p-2 opacity-80">{e.description ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-[10px] opacity-60">
        Fechas mostradas en zona horaria México. El CSV descargable incluye timestamps completos (UTC).
        Aparecen tanto los movimientos actuales como los que ya fueron archivados (se conservan 7 años por retención legal).
      </p>
    </div>
  );
}

function SummaryCard({ title, total, byKind, unit }: { title: string; total: number; byKind: Record<string, number>; unit: string }) {
  const kinds = Object.entries(byKind).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).slice(0, 8);
  return (
    <div className="rounded-lg p-4" style={{ background: '#fff', border: '1px solid #E8E3F5' }}>
      <div className="text-[10px] font-bold uppercase tracking-wider opacity-60">{title}</div>
      <div className="text-2xl font-bold mt-1 tabular-nums" style={{ color: total < 0 ? '#dc2626' : '#16a34a' }}>
        {total > 0 ? '+' : ''}{total} {unit}
      </div>
      <div className="text-[10px] opacity-60 mt-1">Cambio neto en este rango</div>
      <div className="mt-3 flex flex-col gap-1">
        {kinds.map(([k, v]) => (
          <div key={k} className="flex justify-between text-[11px]">
            <span>{labelKind(k)}</span>
            <span className="tabular-nums font-semibold" style={{ color: v < 0 ? '#dc2626' : '#16a34a' }}>
              {v > 0 ? '+' : ''}{v}
            </span>
          </div>
        ))}
        {kinds.length === 0 && <div className="text-[11px] opacity-50">—</div>}
      </div>
    </div>
  );
}
