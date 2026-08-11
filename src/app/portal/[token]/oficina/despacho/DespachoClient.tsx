'use client';

import { useState } from 'react';

interface DispatchRow {
  id: string;
  service_description: string;
  location: string | null;
  priority: 'baja' | 'media' | 'alta' | 'critica';
  unidad_nombre: string | null;
  unidad_telefono: string | null;
  status: 'pendiente' | 'asignado' | 'en_ruta' | 'completado' | 'cancelado';
  requested_by_name: string | null;
  requested_by_phone: string | null;
  eta_minutes: number | null;
  notes: string | null;
  created_at: string;
}

const STATUS_LABELS: Record<DispatchRow['status'], string> = {
  pendiente: 'Pendiente', asignado: 'Asignado', en_ruta: 'En ruta', completado: 'Completado', cancelado: 'Cancelado',
};
const STATUS_COLORS: Record<DispatchRow['status'], string> = {
  pendiente: '#f59e0b', asignado: '#6366f1', en_ruta: '#0ea5e9', completado: '#22c55e', cancelado: '#94a3b8',
};
const PRIORITY_COLORS: Record<DispatchRow['priority'], string> = {
  baja: '#94a3b8', media: '#6366f1', alta: '#f59e0b', critica: '#ef4444',
};

export default function DespachoClient({ token, initial }: { token: string; initial: DispatchRow[] }) {
  const [rows, setRows] = useState(initial);
  const [filter, setFilter] = useState<'todos' | DispatchRow['status']>('todos');
  const filtered = filter === 'todos' ? rows : rows.filter(r => r.status === filter);

  async function updateStatus(id: string, status: DispatchRow['status']) {
    const prev = rows;
    setRows(prev.map(r => r.id === id ? { ...r, status } : r));
    const res = await fetch(`/api/portal/${token}/dispatch`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status }),
    });
    if (!res.ok) setRows(prev); // revert
  }

  return (
    <div style={{ padding: 24, color: 'var(--c-text)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>Despacho de campo</h1>
          <p style={{ color: 'var(--c-text-2)', fontSize: 14, margin: '4px 0 0' }}>
            Asignaciones registradas por Nova. Actualiza el estado cuando la unidad avance.
          </p>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {(['todos', 'pendiente', 'asignado', 'en_ruta', 'completado', 'cancelado'] as const).map(f => (
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
            {f === 'todos' ? 'Todos' : STATUS_LABELS[f]} ({f === 'todos' ? rows.length : rows.filter(r => r.status === f).length})
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div style={{ padding: 32, textAlign: 'center', background: 'var(--c-surface)', borderRadius: 12, border: '1px solid var(--c-border-2)', color: 'var(--c-text-2)' }}>
          No hay asignaciones {filter !== 'todos' ? `en estado "${STATUS_LABELS[filter]}"` : 'todavía'}.
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          {filtered.map(row => (
            <div key={row.id} style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border-2)', borderRadius: 12, padding: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: 12 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <span style={{ padding: '2px 8px', borderRadius: 6, background: `${PRIORITY_COLORS[row.priority]}20`, color: PRIORITY_COLORS[row.priority], fontSize: 11, fontWeight: 700 }}>{row.priority.toUpperCase()}</span>
                    <span style={{ padding: '2px 8px', borderRadius: 6, background: `${STATUS_COLORS[row.status]}20`, color: STATUS_COLORS[row.status], fontSize: 11, fontWeight: 700 }}>{STATUS_LABELS[row.status]}</span>
                    <span style={{ fontSize: 12, color: 'var(--c-text-3)' }}>{new Date(row.created_at).toLocaleString('es-MX', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>{row.service_description}</div>
                  {row.location && <div style={{ fontSize: 13, color: 'var(--c-text-2)' }}>📍 {row.location}</div>}
                  {row.unidad_nombre && (
                    <div style={{ fontSize: 13, color: 'var(--c-text-2)', marginTop: 4 }}>
                      🚐 {row.unidad_nombre}{row.unidad_telefono ? ` · ${row.unidad_telefono}` : ''}{row.eta_minutes ? ` · ETA ${row.eta_minutes} min` : ''}
                    </div>
                  )}
                  {row.requested_by_name && (
                    <div style={{ fontSize: 13, color: 'var(--c-text-3)', marginTop: 4 }}>
                      Solicitó: {row.requested_by_name}{row.requested_by_phone ? ` · ${row.requested_by_phone}` : ''}
                    </div>
                  )}
                  {row.notes && <div style={{ fontSize: 12, color: 'var(--c-text-3)', marginTop: 6, fontStyle: 'italic' }}>“{row.notes}”</div>}
                </div>
                <select
                  value={row.status}
                  onChange={e => updateStatus(row.id, e.target.value as DispatchRow['status'])}
                  style={{ padding: '6px 8px', borderRadius: 8, fontSize: 12, background: 'var(--c-surface)', color: 'var(--c-text)', border: '1px solid var(--c-border-2)', cursor: 'pointer' }}
                >
                  {(Object.keys(STATUS_LABELS) as DispatchRow['status'][]).map(s => (
                    <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                  ))}
                </select>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
