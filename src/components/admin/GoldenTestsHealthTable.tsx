'use client';

interface Run {
  id: string;
  meerkat_id: string;
  versions: number[];
  trigger: string;
  status: string;
  total_scenarios: number;
  completed_scenarios: number;
  created_at: string;
  completed_at: string | null;
}

export function GoldenTestsHealthTable({ runs }: { runs: Run[] }) {
  return (
    <div className="border border-slate-200 rounded-lg overflow-hidden bg-white">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-slate-600 text-xs uppercase tracking-wide">
          <tr>
            <th className="text-left px-4 py-3">Meerkat</th>
            <th className="text-left px-4 py-3">Versiones</th>
            <th className="text-left px-4 py-3">Trigger</th>
            <th className="text-left px-4 py-3">Estado</th>
            <th className="text-left px-4 py-3">Progreso</th>
            <th className="text-left px-4 py-3">Creado</th>
          </tr>
        </thead>
        <tbody>
          {runs.map(r => (
            <tr key={r.id} className="border-t border-slate-100">
              <td className="px-4 py-3 font-medium">{r.meerkat_id}</td>
              <td className="px-4 py-3 font-mono text-xs">v[{r.versions.join(',')}]</td>
              <td className="px-4 py-3 text-xs">{r.trigger}</td>
              <td className="px-4 py-3">
                <StatusBadge status={r.status} />
              </td>
              <td className="px-4 py-3 text-xs">
                {r.completed_scenarios}/{r.total_scenarios}
                {r.total_scenarios > 0 &&
                  ` (${Math.round((r.completed_scenarios / r.total_scenarios) * 100)}%)`}
              </td>
              <td className="px-4 py-3 text-xs text-slate-600">
                {new Date(r.created_at).toLocaleString('es-MX')}
              </td>
            </tr>
          ))}
          {runs.length === 0 && (
            <tr>
              <td colSpan={6} className="px-4 py-8 text-center text-slate-500 text-sm">
                Sin runs aun.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const cls =
    status === 'completed'
      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
      : status === 'running'
      ? 'bg-blue-50 text-blue-700 border-blue-200'
      : status === 'failed'
      ? 'bg-red-50 text-red-700 border-red-200'
      : 'bg-slate-50 text-slate-700 border-slate-200';

  return (
    <span className={`inline-block px-2 py-0.5 rounded border text-xs ${cls}`}>{status}</span>
  );
}
