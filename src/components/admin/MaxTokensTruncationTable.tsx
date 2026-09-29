'use client';

import type { TruncationStats } from '@/lib/monitoring/max-tokens-truncation';

export function MaxTokensTruncationTable({ stats, windowLabel }: { stats: TruncationStats[]; windowLabel: string }) {
  if (stats.length === 0) {
    return (
      <div className="rounded-lg border p-4 text-sm" style={{ borderColor: '#E8E3F5', background: '#FFFFFF', color: '#6B6480' }}>
        Sin turnos de voz en la ventana {windowLabel}.
      </div>
    );
  }

  return (
    <div className="rounded-lg overflow-hidden border" style={{ borderColor: '#E8E3F5', background: '#FFFFFF' }}>
      <table className="w-full text-sm">
        <thead className="text-xs uppercase tracking-wide" style={{ background: '#FAFAFB', color: '#6B6480' }}>
          <tr>
            <th className="text-left px-4 py-3">Rol</th>
            <th className="text-left px-4 py-3">Modelo</th>
            <th className="text-right px-4 py-3">Turnos</th>
            <th className="text-right px-4 py-3">Truncados</th>
            <th className="text-right px-4 py-3">% truncado</th>
            <th className="text-left px-4 py-3">Estado</th>
          </tr>
        </thead>
        <tbody style={{ color: '#1A0A3B' }}>
          {stats.map((s, i) => (
            <tr key={`${s.role}-${s.model}-${i}`} className="border-t" style={{ borderColor: '#F0EBFA' }}>
              <td className="px-4 py-3 font-medium">{s.role ?? '(sin rol)'}</td>
              <td className="px-4 py-3 font-mono text-xs" style={{ color: '#4A3B6B' }}>{s.model}</td>
              <td className="px-4 py-3 text-right">{s.total_turns}</td>
              <td className="px-4 py-3 text-right">{s.max_tokens_turns}</td>
              <td className="px-4 py-3 text-right font-mono">{(s.ratio * 100).toFixed(1)}%</td>
              <td className="px-4 py-3">
                <LevelBadge level={s.level} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="px-4 py-2 text-[11px] border-t" style={{ borderColor: '#F0EBFA', background: '#FAFBFF', color: '#6B6480' }}>
        Ventana: {windowLabel} · Umbrales: verde &lt; 2% · amarillo 2-5% · rojo ≥ 5% · muestra mínima: 10 turnos
      </div>
    </div>
  );
}

function LevelBadge({ level }: { level: 'ok' | 'warn' | 'critical' }) {
  const cfg = {
    ok:       { bg: '#DCFCE7', fg: '#166534', label: 'OK' },
    warn:     { bg: '#FEF3C7', fg: '#92400E', label: 'Aviso' },
    critical: { bg: '#FEE2E2', fg: '#991B1B', label: 'Crítico' },
  }[level];
  return (
    <span className="inline-block px-2 py-0.5 rounded text-xs font-medium" style={{ background: cfg.bg, color: cfg.fg }}>
      {cfg.label}
    </span>
  );
}
