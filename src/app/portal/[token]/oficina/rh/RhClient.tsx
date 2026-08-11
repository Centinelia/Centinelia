'use client';

import { useState } from 'react';

interface HrRow {
  id: string;
  employee_name: string;
  record_type: 'falta' | 'vacaciones' | 'permiso' | 'incidencia';
  start_date: string;
  end_date: string | null;
  reason: string | null;
  status: 'registrada' | 'aprobada' | 'rechazada' | 'cancelada';
  approved_by: string | null;
  notes: string | null;
  created_at: string;
}

const TYPE_LABELS: Record<HrRow['record_type'], string> = {
  falta: 'Falta', vacaciones: 'Vacaciones', permiso: 'Permiso', incidencia: 'Incidencia',
};
const TYPE_COLORS: Record<HrRow['record_type'], string> = {
  falta: '#ef4444', vacaciones: '#22c55e', permiso: '#0ea5e9', incidencia: '#f59e0b',
};
const STATUS_LABELS: Record<HrRow['status'], string> = {
  registrada: 'Registrada', aprobada: 'Aprobada', rechazada: 'Rechazada', cancelada: 'Cancelada',
};
const STATUS_COLORS: Record<HrRow['status'], string> = {
  registrada: '#f59e0b', aprobada: '#22c55e', rechazada: '#ef4444', cancelada: '#94a3b8',
};

export default function RhClient({ token, initial }: { token: string; initial: HrRow[] }) {
  const [rows, setRows] = useState(initial);
  const [filter, setFilter] = useState<'todos' | HrRow['record_type']>('todos');
  const filtered = filter === 'todos' ? rows : rows.filter(r => r.record_type === filter);

  async function decide(id: string, status: 'aprobada' | 'rechazada') {
    const prev = rows;
    setRows(prev.map(r => r.id === id ? { ...r, status } : r));
    const res = await fetch(`/api/portal/${token}/hr`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status }),
    });
    if (!res.ok) setRows(prev);
  }

  const fmt = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' });

  return (
    <div style={{ padding: 24, color: 'var(--c-text)' }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>Recursos Humanos</h1>
        <p style={{ color: 'var(--c-text-2)', fontSize: 14, margin: '4px 0 0' }}>
          Registros capturados por Naia: faltas, vacaciones, permisos, incidencias. Aprueba o rechaza solicitudes pendientes.
        </p>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {(['todos', 'falta', 'vacaciones', 'permiso', 'incidencia'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{
              padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600,
              background: filter === f ? '#6C3BFF' : 'var(--c-surface)',
              color: filter === f ? '#fff' : 'var(--c-text)',
              border: '1px solid var(--c-border-2)', cursor: 'pointer',
            }}
          >
            {f === 'todos' ? 'Todos' : TYPE_LABELS[f]} ({f === 'todos' ? rows.length : rows.filter(r => r.record_type === f).length})
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div style={{ padding: 32, textAlign: 'center', background: 'var(--c-surface)', borderRadius: 12, border: '1px solid var(--c-border-2)', color: 'var(--c-text-2)' }}>
          No hay registros {filter !== 'todos' ? `de tipo "${TYPE_LABELS[filter]}"` : 'todavía'}.
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          {filtered.map(row => (
            <div key={row.id} style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border-2)', borderRadius: 12, padding: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: 12 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
                    <span style={{ padding: '2px 8px', borderRadius: 6, background: `${TYPE_COLORS[row.record_type]}20`, color: TYPE_COLORS[row.record_type], fontSize: 11, fontWeight: 700 }}>{TYPE_LABELS[row.record_type].toUpperCase()}</span>
                    <span style={{ padding: '2px 8px', borderRadius: 6, background: `${STATUS_COLORS[row.status]}20`, color: STATUS_COLORS[row.status], fontSize: 11, fontWeight: 700 }}>{STATUS_LABELS[row.status]}</span>
                    <span style={{ fontSize: 12, color: 'var(--c-text-3)' }}>Capturado {new Date(row.created_at).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })}</span>
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>{row.employee_name}</div>
                  <div style={{ fontSize: 13, color: 'var(--c-text-2)' }}>
                    {row.end_date && row.end_date !== row.start_date
                      ? `Del ${fmt(row.start_date)} al ${fmt(row.end_date)}`
                      : fmt(row.start_date)}
                  </div>
                  {row.reason && <div style={{ fontSize: 13, color: 'var(--c-text-3)', marginTop: 6, fontStyle: 'italic' }}>“{row.reason}”</div>}
                  {row.approved_by && <div style={{ fontSize: 12, color: 'var(--c-text-3)', marginTop: 4 }}>Decidido por: {row.approved_by}</div>}
                </div>
                {row.status === 'registrada' && (row.record_type === 'vacaciones' || row.record_type === 'permiso') && (
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => decide(row.id, 'aprobada')} style={{ padding: '6px 12px', borderRadius: 8, background: '#22c55e', color: '#fff', border: 'none', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Aprobar</button>
                    <button onClick={() => decide(row.id, 'rechazada')} style={{ padding: '6px 12px', borderRadius: 8, background: '#ef4444', color: '#fff', border: 'none', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Rechazar</button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
