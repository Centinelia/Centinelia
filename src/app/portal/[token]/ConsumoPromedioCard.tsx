'use client';

import { useState } from 'react';

interface Stats {
  perDay:   number | string;
  perWeek:  number | string;
  perMonth: number | string;
  monthHighlight?: boolean;
}

interface Props {
  minutos?: Stats;    // omitir si no hay llamadas
  tareas?:  Stats;    // omitir si no hay ops limit/uso
}

/**
 * Card "Consumo promedio" con toggle Minutos ↔ Tareas.
 * Cada pestaña muestra 3 métricas (por día · por semana · por mes).
 * Si solo hay un set de datos, la otra pestaña queda deshabilitada.
 */
export default function ConsumoPromedioCard({ minutos, tareas }: Props) {
  const hasMin  = !!minutos;
  const hasOps  = !!tareas;
  const [tab, setTab] = useState<'minutos' | 'tareas'>(hasMin ? 'minutos' : 'tareas');

  if (!hasMin && !hasOps) return null;

  const activeStats = tab === 'minutos' ? minutos : tareas;
  const unit        = tab === 'minutos' ? ' min' : '';

  return (
    <div
      id="consumo-promedio"
      className="flex flex-col rounded-2xl overflow-hidden"
      style={{ background: '#ffffff', border: '1px solid #E8E3F5', boxShadow: '0 1px 2px rgba(26,10,59,0.04)' }}
    >
      <div className="flex items-start justify-between gap-3 flex-wrap px-6 pt-5 pb-4">
        <div>
          <h2 className="text-[17px] font-bold tracking-tight" style={{ color: '#1A0A3B' }}>Consumo promedio</h2>
          <p className="text-[12px] mt-1" style={{ color: '#6B6480' }}>Tu ritmo de uso vs el plan mensual.</p>
        </div>
        {/* Toggle pill Minutos ↔ Tareas */}
        <div
          className="inline-flex items-center gap-0.5 p-0.5 rounded-lg"
          style={{ background: '#F0EDF9' }}
        >
          <button
            type="button"
            onClick={() => hasMin && setTab('minutos')}
            disabled={!hasMin}
            aria-pressed={tab === 'minutos'}
            className="px-3 py-1 rounded-md text-[11px] font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            style={{
              background: tab === 'minutos' ? '#ffffff' : 'transparent',
              color:      tab === 'minutos' ? '#1A0A3B' : '#6B6480',
              boxShadow:  tab === 'minutos' ? '0 1px 2px rgba(26,10,59,0.06)' : 'none',
              cursor:     hasMin ? 'pointer' : 'not-allowed',
            }}
          >
            Minutos
          </button>
          <button
            type="button"
            onClick={() => hasOps && setTab('tareas')}
            disabled={!hasOps}
            aria-pressed={tab === 'tareas'}
            className="px-3 py-1 rounded-md text-[11px] font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            style={{
              background: tab === 'tareas' ? '#ffffff' : 'transparent',
              color:      tab === 'tareas' ? '#1A0A3B' : '#6B6480',
              boxShadow:  tab === 'tareas' ? '0 1px 2px rgba(26,10,59,0.06)' : 'none',
              cursor:     hasOps ? 'pointer' : 'not-allowed',
            }}
          >
            Tareas
          </button>
        </div>
      </div>

      {activeStats && (
        <div className="px-6 py-4 grid grid-cols-3 gap-4" style={{ borderTop: '1px solid #F0EDF9' }}>
          <StatBox label="Por día"    value={`${activeStats.perDay}${unit}`} />
          <StatBox label="Por semana" value={`${activeStats.perWeek}${unit}`} />
          <StatBox label="Por mes"    value={`${activeStats.perMonth}${unit}`} highlight={activeStats.monthHighlight} />
        </div>
      )}
    </div>
  );
}

function StatBox({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  const match = value.match(/^([\d.,]+)\s*(.*)$/);
  const num  = match?.[1] ?? value;
  const unit = match?.[2] ?? '';
  return (
    <div className="flex flex-col gap-1 py-2">
      <div className="flex items-baseline gap-1">
        <span
          className="text-[28px] font-bold leading-none tabular-nums tracking-tight"
          style={{ color: highlight ? '#ef4444' : '#1A0A3B' }}
        >
          {num}
        </span>
        {unit && (
          <span className="text-[12px] font-medium" style={{ color: '#9B8FB5' }}>
            {unit}
          </span>
        )}
      </div>
      <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: '#9B8FB5' }}>
        {label}
      </p>
    </div>
  );
}
