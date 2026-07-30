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
}

export function VersionesTable({ rows }: { rows: Row[] }) {
  const [modalRow, setModalRow] = useState<Row | null>(null);
  const [historyMeerkat, setHistoryMeerkat] = useState<string | null>(null);

  return (
    <>
      <div className="border border-slate-200 rounded-lg overflow-hidden bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-600 text-xs uppercase tracking-wide">
            <tr>
              <th className="text-left px-4 py-3">Meerkat</th>
              <th className="text-left px-4 py-3">Activa</th>
              <th className="text-left px-4 py-3">Última activación</th>
              <th className="text-left px-4 py-3">Agentes</th>
              <th className="text-left px-4 py-3">Disponibles</th>
              <th className="text-right px-4 py-3">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.meerkat_id} className="border-t border-slate-100">
                <td className="px-4 py-3 font-medium text-slate-900">{r.meerkat_id}</td>
                <td className="px-4 py-3">
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 font-medium">
                    <GitBranch className="w-3 h-3" /> v{r.active_version}
                  </span>
                </td>
                <td className="px-4 py-3 text-slate-600 text-xs">
                  {new Date(r.activated_at).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' })}
                  {r.activated_by && <span className="text-slate-400"> · {r.activated_by}</span>}
                </td>
                <td className="px-4 py-3 text-slate-700">
                  {r.agent_count}
                  {r.pinned_count > 0 && (
                    <span className="text-slate-400 text-xs"> ({r.agent_count - r.pinned_count} latest, {r.pinned_count} pinned)</span>
                  )}
                </td>
                <td className="px-4 py-3 text-slate-600 text-xs">
                  {r.available_versions.map(v => (
                    <span key={v} className={`inline-block px-1.5 py-0.5 mr-1 rounded ${v === r.active_version ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'}`}>
                      v{v}
                    </span>
                  ))}
                </td>
                <td className="px-4 py-3 text-right">
                  {r.available_versions.length > 1 && (
                    <button
                      onClick={() => setModalRow(r)}
                      className="text-xs px-2 py-1 rounded border border-slate-200 text-slate-700 hover:bg-slate-50 mr-1"
                    >
                      Cambiar versión <ArrowRight className="inline w-3 h-3" />
                    </button>
                  )}
                  <button
                    onClick={() => setHistoryMeerkat(r.meerkat_id)}
                    className="text-xs px-2 py-1 rounded border border-slate-200 text-slate-700 hover:bg-slate-50"
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
