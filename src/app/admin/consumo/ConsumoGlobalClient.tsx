'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { BarChart3, ArrowRight, Download } from 'lucide-react';
import { labelBilling } from '@/lib/admin/consumo-labels';
import type { OrgConsumo } from './page';

interface Totals {
  minutes_consumed: number;
  ops_consumed:     number;
  minutes_credited: number;
  ops_credited:     number;
  ledger_rows:      number;
  active_orgs:      number;
}

interface Props {
  rows:      OrgConsumo[];
  totals:    Totals;
  fromDate:  string;
  toDate:    string;
  sortKey:   string;
  csvHref:   string;
}

const SORT_OPTIONS: Array<{ key: keyof OrgConsumo; label: string }> = [
  { key: 'minutes_consumed', label: 'Más minutos usados' },
  { key: 'ops_consumed',     label: 'Más tareas usadas' },
  { key: 'ledger_rows',      label: 'Más movimientos' },
  { key: 'agents_count',     label: 'Más empleados activos' },
  { key: 'name',             label: 'Nombre (A a Z)' },
];

function fmtDate(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('es-MX', {
    day: '2-digit', month: 'short', year: 'numeric', timeZone: 'America/Mexico_City',
  });
}

function fmtNum(n: number) {
  return n.toLocaleString('es-MX');
}

export default function ConsumoGlobalClient({ rows, totals, fromDate, toDate, sortKey, csvHref }: Props) {
  const router = useRouter();
  const [from, setFrom] = useState(fromDate);
  const [to,   setTo]   = useState(toDate);
  const [sort, setSort] = useState(sortKey);

  const applyFilters = () => {
    const qs = new URLSearchParams();
    if (from) qs.set('from', from);
    if (to)   qs.set('to',   to);
    if (sort && sort !== 'minutes_consumed') qs.set('sort', sort);
    router.push(`?${qs.toString()}`);
  };

  const clearFilters = () => {
    setFrom(''); setTo(''); setSort('minutes_consumed');
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
            <label className="block text-[10px] font-bold uppercase tracking-wider mb-1 opacity-60">Ordenar por</label>
            <select value={sort} onChange={e => setSort(e.target.value)}
              className="text-[12px] px-3 py-2 rounded-md" style={{ border: '1px solid #E8E3F5' }}>
              {SORT_OPTIONS.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
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
            className="inline-flex items-center gap-1.5 text-[12px] px-4 py-2 rounded-md font-semibold"
            style={{ background: '#1A0A3B', color: '#fff' }}>
            <Download size={13} />
            Exportar CSV global
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

      {/* Totales globales */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <SummaryCard title="Minutos usados por los clientes" value={-totals.minutes_consumed} unit="min"    color="#dc2626" />
        <SummaryCard title="Tareas usadas por los clientes"  value={-totals.ops_consumed}     unit="tareas" color="#dc2626" />
        <SummaryCard title="Minutos que les acreditamos"     value={+totals.minutes_credited} unit="min"    color="#16a34a" />
        <SummaryCard title="Tareas que les acreditamos"      value={+totals.ops_credited}     unit="tareas" color="#16a34a" />
      </div>

      {/* Tabla clientes */}
      <div className="rounded-lg overflow-x-auto" style={{ background: '#fff', border: '1px solid #E8E3F5' }}>
        <table className="w-full text-[12px]">
          <thead style={{ background: '#FAFAFB' }}>
            <tr>
              <th className="p-2 text-left">Cliente</th>
              <th className="p-2 text-left">Facturación</th>
              <th className="p-2 text-right">Minutos usados</th>
              <th className="p-2 text-right">Minutos acreditados</th>
              <th className="p-2 text-right">Tareas usadas</th>
              <th className="p-2 text-right">Tareas acreditadas</th>
              <th className="p-2 text-right">Empleados activos</th>
              <th className="p-2 text-left">Última actividad</th>
              <th className="p-2 text-right">Ver historial</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={9} className="p-4 text-center opacity-60">Todavía no hay clientes en la base</td></tr>
            )}
            {rows.map(r => (
              <tr key={r.portal_email} style={{ borderTop: '1px solid #F0EDF9' }}>
                <td className="p-2">
                  <div className="font-semibold">{r.name}</div>
                  <div className="text-[10px] opacity-60 font-mono">{r.portal_email}</div>
                </td>
                <td className="p-2">
                  <span className="text-[10px] px-1.5 py-0.5 rounded"
                    style={{
                      background: r.billing_model === 'annual_prepaid' ? '#EDE9FE' : r.billing_model === 'expired' ? '#FEE2E2' : '#F0FDF4',
                      color:      r.billing_model === 'annual_prepaid' ? '#6C3BFF' : r.billing_model === 'expired' ? '#dc2626' : '#16a34a',
                    }}>
                    {labelBilling(r.billing_model)}
                  </span>
                </td>
                <td className="p-2 text-right tabular-nums" style={{ color: r.minutes_consumed > 0 ? '#dc2626' : '#6B6480' }}>
                  {r.minutes_consumed > 0 ? `-${fmtNum(r.minutes_consumed)}` : '—'}
                </td>
                <td className="p-2 text-right tabular-nums" style={{ color: r.minutes_credited > 0 ? '#16a34a' : '#6B6480' }}>
                  {r.minutes_credited > 0 ? `+${fmtNum(r.minutes_credited)}` : '—'}
                </td>
                <td className="p-2 text-right tabular-nums" style={{ color: r.ops_consumed > 0 ? '#dc2626' : '#6B6480' }}>
                  {r.ops_consumed > 0 ? `-${fmtNum(r.ops_consumed)}` : '—'}
                </td>
                <td className="p-2 text-right tabular-nums" style={{ color: r.ops_credited > 0 ? '#16a34a' : '#6B6480' }}>
                  {r.ops_credited > 0 ? `+${fmtNum(r.ops_credited)}` : '—'}
                </td>
                <td className="p-2 text-right tabular-nums">{r.agents_count}</td>
                <td className="p-2 tabular-nums">{fmtDate(r.last_activity)}</td>
                <td className="p-2 text-right">
                  <Link href={`/admin/consumo/${encodeURIComponent(r.portal_email)}${from || to ? `?${new URLSearchParams({ ...(from ? { from } : {}), ...(to ? { to } : {}) }).toString()}` : ''}`}
                    className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-md font-semibold"
                    style={{ background: '#1A0A3B', color: '#fff' }}>
                    Abrir <ArrowRight size={11} />
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-[10px] opacity-60 flex items-center gap-1">
        <BarChart3 size={11} />
        Los rangos de fecha se aplican en horario de México. Los números en rojo son consumo; en verde son cargas o compras.
        El CSV descargable guarda las fechas completas (UTC) para respaldos y auditorías.
      </p>
    </div>
  );
}

function SummaryCard({ title, value, unit, color }: { title: string; value: number; unit: string; color: string }) {
  return (
    <div className="rounded-lg p-4" style={{ background: '#fff', border: '1px solid #E8E3F5' }}>
      <div className="text-[10px] font-bold uppercase tracking-wider opacity-60">{title}</div>
      <div className="text-2xl font-bold mt-1 tabular-nums" style={{ color }}>
        {value > 0 ? '+' : ''}{fmtNum(value)} {unit}
      </div>
    </div>
  );
}
