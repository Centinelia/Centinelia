'use client';

import { useEffect, useState } from 'react';
import { X, GitBranch } from 'lucide-react';

interface HistoryEntry {
  id: string;
  from_version: number | null;
  to_version: number;
  changed_at: string;
  changed_by: string | null;
  reason: string | null;
}

export function VersionHistoryDrawer({ meerkatId, onClose }: { meerkatId: string; onClose: () => void }) {
  const [entries, setEntries] = useState<HistoryEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/admin/versiones/${meerkatId}/history`)
      .then(async res => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? 'Failed');
        setEntries(data.history);
      })
      .catch(err => setError((err as Error).message));
  }, [meerkatId]);

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.6)' }} onClick={onClose} />
      <div
        className="absolute right-0 top-0 bottom-0 w-full max-w-md shadow-xl flex flex-col"
        style={{ background: 'var(--c-modal)' }}
      >
        <div
          className="p-4 flex items-center justify-between"
          style={{ borderBottom: '1px solid var(--c-border)' }}
        >
          <h2 className="font-semibold" style={{ color: 'var(--c-text)' }}>Historial — {meerkatId}</h2>
          <button
            onClick={onClose}
            className="hover:opacity-80 transition-opacity"
            style={{ color: 'var(--c-text-4)' }}
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {error && <div className="text-sm" style={{ color: '#f87171' }}>{error}</div>}
          {entries === null && !error && <div className="text-sm" style={{ color: 'var(--c-text-3)' }}>Cargando…</div>}
          {entries && entries.length === 0 && <div className="text-sm" style={{ color: 'var(--c-text-3)' }}>Sin cambios registrados.</div>}
          {entries && entries.length > 0 && (
            <ul className="space-y-3">
              {entries.map(e => (
                <li key={e.id} className="pl-3" style={{ borderLeft: '2px solid var(--c-border)' }}>
                  <div className="text-xs" style={{ color: 'var(--c-text-3)' }}>
                    {new Date(e.changed_at).toLocaleString('es-MX')}
                    {e.changed_by && <span> · {e.changed_by}</span>}
                  </div>
                  <div className="flex items-center gap-2 mt-1 text-sm">
                    {e.from_version != null && <span style={{ color: 'var(--c-text-2)' }}>v{e.from_version}</span>}
                    {e.from_version != null && <span style={{ color: 'var(--c-text-4)' }}>→</span>}
                    <span
                      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded font-medium"
                      style={{ background: 'var(--c-surface-2)', color: 'var(--c-text)' }}
                    >
                      <GitBranch className="w-3 h-3" /> v{e.to_version}
                    </span>
                    {e.reason && <span className="text-xs italic" style={{ color: 'var(--c-text-3)' }}>— {e.reason}</span>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
