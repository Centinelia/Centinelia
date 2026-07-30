'use client';

import { useState } from 'react';
import { X } from 'lucide-react';

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
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/versiones/${row.meerkat_id}/activate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ version: selectedVersion, reason: reason || undefined }),
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

  return (
    <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
        <div className="p-4 border-b border-slate-200 flex items-center justify-between">
          <h2 className="font-semibold text-slate-900">Activar versión — {row.meerkat_id}</h2>
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
              onChange={e => setSelectedVersion(Number(e.target.value))}
              className="w-full border border-slate-200 rounded px-2 py-1.5 text-sm"
            >
              {otherVersions.map(v => (
                <option key={v} value={v}>v{v}</option>
              ))}
            </select>
          </div>

          <div className="text-sm bg-slate-50 rounded p-3">
            <div className="text-slate-700">Agentes que verán el cambio: <span className="font-medium">{affectedAgents}</span></div>
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

          {error && <div className="text-sm text-red-600 bg-red-50 rounded p-2">{error}</div>}
        </div>

        <div className="p-4 border-t border-slate-200 flex justify-end gap-2">
          <button onClick={onClose} disabled={submitting} className="px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50 rounded">Cancelar</button>
          <button onClick={submit} disabled={submitting} className="px-3 py-1.5 text-sm bg-slate-900 text-white rounded hover:bg-slate-800 disabled:opacity-50">
            {submitting ? 'Activando…' : `Activar v${selectedVersion}`}
          </button>
        </div>
      </div>
    </div>
  );
}
