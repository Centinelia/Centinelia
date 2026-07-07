'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';

export const OUTBOUND_ROLES = [
  { id: 'vendedor',     label: 'Vendedor',      desc: 'Prospección y cierre de ventas',          color: '#22c55e' },
  { id: 'cotizador',    label: 'Cotizador',      desc: 'Envío y seguimiento de cotizaciones',     color: '#3b82f6' },
  { id: 'seguimiento',  label: 'Seguimiento',    desc: 'Seguimiento a leads y clientes activos',  color: '#f59e0b' },
  { id: 'recuperacion', label: 'Recuperación',   desc: 'Reactivar clientes inactivos o perdidos', color: '#a855f7' },
  { id: 'cobrador',     label: 'Cobrador',       desc: 'Recordatorios de pago y cobranza',        color: '#ef4444' },
] as const;

export type OutboundRoleId = typeof OUTBOUND_ROLES[number]['id'];

export const OUTBOUND_ROLES_MAP = Object.fromEntries(
  OUTBOUND_ROLES.map(r => [r.id, r])
) as Record<OutboundRoleId, typeof OUTBOUND_ROLES[number]>;

export default function OutboundRoleSelector({
  token,
  initialRole,
}: {
  token: string;
  initialRole: string | null;
}) {
  const [role, setRole]     = useState(initialRole ?? '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved]   = useState(false);
  const [error, setError]   = useState('');

  const onChange = async (next: string) => {
    setRole(next);
    setSaving(true);
    setError('');
    try {
      const res = await fetch(`/api/portal/${token}/settings`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ outbound_role: next || null }),
      });
      if (!res.ok) { setError('No se pudo guardar.'); return; }
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <select
        value={role}
        onChange={e => onChange(e.target.value)}
        disabled={saving}
        className="w-full rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#6C3BFF]"
        style={{
          background: 'var(--c-input-bg)',
          border: '1px solid var(--c-input-border)',
          color: role ? 'var(--c-text)' : 'var(--c-text-3)',
          opacity: saving ? 0.6 : 1,
        }}
      >
        <option value="">Sin rol asignado</option>
        {OUTBOUND_ROLES.map(r => (
          <option key={r.id} value={r.id}>{r.label}: {r.desc}</option>
        ))}
      </select>

      <div className="mt-2 h-4 flex items-center gap-1.5">
        {saving && <><Loader2 size={11} className="animate-spin" style={{ color: 'var(--c-text-3)' }} /><span className="text-xs" style={{ color: 'var(--c-text-3)' }}>Guardando…</span></>}
        {saved  && <span className="text-xs" style={{ color: '#22c55e' }}>Rol guardado</span>}
        {error  && <span className="text-xs" style={{ color: '#f87171' }}>{error}</span>}
      </div>
    </div>
  );
}
