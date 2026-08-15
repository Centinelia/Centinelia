'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { marked } from 'marked';
import { labelKind } from '@/lib/admin/consumo-labels';
import type { LedgerEntry } from './page';

marked.setOptions({ breaks: true, gfm: true });

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

function DescriptionCell({ text }: { text: string | null }) {
  const [open, setOpen] = useState(false);
  if (!text) return <span className="opacity-40">—</span>;
  const isLong = text.length > 180;
  const shown = open || !isLong ? text : `${text.slice(0, 180).trimEnd()}…`;
  const html = marked.parse(shown, { async: false }) as string;
  return (
    <div className="min-w-0">
      <div
        className="admin-md text-[12px] leading-snug"
        dangerouslySetInnerHTML={{ __html: html }}
      />
      {isLong && (
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          className="mt-1 text-[10px] font-semibold underline underline-offset-2 opacity-70 hover:opacity-100"
          style={{ color: '#6C3BFF' }}
        >
          {open ? 'Ver menos' : 'Ver más'}
        </button>
      )}
    </div>
  );
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
    <>
      {/* Estilos de markdown para descripciones (scoped a .admin-md) */}
      <style jsx global>{`
        .admin-md p        { margin: 0 0 4px 0; }
        .admin-md p:last-child { margin-bottom: 0; }
        .admin-md strong   { font-weight: 600; color: #1A0A3B; }
        .admin-md em       { font-style: italic; }
        .admin-md ul, .admin-md ol { margin: 4px 0 4px 18px; padding: 0; }
        .admin-md li       { margin: 2px 0; }
        .admin-md code     { background: #F0EDF9; padding: 1px 4px; border-radius: 3px; font-size: 11px; font-family: ui-monospace, monospace; }
        .admin-md pre      { background: #F0EDF9; padding: 6px 8px; border-radius: 4px; overflow-x: auto; margin: 4px 0; }
        .admin-md h1, .admin-md h2, .admin-md h3 { font-size: 12px; font-weight: 700; margin: 6px 0 2px 0; color: #1A0A3B; }
        .admin-md a        { color: #6C3BFF; text-decoration: underline; }
      `}</style>

      <div className="flex gap-6 items-start">
        {/* MAIN — tabla scrolleable */}
        <div className="flex-1 min-w-0">
          <div className="rounded-lg overflow-hidden" style={{ background: '#fff', border: '1px solid #E8E3F5' }}>
            <div className="overflow-x-auto">
              <table className="w-full text-[12px]">
                <thead style={{ background: '#FAFAFB', position: 'sticky', top: 0, zIndex: 1 }}>
                  <tr>
                    <th className="p-2 text-left whitespace-nowrap">Fecha</th>
                    <th className="p-2 text-left whitespace-nowrap">Qué es</th>
                    <th className="p-2 text-left whitespace-nowrap">Movimiento</th>
                    <th className="p-2 text-right whitespace-nowrap">Cambio</th>
                    <th className="p-2 text-right whitespace-nowrap">Saldo</th>
                    <th className="p-2 text-left" style={{ minWidth: 320 }}>Detalle</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.entries.length === 0 && (
                    <tr><td colSpan={6} className="p-4 text-center opacity-60">Sin movimientos en este rango</td></tr>
                  )}
                  {summary.entries.map(e => (
                    <tr key={e.id} style={{ borderTop: '1px solid #F0EDF9', verticalAlign: 'top' }}>
                      <td className="p-2 tabular-nums whitespace-nowrap">{fmtDateTime(e.created_at)}</td>
                      <td className="p-2 whitespace-nowrap">
                        {e.ledger_type.startsWith('minutes') ? 'Minutos' : 'Tareas'}
                        {e.archived && <span className="ml-1 text-[10px] opacity-60">(histórico)</span>}
                      </td>
                      <td className="p-2 whitespace-nowrap">{labelKind(e.kind)}</td>
                      <td className="p-2 text-right tabular-nums font-semibold whitespace-nowrap" style={{ color: e.amount < 0 ? '#dc2626' : '#16a34a' }}>
                        {e.amount > 0 ? '+' : ''}{e.amount}
                      </td>
                      <td className="p-2 text-right tabular-nums opacity-70 whitespace-nowrap">{(e as { balance: number }).balance}</td>
                      <td className="p-2">
                        <DescriptionCell text={e.description} />
                        {e.reference_id && (
                          <div className="mt-1 font-mono text-[10px] opacity-40" title="ID interno del origen (llamada Vapi, factura Stripe, etc.)">
                            {e.reference_id}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <p className="text-[10px] opacity-60 mt-3 max-w-3xl">
            Fechas en horario de México. Rojos = consumo. Verdes = cargas o compras.
            Se listan movimientos vigentes y archivados (retención 7 años).
          </p>
        </div>

        {/* SIDEBAR — controles + totales, sticky durante el scroll */}
        <aside className="w-[300px] flex-shrink-0 sticky top-6 flex flex-col gap-3">
          {/* Totales */}
          <SidebarSummaryCard title="Minutos" total={summary.minutesTotal} byKind={summary.minutesByKind} unit="min" />
          <SidebarSummaryCard title="Tareas"  total={summary.opsTotal}     byKind={summary.opsByKind}     unit="tareas" />

          {/* Filtros */}
          <div className="rounded-lg p-4 flex flex-col gap-3" style={{ background: '#fff', border: '1px solid #E8E3F5' }}>
            <div className="text-[10px] font-bold uppercase tracking-wider opacity-60">Filtros</div>

            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider mb-1 opacity-60">Desde</label>
              <input type="date" value={from} onChange={e => setFrom(e.target.value)}
                className="text-[12px] px-3 py-2 rounded-md w-full" style={{ border: '1px solid #E8E3F5' }} />
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider mb-1 opacity-60">Hasta</label>
              <input type="date" value={to} onChange={e => setTo(e.target.value)}
                className="text-[12px] px-3 py-2 rounded-md w-full" style={{ border: '1px solid #E8E3F5' }} />
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider mb-1 opacity-60">Tipo de movimiento</label>
              <select value={kind} onChange={e => setKind(e.target.value)}
                className="text-[12px] px-3 py-2 rounded-md w-full bg-white" style={{ border: '1px solid #E8E3F5' }}>
                <option value="">Todos los movimientos</option>
                {uniqueKinds.map(k => <option key={k} value={k}>{labelKind(k)}</option>)}
              </select>
            </div>

            <div className="flex flex-wrap gap-1 pt-1">
              <QuickBtn onClick={() => applyQuickRange(1)}>Hoy</QuickBtn>
              <QuickBtn onClick={() => applyQuickRange(7)}>7 días</QuickBtn>
              <QuickBtn onClick={() => applyQuickRange(30)}>30 días</QuickBtn>
              <QuickBtn onClick={() => applyQuickRange('month')}>Este mes</QuickBtn>
              <QuickBtn onClick={() => applyQuickRange('all')}>Todo</QuickBtn>
            </div>

            <div className="flex gap-2 pt-1">
              <button onClick={applyFilters}
                className="flex-1 text-[12px] px-3 py-2 rounded-md font-semibold"
                style={{ background: '#6C3BFF', color: '#fff' }}>
                Aplicar
              </button>
              <button onClick={clearFilters}
                className="text-[12px] px-3 py-2 rounded-md" style={{ border: '1px solid #E8E3F5' }}>
                Limpiar
              </button>
            </div>
          </div>

          {/* Export */}
          <a href={csvHref} download
            className="text-[12px] px-4 py-2 rounded-md font-semibold text-center"
            style={{ background: '#1A0A3B', color: '#fff' }}>
            Exportar CSV
          </a>
        </aside>
      </div>
    </>
  );
}

function QuickBtn({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="text-[10px] px-2 py-1 rounded-full"
      style={{ border: '1px solid #E8E3F5' }}
    >
      {children}
    </button>
  );
}

function SidebarSummaryCard({ title, total, byKind, unit }: { title: string; total: number; byKind: Record<string, number>; unit: string }) {
  const kinds = Object.entries(byKind).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).slice(0, 6);
  return (
    <div className="rounded-lg p-4" style={{ background: '#fff', border: '1px solid #E8E3F5' }}>
      <div className="text-[10px] font-bold uppercase tracking-wider opacity-60">{title}</div>
      <div className="text-2xl font-bold mt-1 tabular-nums" style={{ color: total < 0 ? '#dc2626' : '#16a34a' }}>
        {total > 0 ? '+' : ''}{total} {unit}
      </div>
      <div className="text-[10px] opacity-60 mt-0.5">Cambio neto en el rango</div>
      {kinds.length > 0 && (
        <div className="mt-3 flex flex-col gap-1">
          {kinds.map(([k, v]) => (
            <div key={k} className="flex justify-between text-[11px] gap-2">
              <span className="truncate opacity-80">{labelKind(k)}</span>
              <span className="tabular-nums font-semibold flex-shrink-0" style={{ color: v < 0 ? '#dc2626' : '#16a34a' }}>
                {v > 0 ? '+' : ''}{v}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
