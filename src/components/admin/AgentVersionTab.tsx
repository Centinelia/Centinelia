'use client';

import { useState } from 'react';
import { Pin, PinOff, GitBranch } from 'lucide-react';

interface Props {
  agentId: string;
  meerkatId: string | null;
  availableVersions: number[];
  activeGlobalVersion: number | null;
  pinnedVersion: number | null;
}

export function AgentVersionTab({ agentId, meerkatId, availableVersions, activeGlobalVersion, pinnedVersion: initialPin }: Props) {
  const [pin, setPin] = useState<number | null>(initialPin);
  const [editing, setEditing] = useState(false);
  const [pending, setPending] = useState<number>(initialPin ?? activeGlobalVersion ?? 1);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!meerkatId) {
    return (
      <div className="border border-slate-200 rounded-lg p-4 bg-slate-50 text-sm text-slate-600">
        Este agente no tiene meerkat_role_id asignado. No aplica versioning.
      </div>
    );
  }

  const effectiveVersion = pin ?? activeGlobalVersion ?? availableVersions[availableVersions.length - 1];

  async function save(newPin: number | null) {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/agentes/${agentId}/pin-version`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pinned_version: newPin }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed');
      setPin(newPin);
      setEditing(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="border border-slate-200 rounded-lg p-4 bg-white">
      <div className="flex items-center gap-2 mb-2">
        <GitBranch className="w-4 h-4 text-slate-500" />
        <h3 className="font-medium text-slate-900">Versión del meerkat</h3>
      </div>

      <div className="text-sm text-slate-600 mb-3">
        Meerkat: <span className="font-medium text-slate-800">{meerkatId}</span>
        {' · '}Versión efectiva: <span className="font-medium text-slate-800">v{effectiveVersion}</span>
        {pin != null
          ? <span className="ml-2 inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded bg-amber-50 text-amber-700"><Pin className="w-3 h-3" /> PIN activo</span>
          : <span className="ml-2 text-xs text-slate-500">(siguiendo latest global v{activeGlobalVersion})</span>
        }
      </div>

      {!editing && (
        <div className="flex gap-2">
          <button
            onClick={() => { setPending(pin ?? activeGlobalVersion ?? 1); setEditing(true); }}
            className="text-xs px-2 py-1 rounded border border-slate-200 text-slate-700 hover:bg-slate-50"
          >
            {pin != null ? 'Cambiar pin' : 'Fijar en versión específica'}
          </button>
          {pin != null && (
            <button
              onClick={() => save(null)}
              disabled={submitting}
              className="text-xs px-2 py-1 rounded border border-slate-200 text-slate-700 hover:bg-slate-50"
            >
              <PinOff className="inline w-3 h-3" /> Quitar pin
            </button>
          )}
        </div>
      )}

      {editing && (
        <div className="flex items-center gap-2">
          <select
            value={pending}
            onChange={e => setPending(Number(e.target.value))}
            className="border border-slate-200 rounded px-2 py-1 text-sm"
          >
            {availableVersions.map(v => <option key={v} value={v}>v{v}</option>)}
          </select>
          <button
            onClick={() => save(pending)}
            disabled={submitting}
            className="text-xs px-2 py-1 rounded bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {submitting ? 'Guardando…' : 'Guardar'}
          </button>
          <button
            onClick={() => { setEditing(false); setError(null); }}
            disabled={submitting}
            className="text-xs px-2 py-1 rounded text-slate-600 hover:bg-slate-50"
          >
            Cancelar
          </button>
        </div>
      )}

      {error && <div className="mt-2 text-xs text-red-600">{error}</div>}
    </div>
  );
}
