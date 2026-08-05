'use client';

import { useEffect, useState, useTransition } from 'react';
import { RefreshCw, Zap } from 'lucide-react';
import type { ToolMetricRow, ToolMetricWindow } from '@/lib/observability/tool-metrics';

const WINDOWS: { value: ToolMetricWindow; label: string }[] = [
  { value: '1h',  label: '1 hora' },
  { value: '24h', label: '24 horas' },
  { value: '7d',  label: '7 días' },
  { value: '30d', label: '30 días' },
];

const CHANNELS = ['', 'voice', 'chat', 'email', 'cron', 'delegate', 'consult'];

const selectStyle = {
  background: '#FFFFFF',
  border: '1px solid #E5E7EB',
  color: '#111827',
  padding: '6px 10px',
  borderRadius: '8px',
  fontSize: '13px',
} as const;

export function ToolMetricsView() {
  const [win,     setWin]     = useState<ToolMetricWindow>('24h');
  const [channel, setChannel] = useState<string>('');
  const [rows,    setRows]    = useState<ToolMetricRow[]>([]);
  const [error,   setError]   = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const reload = () => {
    const params = new URLSearchParams({ window: win });
    if (channel) params.set('channel', channel);
    startTransition(async () => {
      setError(null);
      try {
        const res = await fetch(`/api/admin/observabilidad/tools?${params.toString()}`, { cache: 'no-store' });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? 'fetch failed');
        setRows(json.rows ?? []);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    });
  };

  useEffect(reload, [win, channel]);

  const fmtPct = (n: number | null) => n == null ? '—' : `${(n * 100).toFixed(1)}%`;
  const fmtMs  = (n: number | null) => n == null ? '—' : `${Math.round(n)}ms`;
  const trunc  = (s: string | null, n = 60) => !s ? '—' : (s.length > n ? s.slice(0, n) + '…' : s);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex flex-wrap gap-3 items-center">
          <label className="flex items-center gap-2 text-[13px]">
            <span style={{ color: '#6B7280' }}>Ventana</span>
            <select value={win} onChange={e => setWin(e.target.value as ToolMetricWindow)} style={selectStyle}>
              {WINDOWS.map(w => <option key={w.value} value={w.value}>{w.label}</option>)}
            </select>
          </label>
          <label className="flex items-center gap-2 text-[13px]">
            <span style={{ color: '#6B7280' }}>Canal</span>
            <select value={channel} onChange={e => setChannel(e.target.value)} style={selectStyle}>
              {CHANNELS.map(c => <option key={c} value={c}>{c || 'Todos'}</option>)}
            </select>
          </label>
        </div>
        <button
          onClick={reload}
          disabled={pending}
          className="inline-flex items-center gap-1.5 text-[13px] font-medium px-3 py-1.5 rounded-lg"
          style={{ color: '#374151', border: '1px solid #E5E7EB', background: '#FFFFFF' }}
        >
          <RefreshCw size={13} className={pending ? 'animate-spin' : ''} />
          Actualizar
        </button>
      </div>

      {error && (
        <div className="p-4 rounded-xl text-sm" style={{ background: '#FEF2F2', color: '#B91C1C', border: '1px solid #FECACA' }}>
          {error}
        </div>
      )}

      <div className="rounded-xl overflow-hidden bg-white" style={{ border: '1px solid #E5E7EB', boxShadow: '0 1px 3px 0 rgb(0 0 0 / 0.05)' }}>
        <table className="w-full text-[13px]">
          <thead style={{ background: '#F9FAFB' }}>
            <tr>
              <th className="text-left px-4 py-3 text-[11px] uppercase tracking-wider font-medium" style={{ color: '#6B7280' }}>Tool</th>
              <th className="text-left px-4 py-3 text-[11px] uppercase tracking-wider font-medium" style={{ color: '#6B7280' }}>Canal</th>
              <th className="text-right px-4 py-3 text-[11px] uppercase tracking-wider font-medium" style={{ color: '#6B7280' }}>Llamadas</th>
              <th className="text-right px-4 py-3 text-[11px] uppercase tracking-wider font-medium" style={{ color: '#6B7280' }}>OK rate</th>
              <th className="text-right px-4 py-3 text-[11px] uppercase tracking-wider font-medium" style={{ color: '#6B7280' }}>p50</th>
              <th className="text-right px-4 py-3 text-[11px] uppercase tracking-wider font-medium" style={{ color: '#6B7280' }}>p95</th>
              <th className="text-right px-4 py-3 text-[11px] uppercase tracking-wider font-medium" style={{ color: '#6B7280' }}>Errores</th>
              <th className="text-left px-4 py-3 text-[11px] uppercase tracking-wider font-medium" style={{ color: '#6B7280' }}>Último error</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const okLow  = r.ok_rate != null && r.ok_rate < 0.9;
              const p95Bad = r.latency_p95 != null && r.latency_p95 > 15_000;
              return (
                <tr key={`${r.tool_name}::${r.channel}`} className="transition-colors hover:bg-gray-50" style={{ borderTop: i > 0 ? '1px solid #F3F4F6' : undefined }}>
                  <td className="px-4 py-2.5 font-mono" style={{ color: '#111827' }}>{r.tool_name}</td>
                  <td className="px-4 py-2.5">
                    <ChannelPill channel={r.channel} />
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums" style={{ color: '#111827' }}>{r.calls.toLocaleString()}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums font-medium" style={{ color: okLow ? '#B91C1C' : '#047857' }}>
                    {fmtPct(r.ok_rate)}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums" style={{ color: '#6B7280' }}>{fmtMs(r.latency_p50)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums font-medium" style={{ color: p95Bad ? '#B91C1C' : '#374151' }}>
                    {fmtMs(r.latency_p95)}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums" style={{ color: r.err_count > 0 ? '#B91C1C' : '#9CA3AF' }}>
                    {r.err_count}
                  </td>
                  <td className="px-4 py-2.5 text-[12px] font-mono truncate" style={{ color: '#9CA3AF', maxWidth: '280px' }}>{trunc(r.last_error)}</td>
                </tr>
              );
            })}
            {rows.length === 0 && !pending && (
              <tr>
                <td colSpan={8} className="text-center px-4 py-10">
                  <Zap size={20} style={{ color: '#D1D5DB', margin: '0 auto 8px' }} />
                  <p className="text-[13px]" style={{ color: '#6B7280' }}>Sin datos en la ventana seleccionada.</p>
                  <p className="text-[12px] mt-1" style={{ color: '#9CA3AF' }}>Cambia la ventana o el canal, o espera actividad.</p>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ChannelPill({ channel }: { channel: string }) {
  const colors: Record<string, { bg: string; fg: string; border: string }> = {
    voice:    { bg: '#F3F0FF', fg: '#7C3AED', border: '#DDD6FE' },
    chat:     { bg: '#EFF6FF', fg: '#2563EB', border: '#BFDBFE' },
    email:    { bg: '#ECFDF5', fg: '#047857', border: '#A7F3D0' },
    cron:     { bg: '#FEF3C7', fg: '#B45309', border: '#FDE68A' },
    delegate: { bg: '#FCE7F3', fg: '#BE185D', border: '#FBCFE8' },
    consult:  { bg: '#DBEAFE', fg: '#1D4ED8', border: '#BFDBFE' },
  };
  const c = colors[channel] ?? { bg: '#F3F4F6', fg: '#4B5563', border: '#E5E7EB' };
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-md text-[12px] font-medium"
      style={{ background: c.bg, color: c.fg, border: `1px solid ${c.border}` }}
    >
      {channel}
    </span>
  );
}
