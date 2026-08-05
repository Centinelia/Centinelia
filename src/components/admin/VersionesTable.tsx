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
        className="rounded-xl overflow-hidden bg-white"
        style={{ border: '1px solid #E5E7EB', boxShadow: '0 1px 3px 0 rgb(0 0 0 / 0.05)' }}
      >
        <table className="w-full text-[13px]">
          <thead style={{ background: '#F9FAFB' }}>
            <tr>
              <th className="text-left px-4 py-3 text-[11px] uppercase tracking-wider font-medium" style={{ color: '#6B7280' }}>Meerkat</th>
              <th className="text-left px-4 py-3 text-[11px] uppercase tracking-wider font-medium" style={{ color: '#6B7280' }}>Rollout activo</th>
              <th className="text-left px-4 py-3 text-[11px] uppercase tracking-wider font-medium" style={{ color: '#6B7280' }}>Fallback</th>
              <th className="text-left px-4 py-3 text-[11px] uppercase tracking-wider font-medium" style={{ color: '#6B7280' }}>Última activación</th>
              <th className="text-left px-4 py-3 text-[11px] uppercase tracking-wider font-medium" style={{ color: '#6B7280' }}>Agentes</th>
              <th className="text-left px-4 py-3 text-[11px] uppercase tracking-wider font-medium" style={{ color: '#6B7280' }}>Disponibles</th>
              <th className="text-right px-4 py-3 text-[11px] uppercase tracking-wider font-medium" style={{ color: '#6B7280' }}>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr
                key={r.meerkat_id}
                className="transition-colors hover:bg-gray-50"
                style={{ borderTop: i > 0 ? '1px solid #F3F4F6' : undefined }}
              >
                <td className="px-4 py-2.5 font-medium" style={{ color: '#111827' }}>{r.meerkat_id}</td>
                <td className="px-4 py-2.5">
                  {r.rollouts.length === 0 ? (
                    <span className="text-[12px]" style={{ color: '#9CA3AF' }}>sin flags</span>
                  ) : (
                    <span className="inline-flex flex-wrap gap-1">
                      {r.rollouts.map(ro => {
                        const style = ro.killed
                          ? { background: '#FEF2F2', color: '#B91C1C', border: '1px solid #FECACA', textDecoration: 'line-through' as const }
                          : ro.pct === 100
                            ? { background: '#ECFDF5', color: '#047857', border: '1px solid #A7F3D0' }
                            : ro.pct > 0
                              ? { background: '#F3F0FF', color: '#6C3BFF', border: '1px solid #DDD6FE' }
                              : { background: '#F3F4F6', color: '#6B7280', border: '1px solid #E5E7EB' };
                        return (
                          <a
                            key={ro.version}
                            href={`/admin/flags/${encodeURIComponent(`meerkat.${r.meerkat_id}.v${ro.version}`)}`}
                            className="inline-block px-2 py-0.5 rounded-md font-mono text-[11px] font-medium"
                            style={style}
                          >
                            v{ro.version}:{ro.pct}%
                          </a>
                        );
                      })}
                    </span>
                  )}
                </td>
                <td className="px-4 py-2.5">
                  <span
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[12px] font-medium"
                    style={{ background: '#F3F4F6', color: '#374151', border: '1px solid #E5E7EB' }}
                  >
                    <GitBranch className="w-3 h-3" /> v{r.active_version}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-[12px]" style={{ color: '#6B7280' }}>
                  {new Date(r.activated_at).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' })}
                  {r.activated_by && <span style={{ color: '#9CA3AF' }}> · {r.activated_by}</span>}
                </td>
                <td className="px-4 py-2.5 tabular-nums" style={{ color: '#111827' }}>
                  {r.agent_count}
                  {r.pinned_count > 0 && (
                    <span className="text-[12px]" style={{ color: '#9CA3AF' }}> ({r.agent_count - r.pinned_count} latest, {r.pinned_count} pinned)</span>
                  )}
                </td>
                <td className="px-4 py-2.5 text-[12px]">
                  {r.available_versions.map(v => (
                    <span
                      key={v}
                      className="inline-block px-1.5 py-0.5 mr-1 rounded-md font-mono font-medium"
                      style={
                        v === r.active_version
                          ? { background: '#ECFDF5', color: '#047857', border: '1px solid #A7F3D0' }
                          : { background: '#F3F4F6', color: '#6B7280', border: '1px solid #E5E7EB' }
                      }
                    >
                      v{v}
                    </span>
                  ))}
                </td>
                <td className="px-4 py-2.5 text-right whitespace-nowrap">
                  {r.available_versions.length > 1 && (
                    <button
                      onClick={() => setModalRow(r)}
                      className="inline-flex items-center gap-1 text-[12px] font-medium px-2.5 py-1 rounded-lg mr-1 transition-colors hover:bg-gray-100"
                      style={{ border: '1px solid #E5E7EB', color: '#374151', background: '#FFFFFF' }}
                    >
                      Cambiar versión <ArrowRight className="w-3 h-3" />
                    </button>
                  )}
                  <button
                    onClick={() => setHistoryMeerkat(r.meerkat_id)}
                    className="inline-flex items-center gap-1 text-[12px] font-medium px-2.5 py-1 rounded-lg transition-colors hover:bg-gray-100"
                    style={{ border: '1px solid #E5E7EB', color: '#374151', background: '#FFFFFF' }}
                  >
                    <History className="w-3 h-3" /> Historial
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
