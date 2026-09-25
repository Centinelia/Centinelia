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
    <div
      className="rounded-lg overflow-hidden border"
      style={{ borderColor: '#E8E3F5', background: '#FFFFFF' }}
    >
      <table className="w-full text-sm">
        <thead
          className="text-xs uppercase tracking-wide"
          style={{ background: '#FAFAFB', color: '#6B6480' }}
        >
          <tr>
            <th className="text-left px-4 py-3">Meerkat</th>
            <th className="text-left px-4 py-3">Versiones</th>
            <th className="text-left px-4 py-3">Trigger</th>
            <th className="text-left px-4 py-3">Estado</th>
            <th className="text-left px-4 py-3">Progreso</th>
            <th className="text-left px-4 py-3">Creado</th>
          </tr>
        </thead>
        <tbody style={{ color: '#1A0A3B' }}>
          {runs.map(r => (
            <tr key={r.id} className="border-t" style={{ borderColor: '#F0EBFA' }}>
              <td className="px-4 py-3 font-medium">{r.meerkat_id}</td>
              <td className="px-4 py-3 font-mono text-xs" style={{ color: '#4A3B6B' }}>
                v[{r.versions.join(',')}]
              </td>
              <td className="px-4 py-3 text-xs" style={{ color: '#4A3B6B' }}>{r.trigger}</td>
              <td className="px-4 py-3">
                <StatusBadge status={r.status} />
              </td>
              <td className="px-4 py-3 text-xs" style={{ color: '#4A3B6B' }}>
                {r.completed_scenarios}/{r.total_scenarios}
                {r.total_scenarios > 0 &&
                  ` (${Math.round((r.completed_scenarios / r.total_scenarios) * 100)}%)`}
              </td>
              <td className="px-4 py-3 text-xs" style={{ color: '#6B6480' }}>
                {new Date(r.created_at).toLocaleString('es-MX')}
              </td>
            </tr>
          ))}
          {runs.length === 0 && (
            <tr>
              <td
                colSpan={6}
                className="px-4 py-8 text-center text-sm"
                style={{ color: '#6B6480' }}
              >
                Sin runs aún.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const palette: Record<string, { bg: string; color: string; border: string }> = {
    completed: { bg: 'rgba(16,185,129,0.15)', color: '#34d399', border: 'rgba(16,185,129,0.4)' },
    running:   { bg: 'rgba(59,130,246,0.15)', color: '#60a5fa', border: 'rgba(59,130,246,0.4)' },
    failed:    { bg: 'rgba(239,68,68,0.15)',  color: '#f87171', border: 'rgba(239,68,68,0.4)'  },
  };
  const p = palette[status] ?? {
    bg: '#FAFAFB',
    color: '#4A3B6B',
    border: '#E8E3F5',
  };
  return (
    <span
      className="inline-block px-2 py-0.5 rounded border text-xs"
      style={{ background: p.bg, color: p.color, borderColor: p.border }}
    >
      {status}
    </span>
  );
}
