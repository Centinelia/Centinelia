'use client';

import { useEffect, useState, useTransition } from 'react';
import type { ToolMetricRow, ToolMetricWindow } from '@/lib/observability/tool-metrics';

const WINDOWS: { value: ToolMetricWindow; label: string }[] = [
  { value: '1h',  label: '1h' },
  { value: '24h', label: '24h' },
  { value: '7d',  label: '7 días' },
  { value: '30d', label: '30 días' },
];

const CHANNELS = ['', 'voice', 'chat', 'email', 'cron', 'delegate', 'consult'];

export function ToolMetricsView() {
  const [win,     setWin]     = useState<ToolMetricWindow>('24h');
  const [channel, setChannel] = useState<string>('');
  const [rows,    setRows]    = useState<ToolMetricRow[]>([]);
  const [error,   setError]   = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
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
  }, [win, channel]);

  const fmtPct = (n: number | null) => n == null ? '—' : `${(n * 100).toFixed(1)}%`;
  const fmtMs  = (n: number | null) => n == null ? '—' : `${Math.round(n)}ms`;
  const trunc  = (s: string | null, n = 60) => !s ? '—' : (s.length > n ? s.slice(0, n) + '…' : s);

  return (
    <div>
      <div className="flex flex-wrap gap-3 mb-4 items-center text-sm">
        <label className="flex items-center gap-2">
          <span style={{ color: 'var(--c-text-2)' }}>Ventana</span>
          <select
            value={win}
            onChange={e => setWin(e.target.value as ToolMetricWindow)}
            className="px-2 py-1 rounded border"
            style={{ background: 'transparent', borderColor: 'rgba(255,255,255,0.15)', color: 'var(--c-text)' }}
          >
            {WINDOWS.map(w => <option key={w.value} value={w.value}>{w.label}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-2">
          <span style={{ color: 'var(--c-text-2)' }}>Canal</span>
          <select
            value={channel}
            onChange={e => setChannel(e.target.value)}
            className="px-2 py-1 rounded border"
            style={{ background: 'transparent', borderColor: 'rgba(255,255,255,0.15)', color: 'var(--c-text)' }}
          >
            {CHANNELS.map(c => <option key={c} value={c}>{c || 'Todos'}</option>)}
          </select>
        </label>
        {pending && <span style={{ color: 'var(--c-text-2)' }}>Cargando…</span>}
      </div>

      {error && (
        <div className="p-3 rounded mb-4 text-sm" style={{ background: 'rgba(255,80,80,0.1)', color: '#ff7070' }}>
          {error}
        </div>
      )}

      <div className="overflow-x-auto rounded border" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
        <table className="w-full text-sm">
          <thead style={{ background: 'rgba(255,255,255,0.03)' }}>
            <tr style={{ color: 'var(--c-text-2)' }}>
              <th className="text-left px-3 py-2 font-medium">Tool</th>
              <th className="text-left px-3 py-2 font-medium">Canal</th>
              <th className="text-right px-3 py-2 font-medium">Llamadas</th>
              <th className="text-right px-3 py-2 font-medium">OK rate</th>
              <th className="text-right px-3 py-2 font-medium">p50</th>
              <th className="text-right px-3 py-2 font-medium">p95</th>
              <th className="text-right px-3 py-2 font-medium">Errores</th>
              <th className="text-left px-3 py-2 font-medium">Último error</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={`${r.tool_name}::${r.channel}`} style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                <td className="px-3 py-2 font-mono">{r.tool_name}</td>
                <td className="px-3 py-2">{r.channel}</td>
                <td className="px-3 py-2 text-right">{r.calls.toLocaleString()}</td>
                <td className="px-3 py-2 text-right" style={{ color: r.ok_rate != null && r.ok_rate < 0.9 ? '#ff7070' : undefined }}>
                  {fmtPct(r.ok_rate)}
                </td>
                <td className="px-3 py-2 text-right">{fmtMs(r.latency_p50)}</td>
                <td className="px-3 py-2 text-right" style={{ color: r.latency_p95 != null && r.latency_p95 > 15_000 ? '#ff7070' : undefined }}>
                  {fmtMs(r.latency_p95)}
                </td>
                <td className="px-3 py-2 text-right">{r.err_count}</td>
                <td className="px-3 py-2 text-xs" style={{ color: 'var(--c-text-2)' }}>{trunc(r.last_error)}</td>
              </tr>
            ))}
            {rows.length === 0 && !pending && (
              <tr><td colSpan={8} className="text-center px-3 py-6" style={{ color: 'var(--c-text-2)' }}>Sin datos en la ventana seleccionada.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
