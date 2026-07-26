'use client';

import { useState } from 'react';
import { Check, Loader2, Shield } from 'lucide-react';

export default function DailyCapEditor({
  agentId,
  initialCap,
  monthlyIncluded,
}: {
  agentId: string;
  initialCap: number | null;
  monthlyIncluded: number;
}) {
  const [enabled, setEnabled] = useState(initialCap != null && initialCap > 0);
  const [cap, setCap]         = useState<string>(initialCap != null && initialCap > 0 ? String(initialCap) : '');
  const [loading, setLoading] = useState(false);
  const [saved, setSaved]     = useState(false);

  const suggested = monthlyIncluded > 0 ? Math.max(30, Math.round(monthlyIncluded / 5)) : 60;

  const save = async () => {
    setLoading(true);
    setSaved(false);
    const value = enabled ? parseInt(cap) : null;
    const body = { daily_minutes_cap: enabled && Number.isFinite(value) && (value as number) > 0 ? value : null };
    const res = await fetch(`/api/admin/agentes/${agentId}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
    });
    setLoading(false);
    if (res.ok) {
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    }
  };

  return (
    <div className="p-5 rounded-xl flex flex-col gap-4" style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)' }}>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Shield size={13} style={{ color: 'var(--c-text-3)' }} />
          <span className="text-xs font-semibold tracking-widest uppercase" style={{ color: 'var(--c-text-3)' }}>
            Protección de gasto diario
          </span>
        </div>
        {saved && (
          <span className="flex items-center gap-1 text-xs font-medium" style={{ color: '#22c55e' }}>
            <Check size={12} /> Guardado
          </span>
        )}
      </div>

      <p className="text-xs" style={{ color: 'var(--c-text-3)', lineHeight: 1.55 }}>
        Cuando se activa, el agente rechaza llamadas con un mensaje corto una vez que la cuenta supere el cap del día.
        Útil contra picos anómalos, bots o loops accidentales. Los owners nunca son bloqueados.
      </p>

      {/* Toggle */}
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-medium" style={{ color: 'var(--c-text-2)' }}>
          Activar cap diario
        </span>
        <button
          type="button"
          onClick={() => setEnabled(v => !v)}
          className="relative w-10 h-6 rounded-full transition-colors flex-shrink-0"
          style={{ background: enabled ? '#6C3BFF' : 'var(--c-surface-2)', border: '1px solid var(--c-border)' }}
        >
          <span
            className="absolute top-0.5 left-0.5 w-4 h-4 rounded-full transition-transform"
            style={{ background: '#fff', transform: enabled ? 'translateX(16px)' : 'translateX(0)' }}
          />
        </button>
      </div>

      {enabled && (
        <div className="flex flex-col gap-2">
          <label className="text-xs" style={{ color: 'var(--c-text-3)' }}>
            Máximo de minutos/día para toda la cuenta
          </label>
          <div className="flex gap-2">
            <input
              type="number"
              min={1}
              value={cap}
              onChange={e => setCap(e.target.value)}
              placeholder={String(suggested)}
              className="flex-1 rounded-lg px-3 py-2 text-sm outline-none"
              style={{ background: 'var(--c-input-bg)', border: '1px solid var(--c-input-border)', color: 'var(--c-text)' }}
            />
            <button
              type="button"
              onClick={() => setCap(String(suggested))}
              className="px-3 py-2 rounded-lg text-xs font-medium transition-opacity hover:opacity-80"
              style={{ background: 'var(--c-surface-2)', color: 'var(--c-text-3)', border: '1px solid var(--c-border)' }}
            >
              Sugerido {suggested}
            </button>
          </div>
          <p className="text-xs" style={{ color: 'var(--c-text-4)' }}>
            Sugerido = mensual ÷ 5. Ajusta según el patrón real del cliente.
          </p>
        </div>
      )}

      <button
        type="button"
        onClick={save}
        disabled={loading || (enabled && (!cap || parseInt(cap) <= 0))}
        className="flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-semibold transition-opacity hover:opacity-90 disabled:opacity-50"
        style={{ background: '#6C3BFF', color: '#fff' }}
      >
        {loading ? <Loader2 size={14} className="animate-spin" /> : 'Guardar cap diario'}
      </button>
    </div>
  );
}
