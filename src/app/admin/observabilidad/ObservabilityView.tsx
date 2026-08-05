'use client';

import { useEffect, useState, useTransition } from 'react';
import type { MeerkatObservabilityRow, ObsWindow } from './types';

interface Props {
  meerkatIds: string[];
  flagKeys:   string[];
}

const WINDOWS: { value: ObsWindow; label: string }[] = [
  { value: '24h',              label: '24h' },
  { value: '7d',               label: '7 días' },
  { value: '30d',              label: '30 días' },
  { value: 'since_activation', label: 'Desde activación' },
];

export function ObservabilityView({ meerkatIds, flagKeys }: Props) {
  const [window, setWindow] = useState<ObsWindow>('24h');
  const [selectedMeerkats, setSelectedMeerkats] = useState<string[]>([]);
  const [flagKey, setFlagKey] = useState<string>('');
  const [includeUnattr, setIncludeUnattr] = useState(false);
  const [rows, setRows] = useState<MeerkatObservabilityRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    const params = new URLSearchParams({ window });
    if (selectedMeerkats.length > 0) params.set('meerkat_ids', selectedMeerkats.join(','));
    if (flagKey) params.set('flag_key', flagKey);
    if (includeUnattr) params.set('include_unattributed', '1');

    startTransition(async () => {
      setError(null);
      try {
        const res = await fetch(`/api/admin/observabilidad?${params.toString()}`, { cache: 'no-store' });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? 'fetch failed');
        setRows(json.rows ?? []);
      } catch (e) {
        setError(String(e));
        setRows([]);
      }
    });
  }, [window, selectedMeerkats, flagKey, includeUnattr]);

  const toggleMeerkat = (id: string) => {
    setSelectedMeerkats(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const grouped = new Map<string, MeerkatObservabilityRow[]>();
  for (const r of rows) {
    const key = r.meerkat_id;
    grouped.set(key, [...(grouped.get(key) ?? []), r]);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-3 items-center">
        <div className="flex gap-1 rounded-lg p-1" style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)' }}>
          {WINDOWS.map(w => (
            <button
              key={w.value}
              onClick={() => setWindow(w.value)}
              className="px-3 py-1.5 rounded-md text-sm transition-all"
              style={{
                color: window === w.value ? '#FAFBFF' : 'var(--c-text-2)',
                background: window === w.value ? '#6C3BFF' : 'transparent',
                fontWeight: window === w.value ? 600 : 400,
              }}
            >
              {w.label}
            </button>
          ))}
        </div>

        <select
          value={flagKey}
          onChange={e => setFlagKey(e.target.value)}
          className="px-3 py-1.5 rounded-md text-sm"
          style={{ background: 'var(--c-surface)', color: 'var(--c-text)', border: '1px solid var(--c-border)' }}
        >
          <option value="">Todos los flags</option>
          {flagKeys.map(k => <option key={k} value={k}>{k}</option>)}
        </select>

        <label className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: 'var(--c-text-2)' }}>
          <input
            type="checkbox"
            checked={includeUnattr}
            onChange={e => setIncludeUnattr(e.target.checked)}
          />
          Incluir sin atribución
        </label>

        {pending && <span className="text-xs" style={{ color: 'var(--c-text-3)' }}>cargando...</span>}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {meerkatIds.map(id => (
          <button
            key={id}
            onClick={() => toggleMeerkat(id)}
            className="px-3 py-1 rounded-full text-xs transition-all"
            style={{
              background: selectedMeerkats.includes(id) ? '#6C3BFF' : 'var(--c-surface)',
              color: selectedMeerkats.includes(id) ? '#FAFBFF' : 'var(--c-text-2)',
              border: '1px solid var(--c-border)',
            }}
          >
            {capitalize(id)}
          </button>
        ))}
      </div>

      {error && (
        <div className="p-3 rounded-md text-sm" style={{ background: 'rgba(239,68,68,0.10)', color: '#EF4444' }}>
          {error}
        </div>
      )}

      {grouped.size === 0 && !pending && (
        <div className="p-6 rounded-lg text-center text-sm" style={{ background: 'var(--c-surface)', color: 'var(--c-text-3)' }}>
          Sin datos en la ventana seleccionada.
        </div>
      )}

      {Array.from(grouped.entries()).map(([mid, group]) => (
        <MeerkatTable key={mid} meerkatId={mid} rows={group} />
      ))}
    </div>
  );
}

function fmt(v: number | null, decimals: number, suffix = ''): string {
  if (v == null) return '-';
  return v.toFixed(decimals) + suffix;
}

function capitalize(id: string): string {
  if (id === 'unattributed') return 'Sin atribuir';
  return id.charAt(0).toUpperCase() + id.slice(1);
}

function Delta({ cur, prev, invert = false }: { cur: number | null; prev: number | null; invert?: boolean }) {
  if (cur == null || prev == null || prev === 0) return null;
  const signedCur  = invert ? -cur  : cur;
  const signedPrev = invert ? -prev : prev;
  const diff = ((signedCur - signedPrev) / Math.abs(signedPrev)) * 100;
  if (Math.abs(diff) < 0.05) return null;
  const arrow = diff > 0 ? '▲' : '▼';
  const color = diff > 0 ? '#22C55E' : '#EF4444';
  return (
    <span style={{ color, marginLeft: 4 }}>
      {arrow} {Math.abs(diff).toFixed(1)}%
    </span>
  );
}

function MeerkatTable({ meerkatId, rows }: { meerkatId: string; rows: MeerkatObservabilityRow[] }) {
  return (
    <div className="rounded-lg border overflow-hidden" style={{ borderColor: 'var(--c-border)', background: 'var(--c-surface)' }}>
      <div className="px-4 py-2 font-semibold text-sm" style={{ color: 'var(--c-text)', borderBottom: '1px solid var(--c-border)' }}>
        {capitalize(meerkatId)}
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr style={{ color: 'var(--c-text-3)' }}>
            <th className="text-left px-4 py-2 font-normal">Versión</th>
            <th className="text-right px-4 py-2 font-normal">Calls</th>
            <th className="text-right px-4 py-2 font-normal">Autonomía</th>
            <th className="text-right px-4 py-2 font-normal">CES avg</th>
            <th className="text-right px-4 py-2 font-normal">Costo/call</th>
            <th className="text-right px-4 py-2 font-normal">p50 lat</th>
            <th className="text-right px-4 py-2 font-normal">p95 lat</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const prev = i > 0 ? rows[i - 1] : null;
            const label = r.meerkat_version == null ? 'sin atrib.' : `v${r.meerkat_version}`;
            return (
              <tr key={label} style={{ borderTop: '1px solid var(--c-border)', color: 'var(--c-text)' }}>
                <td className="px-4 py-2">{label}</td>
                <td className="text-right px-4 py-2">{r.calls}</td>
                <td className="text-right px-4 py-2">
                  {fmt(r.autonomia_pct, 1, '%')}
                  <Delta cur={r.autonomia_pct} prev={prev?.autonomia_pct ?? null} />
                </td>
                <td className="text-right px-4 py-2">
                  {fmt(r.ces_avg, 2)}
                  <Delta cur={r.ces_avg} prev={prev?.ces_avg ?? null} />
                </td>
                <td className="text-right px-4 py-2">
                  ${fmt(r.cost_avg, 3)}
                  <Delta cur={r.cost_avg} prev={prev?.cost_avg ?? null} invert />
                </td>
                <td className="text-right px-4 py-2">{fmt(r.lat_p50, 0, 'ms')}</td>
                <td className="text-right px-4 py-2">{fmt(r.lat_p95, 0, 'ms')}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
