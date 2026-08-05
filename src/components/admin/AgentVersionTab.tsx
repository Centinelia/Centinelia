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
      <div
        className="rounded-lg p-4 text-sm"
        style={{ border: '1px solid var(--c-border)', background: 'var(--c-surface-2)', color: 'var(--c-text-2)' }}
      >
        Este empleado no tiene un rol asignado. No aplica versionado.
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
    <div
      className="rounded-lg p-4"
      style={{ border: '1px solid var(--c-border)', background: 'var(--c-surface)' }}
    >
      <div className="flex items-center gap-2 mb-2">
        <GitBranch className="w-4 h-4" style={{ color: 'var(--c-text-3)' }} />
        <h3 className="font-medium" style={{ color: 'var(--c-text)' }}>Versión del empleado</h3>
      </div>

      <div className="text-sm mb-3" style={{ color: 'var(--c-text-2)' }}>
        <div>
          Rol: <span className="font-medium" style={{ color: 'var(--c-text)' }}>{meerkatId.charAt(0).toUpperCase() + meerkatId.slice(1)}</span>
          {' · '}Versión efectiva: <span className="font-medium" style={{ color: 'var(--c-text)' }}>v{effectiveVersion}</span>
          {pin != null && (
            <span
              className="ml-2 inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded"
              style={{ background: 'rgba(251,191,36,0.15)', color: '#fbbf24', border: '1px solid rgba(251,191,36,0.4)' }}
            >
              <Pin className="w-3 h-3" /> PIN activo
            </span>
          )}
        </div>
        {pin == null && (
          <div className="text-xs mt-1" style={{ color: 'var(--c-text-3)' }}>
            Siguiendo la última versión global (v{activeGlobalVersion})
          </div>
        )}
      </div>

      {!editing && (
        <div className="flex gap-2">
          <button
            onClick={() => { setPending(pin ?? activeGlobalVersion ?? 1); setEditing(true); }}
            className="text-xs px-2 py-1 rounded hover:opacity-80 transition-opacity"
            style={{ border: '1px solid var(--c-border)', color: 'var(--c-text-2)' }}
          >
            {pin != null ? 'Cambiar pin' : 'Fijar en versión específica'}
          </button>
          {pin != null && (
            <button
              onClick={() => save(null)}
              disabled={submitting}
              className="text-xs px-2 py-1 rounded hover:opacity-80 transition-opacity disabled:opacity-40"
              style={{ border: '1px solid var(--c-border)', color: 'var(--c-text-2)' }}
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
            className="rounded px-2 py-1 text-sm"
            style={{ border: '1px solid var(--c-input-border)', background: 'var(--c-input-bg)', color: 'var(--c-text)' }}
          >
            {availableVersions.map(v => <option key={v} value={v}>v{v}</option>)}
          </select>
          <button
            onClick={() => save(pending)}
            disabled={submitting}
            className="text-xs px-2 py-1 rounded text-white disabled:opacity-50"
            style={{ background: 'var(--accent)' }}
          >
            {submitting ? 'Guardando…' : 'Guardar'}
          </button>
          <button
            onClick={() => { setEditing(false); setError(null); }}
            disabled={submitting}
            className="text-xs px-2 py-1 rounded hover:opacity-80 transition-opacity"
            style={{ color: 'var(--c-text-2)' }}
          >
            Cancelar
          </button>
        </div>
      )}

      {error && <div className="mt-2 text-xs" style={{ color: '#f87171' }}>{error}</div>}
    </div>
  );
}
