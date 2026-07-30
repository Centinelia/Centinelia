'use client';

import { useState, useEffect } from 'react';
import { Check, Loader2, ChevronDown } from 'lucide-react';

interface SubUser {
  id:   string;
  email: string;
  name:  string | null;
}

export default function ApprovalEmailEditor({ token, initialEmail }: { token: string; initialEmail: string }) {
  const [subUsers, setSubUsers] = useState<SubUser[]>([]);
  const [email,    setEmail]    = useState(initialEmail);
  const [saving,   setSaving]   = useState(false);
  const [saved,    setSaved]    = useState(false);
  const [loading,  setLoading]  = useState(true);

  useEffect(() => {
    fetch(`/api/portal/${token}/users`)
      .then(r => r.json())
      .then(d => { setSubUsers((d.users ?? []).filter((u: SubUser & { is_owner?: boolean }) => !u.is_owner)); setLoading(false); })
      .catch(() => setLoading(false));
  }, [token]);

  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/portal/${token}/settings`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ approval_email: email.trim() || null }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        setError(body.error ?? `HTTP ${res.status}`);
        return;
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setError(String(err));
    } finally { setSaving(false); }
  }

  if (loading) return <p className="text-sm" style={{ color: 'var(--c-text-3)' }}>Cargando...</p>;

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm" style={{ color: 'var(--c-text-sub)', lineHeight: 1.6 }}>
        Cuando este empleado redacte un borrador de respuesta, el sistema notificará a esta persona para que lo apruebe o descarte antes de enviarlo.
      </p>

      {subUsers.length > 0 ? (
        <div className="relative">
          <select
            value={email}
            onChange={e => setEmail(e.target.value)}
            className="w-full text-sm px-3 py-2 pr-8 rounded-lg outline-none appearance-none"
            style={{ background: 'var(--c-bg)', border: '1px solid var(--c-border)', color: email ? 'var(--c-text)' : 'var(--c-text-4)' }}
          >
            <option value="">Sin aprobador asignado</option>
            {subUsers.map(u => (
              <option key={u.id} value={u.email}>
                {u.name ? `${u.name} · ${u.email}` : u.email}
              </option>
            ))}
          </select>
          <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
            style={{ color: 'var(--c-text-3)' }} />
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          <input
            type="email"
            value={email}
            onChange={e => { setEmail(e.target.value); setSaved(false); }}
            placeholder="correo@empresa.com"
            className="w-full text-sm px-3 py-2 rounded-lg outline-none"
            style={{ background: 'var(--c-bg)', border: '1px solid var(--c-border)', color: 'var(--c-text)' }}
          />
          <p className="text-xs" style={{ color: 'var(--c-text-4)' }}>
            Si agregas sub-usuarios en <strong>Usuarios y permisos</strong>, podrás seleccionarlos desde un menú.
          </p>
        </div>
      )}

      <button
        onClick={save}
        disabled={saving}
        className="self-start flex items-center gap-2 text-sm font-semibold px-4 py-2 rounded-lg transition-opacity disabled:opacity-50"
        style={{ background: '#6C3BFF', color: '#fff' }}
      >
        {saving ? <Loader2 size={13} className="animate-spin" /> : saved ? <Check size={13} /> : null}
        {saved ? 'Guardado' : 'Guardar'}
      </button>
      {error && (
        <p className="text-xs" style={{ color: '#ef4444' }}>Error: {error}</p>
      )}
    </div>
  );
}
