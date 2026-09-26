'use client';

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { GateVerdictPanel } from './GateVerdictPanel';
import type { GateVerdict } from '@/lib/golden-tests/types';

interface Row {
  meerkat_id: string;
  active_version: number;
  activated_at: string;
  available_versions: number[];
  agent_count: number;
  pinned_count: number;
}

interface Props {
  row: Row;
  onClose: () => void;
  onSuccess: () => void;
}

export function ActivateVersionModal({ row, onClose, onSuccess }: Props) {
  const otherVersions = row.available_versions.filter(v => v !== row.active_version);
  const [selectedVersion, setSelectedVersion] = useState<number>(otherVersions[0] ?? row.active_version);
  const [reason, setReason] = useState('');
  const [overrideReason, setOverrideReason] = useState('');
  const [verdict, setVerdict] = useState<GateVerdict | null>(null);
  const [initialPct, setInitialPct] = useState<number>(10);
  const [allowlistText, setAllowlistText] = useState<string>('nazre@gmail.com');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(`/api/admin/versiones/${row.meerkat_id}/gate-status?target=${selectedVersion}`);
        const data = await res.json();
        if (!cancelled && res.ok) setVerdict(data.verdict);
      } catch { /* silent */ }
    }
    load();
    return () => { cancelled = true; };
  }, [row.meerkat_id, selectedVersion]);

  const needsOverride = verdict === 'fail' || verdict === 'incomplete';
  const canSubmit = !needsOverride || overrideReason.trim().length > 0;

  async function submit() {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/versiones/${row.meerkat_id}/activate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          version: selectedVersion,
          reason: reason || undefined,
          override_reason: needsOverride ? overrideReason.trim() : undefined,
          gate_verdict: verdict,
          initial_pct: initialPct,
          allowlist: allowlistText.split('\n').map(s => s.trim()).filter(Boolean),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed');
      onSuccess();
    } catch (e) {
      setError((e as Error).message);
      setSubmitting(false);
    }
  }

  const affectedAgents = row.agent_count - row.pinned_count;

  const btnStyle =
    verdict === 'fail' ? { background: '#dc2626' } :
    verdict === 'warn' ? { background: '#d97706' } :
    { background: 'var(--accent)' };

  return (
    <div
      className="fixed inset-0 flex items-center justify-center z-50 p-4"
      style={{ background: 'rgba(0,0,0,0.6)' }}
    >
      <div className="rounded-lg shadow-xl max-w-md w-full" style={{ background: '#FFFFFF' }}>
        <div
          className="p-4 flex items-center justify-between"
          style={{ borderBottom: '1px solid #E8E3F5' }}
        >
          <h2 className="font-semibold" style={{ color: '#1A0A3B' }}>Activar versión: {row.meerkat_id}</h2>
          <button
            onClick={onClose}
            className="hover:opacity-80 transition-opacity"
            style={{ color: '#9B8FB5' }}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          <div className="text-sm" style={{ color: '#4A3B6B' }}>
            <div>Versión activa actual: <span className="font-medium" style={{ color: '#1A0A3B' }}>v{row.active_version}</span></div>
            <div>Última activación: {new Date(row.activated_at).toLocaleString('es-MX')}</div>
          </div>

          <div>
            <label className="text-xs font-medium mb-1 block" style={{ color: '#4A3B6B' }}>Nueva versión</label>
            <select
              value={selectedVersion}
              onChange={e => {
                setSelectedVersion(Number(e.target.value));
                setOverrideReason('');
                setVerdict(null);
              }}
              className="w-full rounded px-2 py-1.5 text-sm"
              style={{ border: '1px solid #E8E3F5', background: '#FFFFFF', color: '#1A0A3B' }}
            >
              {otherVersions.map(v => (
                <option key={v} value={v}>v{v}</option>
              ))}
            </select>
          </div>

          <GateVerdictPanel meerkat_id={row.meerkat_id} target_version={selectedVersion} />

          <div
            className="text-sm rounded p-3"
            style={{ background: '#FAFAFB', color: '#4A3B6B' }}
          >
            <div>Agentes que veran el cambio: <span className="font-medium" style={{ color: '#1A0A3B' }}>{affectedAgents}</span></div>
            {row.pinned_count > 0 && (
              <div className="text-xs mt-1" style={{ color: '#6B6480' }}>
                {row.pinned_count} agente(s) protegidos por pin — no reciben el cambio.
              </div>
            )}
          </div>

          <div>
            <label className="text-xs font-medium mb-1 block" style={{ color: '#4A3B6B' }}>Motivo (opcional)</label>
            <input
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="ej. rollback por score bajo"
              className="w-full rounded px-2 py-1.5 text-sm"
              style={{ border: '1px solid #E8E3F5', background: '#FFFFFF', color: '#1A0A3B' }}
            />
          </div>

          <div className="space-y-1">
            <label className="block text-xs font-medium" style={{ color: '#4A3B6B' }}>
              Rollout inicial: <span className="font-mono">{initialPct}%</span>
            </label>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={initialPct}
              onChange={e => setInitialPct(parseInt(e.target.value, 10))}
              className="w-full"
            />
            <p className="text-xs" style={{ color: '#4A3B6B' }}>
              Despues puedes subirlo desde /admin/flags cuando estes a gusto.
            </p>
          </div>

          <div className="space-y-1">
            <label className="block text-xs font-medium" style={{ color: '#4A3B6B' }}>Allowlist (portal_email por linea)</label>
            <textarea
              value={allowlistText}
              onChange={e => setAllowlistText(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 rounded-lg text-sm font-mono"
              style={{ background: '#FFFFFF', color: '#1A0A3B', border: '1px solid #E8E3F5' }}
            />
            <p className="text-xs" style={{ color: '#4A3B6B' }}>
              Estas orgs siempre reciben la nueva version aunque el hash caiga off. Util para dogfooding.
            </p>
          </div>

          {needsOverride && (
            <div>
              <label className="text-xs font-medium mb-1 block" style={{ color: '#f87171' }}>
                Motivo del override (obligatorio):
              </label>
              <textarea
                value={overrideReason}
                onChange={e => setOverrideReason(e.target.value)}
                placeholder="ej. rollback urgente por incidente. Se que degrada."
                rows={3}
                className="w-full rounded px-2 py-1.5 text-sm"
                style={{ border: '1px solid rgba(239,68,68,0.5)', background: '#FFFFFF', color: '#1A0A3B' }}
              />
            </div>
          )}

          {error && (
            <div
              className="text-sm rounded p-2"
              style={{ color: '#f87171', background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.4)' }}
            >
              {error}
            </div>
          )}
        </div>

        <div
          className="p-4 flex justify-end gap-2"
          style={{ borderTop: '1px solid #E8E3F5' }}
        >
          <button
            onClick={onClose}
            disabled={submitting}
            className="px-3 py-1.5 text-sm rounded hover:opacity-80 transition-opacity"
            style={{ color: '#4A3B6B' }}
          >
            Cancelar
          </button>
          <button
            onClick={submit}
            disabled={submitting || !canSubmit}
            className="px-3 py-1.5 text-sm text-white rounded disabled:opacity-50"
            style={btnStyle}
          >
            {submitting ? 'Activando...' : `Activar v${selectedVersion}`}
          </button>
        </div>
      </div>
    </div>
  );
}
