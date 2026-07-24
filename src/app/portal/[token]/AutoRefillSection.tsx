'use client';

import { useState, useEffect } from 'react';
import { Zap, RefreshCw, AlertTriangle } from 'lucide-react';

const MIN_THRESHOLD_OPTIONS = [25, 50, 75, 100];
const MIN_REFILL_OPTIONS    = [{ minutes: 100, price: 1200 }, { minutes: 200, price: 2400 }];
const OPS_THRESHOLD_OPTIONS = [50, 100, 150, 200];
const OPS_REFILL_OPTIONS    = [{ ops: 100, price: 800 }, { ops: 300, price: 2100 }];

const IVA = 0.16;
const withIva = (n: number) => Math.round(n * (1 + IVA));

function Toggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      style={{
        position: 'relative', flexShrink: 0,
        width: 44, height: 24, borderRadius: 12,
        background: on ? '#6C3BFF' : 'var(--c-border)',
        border: 'none', cursor: 'pointer', transition: 'background 0.2s',
      }}
    >
      <span style={{
        position: 'absolute', top: 3,
        left: on ? 23 : 3,
        width: 18, height: 18, borderRadius: '50%',
        background: '#fff', transition: 'left 0.18s',
        boxShadow: '0 1px 3px rgba(0,0,0,0.25)',
      }} />
    </button>
  );
}

export default function AutoRefillSection({ token }: { token: string }) {
  const [minEnabled,    setMinEnabled]    = useState(false);
  const [minThreshold,  setMinThreshold]  = useState(50);
  const [minMinutes,    setMinMinutes]    = useState(100);
  const [opsEnabled,    setOpsEnabled]    = useState(false);
  const [opsThreshold,  setOpsThreshold]  = useState(50);
  const [opsAmount,     setOpsAmount]     = useState(100);
  const [hasCard,       setHasCard]       = useState(false);
  const [saving,        setSaving]        = useState(false);
  const [saved,         setSaved]         = useState(false);
  const [loading,       setLoading]       = useState(true);

  useEffect(() => {
    fetch(`/api/portal/${token}/auto-refill`)
      .then(r => r.json())
      .then(d => {
        setMinEnabled(d.enabled      ?? false);
        setMinThreshold(d.threshold  ?? 50);
        setMinMinutes(d.minutes      ?? 100);
        setOpsEnabled(d.opsEnabled   ?? false);
        setOpsThreshold(d.opsThreshold ?? 50);
        setOpsAmount(d.opsAmount     ?? 100);
        setHasCard(d.hasCard         ?? false);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [token]);

  const save = async () => {
    setSaving(true);
    try {
      await fetch(`/api/portal/${token}/auto-refill`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          enabled:      minEnabled,
          threshold:    minThreshold,
          minutes:      minMinutes,
          opsEnabled,
          opsThreshold,
          opsAmount,
        }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } finally { setSaving(false); }
  };

  const canSave = (!minEnabled && !opsEnabled) || hasCard;

  if (loading) return (
    <div className="h-10 rounded-lg animate-pulse" style={{ background: 'var(--c-border)' }} />
  );

  return (
    <div className="flex flex-col gap-5">

      {/* ── Minutos ── */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold" style={{ color: 'var(--c-text)' }}>Minutos</p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--c-text-3)' }}>
              Recarga cuando el saldo de minutos baje del umbral
            </p>
          </div>
          <Toggle on={minEnabled} onToggle={() => setMinEnabled(e => !e)} />
        </div>

        {minEnabled && (
          <>
            <div>
              <p className="text-xs font-semibold mb-1.5" style={{ color: 'var(--c-text-3)' }}>
                Recargar cuando queden menos de
              </p>
              <div className="grid grid-cols-4 gap-1.5">
                {MIN_THRESHOLD_OPTIONS.map(t => (
                  <button key={t} onClick={() => setMinThreshold(t)}
                    className="py-2 rounded-lg text-xs font-semibold transition-all"
                    style={{
                      background: minThreshold === t ? 'rgba(108,59,255,0.12)' : 'var(--c-surface-2)',
                      border:     `1px solid ${minThreshold === t ? 'rgba(108,59,255,0.4)' : 'var(--c-border)'}`,
                      color:      minThreshold === t ? '#6C3BFF' : 'var(--c-text-2)',
                      cursor:     'pointer',
                    }}
                  >{t} min</button>
                ))}
              </div>
            </div>
            <div>
              <p className="text-xs font-semibold mb-1.5" style={{ color: 'var(--c-text-3)' }}>
                Agregar automáticamente
              </p>
              <div className="grid grid-cols-2 gap-1.5">
                {MIN_REFILL_OPTIONS.map(o => (
                  <button key={o.minutes} onClick={() => setMinMinutes(o.minutes)}
                    className="flex flex-col items-center py-2.5 rounded-lg transition-all"
                    style={{
                      background: minMinutes === o.minutes ? 'rgba(108,59,255,0.12)' : 'var(--c-surface-2)',
                      border:     `1px solid ${minMinutes === o.minutes ? 'rgba(108,59,255,0.4)' : 'var(--c-border)'}`,
                      color:      minMinutes === o.minutes ? '#6C3BFF' : 'var(--c-text-2)',
                      cursor:     'pointer',
                    }}
                  >
                    <span className="text-sm font-bold">{o.minutes} min</span>
                    <span className="text-xs mt-0.5" style={{ opacity: 0.7 }}>${o.price.toLocaleString('es-MX')} + IVA</span>
                  </button>
                ))}
              </div>
              {(() => {
                const base = MIN_REFILL_OPTIONS.find(o => o.minutes === minMinutes)?.price ?? 0;
                const total = withIva(base);
                return (
                  <p className="text-xs mt-1" style={{ color: 'var(--c-text-3)' }}>
                    Total con IVA: <span style={{ color: '#6C3BFF', fontWeight: 600 }}>${total.toLocaleString('es-MX')} MXN</span>
                  </p>
                );
              })()}
            </div>
          </>
        )}
      </div>

      <div style={{ borderTop: '1px solid var(--c-border)' }} />

      {/* ── Tareas ── */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold" style={{ color: 'var(--c-text)' }}>Tareas</p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--c-text-3)' }}>
              Recarga cuando el saldo de tareas baje del umbral
            </p>
          </div>
          <Toggle on={opsEnabled} onToggle={() => setOpsEnabled(e => !e)} />
        </div>

        {opsEnabled && (
          <>
            <div>
              <p className="text-xs font-semibold mb-1.5" style={{ color: 'var(--c-text-3)' }}>
                Recargar cuando queden menos de
              </p>
              <div className="grid grid-cols-4 gap-1.5">
                {OPS_THRESHOLD_OPTIONS.map(t => (
                  <button key={t} onClick={() => setOpsThreshold(t)}
                    className="py-2 rounded-lg text-xs font-semibold transition-all"
                    style={{
                      background: opsThreshold === t ? 'rgba(108,59,255,0.12)' : 'var(--c-surface-2)',
                      border:     `1px solid ${opsThreshold === t ? 'rgba(108,59,255,0.4)' : 'var(--c-border)'}`,
                      color:      opsThreshold === t ? '#6C3BFF' : 'var(--c-text-2)',
                      cursor:     'pointer',
                    }}
                  >{t} tareas</button>
                ))}
              </div>
            </div>
            <div>
              <p className="text-xs font-semibold mb-1.5" style={{ color: 'var(--c-text-3)' }}>
                Agregar automáticamente
              </p>
              <div className="grid grid-cols-2 gap-1.5">
                {OPS_REFILL_OPTIONS.map(o => (
                  <button key={o.ops} onClick={() => setOpsAmount(o.ops)}
                    className="flex flex-col items-center py-2.5 rounded-lg transition-all"
                    style={{
                      background: opsAmount === o.ops ? 'rgba(108,59,255,0.12)' : 'var(--c-surface-2)',
                      border:     `1px solid ${opsAmount === o.ops ? 'rgba(108,59,255,0.4)' : 'var(--c-border)'}`,
                      color:      opsAmount === o.ops ? '#6C3BFF' : 'var(--c-text-2)',
                      cursor:     'pointer',
                    }}
                  >
                    <span className="text-sm font-bold">{o.ops} tareas</span>
                    <span className="text-xs mt-0.5" style={{ opacity: 0.7 }}>${o.price.toLocaleString('es-MX')} + IVA</span>
                  </button>
                ))}
              </div>
              {(() => {
                const base = OPS_REFILL_OPTIONS.find(o => o.ops === opsAmount)?.price ?? 0;
                const total = withIva(base);
                return (
                  <p className="text-xs mt-1" style={{ color: 'var(--c-text-3)' }}>
                    Total con IVA: <span style={{ color: '#6C3BFF', fontWeight: 600 }}>${total.toLocaleString('es-MX')} MXN</span>
                  </p>
                );
              })()}
            </div>
          </>
        )}
      </div>

      {(minEnabled || opsEnabled) && !hasCard && (
        <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg text-xs"
          style={{ background: 'rgba(245,158,11,0.07)', border: '1px solid rgba(245,158,11,0.2)', color: '#f59e0b' }}>
          <AlertTriangle size={13} style={{ flexShrink: 0, marginTop: 1 }} />
          Para activar la auto-recarga, primero realiza una compra de minutos o tareas. Tu tarjeta quedará guardada para cargos futuros.
        </div>
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
