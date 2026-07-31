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

  const btnCls =
    verdict === 'fail' ? 'bg-red-600 hover:bg-red-700' :
    verdict === 'warn' ? 'bg-amber-600 hover:bg-amber-700' :
    'bg-slate-900 hover:bg-slate-800';

  return (
    <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
        <div className="p-4 border-b border-slate-200 flex items-center justify-between">
          <h2 className="font-semibold text-slate-900">Activar versión: {row.meerkat_id}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>
        </div>

        <div className="p-4 space-y-4">
          <div className="text-sm">
            <div className="text-slate-600">Versión activa actual: <span className="font-medium text-slate-900">v{row.active_version}</span></div>
            <div className="text-slate-600">Última activación: {new Date(row.activated_at).toLocaleString('es-MX')}</div>
          </div>

          <div>
            <label className="text-xs font-medium text-slate-700 mb-1 block">Nueva versión</label>
            <select
              value={selectedVersion}
              onChange={e => {
                setSelectedVersion(Number(e.target.value));
                setOverrideReason('');
                setVerdict(null);
              }}
              className="w-full border border-slate-200 rounded px-2 py-1.5 text-sm"
            >
              {otherVersions.map(v => (
                <option key={v} value={v}>v{v}</option>
              ))}
            </select>
          </div>

          <GateVerdictPanel meerkat_id={row.meerkat_id} target_version={selectedVersion} />

          <div className="text-sm bg-slate-50 rounded p-3">
            <div className="text-slate-700">Agentes que veran el cambio: <span className="font-medium">{affectedAgents}</span></div>
            {row.pinned_count > 0 && (
              <div className="text-slate-500 text-xs mt-1">
                {row.pinned_count} agente(s) protegidos por pin — no reciben el cambio.
              </div>
            )}
          </div>

          <div>
            <label className="text-xs font-medium text-slate-700 mb-1 block">Motivo (opcional)</label>
            <input
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="ej. rollback por score bajo"
              className="w-full border border-slate-200 rounded px-2 py-1.5 text-sm"
            />
          </div>

          {needsOverride && (
            <div>
              <label className="text-xs font-medium text-red-700 mb-1 block">
                Motivo del override (obligatorio):
              </label>
              <textarea
                value={overrideReason}
                onChange={e => setOverrideReason(e.target.value)}
                placeholder="ej. rollback urgente por incidente. Se que degrada."
                rows={3}
                className="w-full border border-red-300 rounded px-2 py-1.5 text-sm"
              />
            </div>
          )}

          {error && <div className="text-sm text-red-600 bg-red-50 rounded p-2">{error}</div>}
        </div>

        <div className="p-4 border-t border-slate-200 flex justify-end gap-2">
          <button onClick={onClose} disabled={submitting} className="px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50 rounded">Cancelar</button>
          <button onClick={submit} disabled={submitting || !canSubmit} className={`px-3 py-1.5 text-sm text-white rounded disabled:opacity-50 ${btnCls}`}>
            {submitting ? 'Activando...' : `Activar v${selectedVersion}`}
          </button>
        </div>
      </div>
    </div>
  );
}
