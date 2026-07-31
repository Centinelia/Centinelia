'use client';

import { useState } from 'react';
import { GitBranch, History, ArrowRight } from 'lucide-react';
import { ActivateVersionModal } from './ActivateVersionModal';
import { VersionHistoryDrawer } from './VersionHistoryDrawer';

interface Row {
  meerkat_id: string;
  active_version: number;
  activated_at: string;
  activated_by: string | null;
  notes: string | null;
  available_versions: number[];
  agent_count: number;
  pinned_count: number;
  rollouts: { version: number; pct: number; killed: boolean }[];
}

export function VersionesTable({ rows }: { rows: Row[] }) {
  const [modalRow, setModalRow] = useState<Row | null>(null);
  const [historyMeerkat, setHistoryMeerkat] = useState<string | null>(null);

  return (
    <>
      <div
        className="rounded-lg overflow-hidden border"
        style={{ borderColor: 'var(--c-border)', background: 'var(--c-surface)' }}
      >
        <table className="w-full text-sm">
          <thead
            className="text-xs uppercase tracking-wide"
            style={{ background: 'var(--c-surface-2)', color: 'var(--c-text-3)' }}
          >
            <tr>
              <th className="text-left px-4 py-3">Meerkat</th>
              <th className="text-left px-4 py-3">Rollout activo</th>
              <th className="text-left px-4 py-3">Fallback</th>
              <th className="text-left px-4 py-3">Última activación</th>
              <th className="text-left px-4 py-3">Agentes</th>
              <th className="text-left px-4 py-3">Disponibles</th>
              <th className="text-right px-4 py-3">Acciones</th>
            </tr>
          </thead>
          <tbody style={{ color: 'var(--c-text)' }}>
            {rows.map(r => (
              <tr key={r.meerkat_id} className="border-t" style={{ borderColor: 'var(--c-divider)' }}>
                <td className="px-4 py-3 font-medium" style={{ color: 'var(--c-text)' }}>{r.meerkat_id}</td>
                <td className="px-4 py-3 text-xs">
                  {r.rollouts.length === 0 ? (
                    <span style={{ color: 'var(--c-text-4)' }}>sin flags</span>
                  ) : (
                    <span className="inline-flex flex-wrap gap-1">
                      {r.rollouts.map(ro => (
                        <a
                          key={ro.version}
                          href={`/admin/flags/${encodeURIComponent(`meerkat.${r.meerkat_id}.v${ro.version}`)}`}
                          className="inline-block px-1.5 py-0.5 rounded font-mono"
                          style={
                            ro.killed
                              ? { background: 'rgba(220,38,38,0.15)', color: '#DC2626', textDecoration: 'line-through' }
                              : ro.pct === 100
                                ? { background: 'rgba(16,185,129,0.15)', color: '#34d399' }
                                : ro.pct > 0
                                  ? { background: 'rgba(108,59,255,0.15)', color: '#9B6DFF' }
                                  : { background: 'var(--c-surface-2)', color: 'var(--c-text-4)' }
                          }
                        >
                          v{ro.version}:{ro.pct}%
                        </a>
                      ))}
                    </span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <span
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded font-medium"
                    style={{ background: 'var(--c-surface-2)', color: 'var(--c-text-2)', border: '1px solid var(--c-border)' }}
                  >
                    <GitBranch className="w-3 h-3" /> v{r.active_version}
                  </span>
                </td>
                <td className="px-4 py-3 text-xs" style={{ color: 'var(--c-text-2)' }}>
                  {new Date(r.activated_at).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' })}
                  {r.activated_by && <span style={{ color: 'var(--c-text-4)' }}> · {r.activated_by}</span>}
                </td>
                <td className="px-4 py-3" style={{ color: 'var(--c-text-2)' }}>
                  {r.agent_count}
                  {r.pinned_count > 0 && (
                    <span className="text-xs" style={{ color: 'var(--c-text-4)' }}> ({r.agent_count - r.pinned_count} latest, {r.pinned_count} pinned)</span>
                  )}
                </td>
                <td className="px-4 py-3 text-xs" style={{ color: 'var(--c-text-2)' }}>
                  {r.available_versions.map(v => (
                    <span
                      key={v}
                      className="inline-block px-1.5 py-0.5 mr-1 rounded"
                      style={
                        v === r.active_version
                          ? { background: 'rgba(16,185,129,0.15)', color: '#34d399' }
                          : { background: 'var(--c-surface-2)', color: 'var(--c-text-2)' }
                      }
                    >
                      v{v}
                    </span>
                  ))}
                </td>
                <td className="px-4 py-3 text-right">
                  {r.available_versions.length > 1 && (
                    <button
                      onClick={() => setModalRow(r)}
                      className="text-xs px-2 py-1 rounded mr-1 hover:opacity-80 transition-opacity"
                      style={{ border: '1px solid var(--c-border)', color: 'var(--c-text-2)' }}
                    >
                      Cambiar versión <ArrowRight className="inline w-3 h-3" />
                    </button>
                  )}
                  <button
                    onClick={() => setHistoryMeerkat(r.meerkat_id)}
                    className="text-xs px-2 py-1 rounded hover:opacity-80 transition-opacity"
                    style={{ border: '1px solid var(--c-border)', color: 'var(--c-text-2)' }}
                  >
                    <History className="inline w-3 h-3" /> Historial
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modalRow && (
        <ActivateVersionModal
          row={modalRow}
          onClose={() => setModalRow(null)}
          onSuccess={() => { setModalRow(null); window.location.reload(); }}
        />
      )}
      {historyMeerkat && (
        <VersionHistoryDrawer
          meerkatId={historyMeerkat}
          onClose={() => setHistoryMeerkat(null)}
        />
      )}
    </>
  );
}
