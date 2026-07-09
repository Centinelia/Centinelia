'use client';

import { useState, useEffect } from 'react';
import { Zap, RefreshCw, AlertTriangle } from 'lucide-react';

const THRESHOLD_OPTIONS = [25, 50, 75, 100];
const REFILL_OPTIONS = [
  { minutes: 100, price: 1200 },
  { minutes: 200, price: 2400 },
];

export default function AutoRefillSection({ token }: { token: string }) {
  const [enabled,   setEnabled]   = useState(false);
  const [threshold, setThreshold] = useState(50);
  const [minutes,   setMinutes]   = useState(100);
  const [hasCard,   setHasCard]   = useState(false);
  const [saving,    setSaving]    = useState(false);
  const [saved,     setSaved]     = useState(false);
  const [loading,   setLoading]   = useState(true);

  useEffect(() => {
    fetch(`/api/portal/${token}/auto-refill`)
      .then(r => r.json())
      .then(d => {
        setEnabled(d.enabled ?? false);
        setThreshold(d.threshold ?? 50);
        setMinutes(d.minutes ?? 100);
        setHasCard(d.hasCard ?? false);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [token]);

  const save = async () => {
    setSaving(true);
    await fetch(`/api/portal/${token}/auto-refill`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ enabled, threshold, minutes }),
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  const canSave = !enabled || hasCard;

  if (loading) return (
    <div className="h-10 rounded-lg animate-pulse" style={{ background: 'var(--c-border)' }} />
  );

  return (
    <div className="flex flex-col gap-4">
      {/* Toggle */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold" style={{ color: 'var(--c-text)' }}>Auto-recarga</p>
          <p className="text-xs mt-0.5" style={{ color: 'var(--c-text-3)' }}>
            Recarga automática cuando tu saldo baje del umbral
          </p>
        </div>
        <button
          onClick={() => setEnabled(e => !e)}
          style={{
            position: 'relative', flexShrink: 0,
            width: 44, height: 24, borderRadius: 12,
            background: enabled ? '#6C3BFF' : 'var(--c-border)',
            border: 'none', cursor: 'pointer', transition: 'background 0.2s',
          }}
        >
          <span style={{
            position: 'absolute', top: 3,
            left: enabled ? 23 : 3,
            width: 18, height: 18, borderRadius: '50%',
            background: '#fff', transition: 'left 0.18s',
            boxShadow: '0 1px 3px rgba(0,0,0,0.25)',
          }} />
        </button>
      </div>

      {enabled && (
        <>
          {/* Threshold */}
          <div>
            <p className="text-xs font-semibold mb-1.5" style={{ color: 'var(--c-text-3)' }}>
              Recargar cuando queden menos de
            </p>
            <div className="grid grid-cols-4 gap-1.5">
              {THRESHOLD_OPTIONS.map(t => (
                <button
                  key={t}
                  onClick={() => setThreshold(t)}
                  className="py-2 rounded-lg text-xs font-semibold transition-all"
                  style={{
                    background: threshold === t ? 'rgba(108,59,255,0.12)' : 'var(--c-surface-2)',
                    border:     `1px solid ${threshold === t ? 'rgba(108,59,255,0.4)' : 'var(--c-border)'}`,
                    color:      threshold === t ? '#6C3BFF' : 'var(--c-text-2)',
                    cursor:     'pointer',
                  }}
                >
                  {t} min
                </button>
              ))}
            </div>
          </div>

          {/* Refill amount */}
          <div>
            <p className="text-xs font-semibold mb-1.5" style={{ color: 'var(--c-text-3)' }}>
              Agregar automáticamente
            </p>
            <div className="grid grid-cols-2 gap-1.5">
              {REFILL_OPTIONS.map(o => (
                <button
                  key={o.minutes}
                  onClick={() => setMinutes(o.minutes)}
                  className="flex flex-col items-center py-2.5 rounded-lg transition-all"
                  style={{
                    background: minutes === o.minutes ? 'rgba(108,59,255,0.12)' : 'var(--c-surface-2)',
                    border:     `1px solid ${minutes === o.minutes ? 'rgba(108,59,255,0.4)' : 'var(--c-border)'}`,
                    color:      minutes === o.minutes ? '#6C3BFF' : 'var(--c-text-2)',
                    cursor:     'pointer',
                  }}
                >
                  <span className="text-sm font-bold">{o.minutes} min</span>
                  <span className="text-xs mt-0.5" style={{ opacity: 0.7 }}>
                    ${o.price.toLocaleString('es-MX')} MXN
                  </span>
                </button>
              ))}
            </div>
          </div>

          {!hasCard && (
            <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg text-xs"
              style={{ background: 'rgba(245,158,11,0.07)', border: '1px solid rgba(245,158,11,0.2)', color: '#f59e0b' }}>
              <AlertTriangle size={13} style={{ flexShrink: 0, marginTop: 1 }} />
              Para activar la auto-recarga, primero realiza una compra de minutos extra. Tu tarjeta quedará guardada para cargos futuros.
            </div>
          )}
        </>
      )}

      <button
        onClick={save}
        disabled={saving || !canSave}
        className="flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs font-semibold transition-all"
        style={{
          background: saved ? 'rgba(34,197,94,0.12)' : 'rgba(108,59,255,0.1)',
          border:     `1px solid ${saved ? 'rgba(34,197,94,0.3)' : 'rgba(108,59,255,0.25)'}`,
          color:      saved ? '#22c55e' : '#9B6DFF',
          cursor:     (saving || !canSave) ? 'not-allowed' : 'pointer',
          opacity:    (saving || !canSave) ? 0.5 : 1,
        }}
      >
        {saved
          ? <><RefreshCw size={12} /> Guardado</>
          : saving
          ? 'Guardando…'
          : <><Zap size={12} /> Guardar configuración</>}
      </button>
    </div>
  );
}
