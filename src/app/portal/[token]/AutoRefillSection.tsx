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
        background: on ? '#6C3BFF' : '#E8E3F5',
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
    <div className="h-10 rounded-lg animate-pulse" style={{ background: '#E8E3F5' }} />
  );

  return (
    <div className="flex flex-col gap-5">

      {/* ── Minutos ── */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold" style={{ color: '#1A0A3B' }}>Minutos</p>
            <p className="text-xs mt-0.5" style={{ color: '#6B6480' }}>
              Recarga cuando el saldo de minutos baje del umbral
            </p>
          </div>
          <Toggle on={minEnabled} onToggle={() => setMinEnabled(e => !e)} />
        </div>

        {minEnabled && (
          <>
            <div>
              <p className="text-xs font-semibold mb-1.5" style={{ color: '#6B6480' }}>
                Recargar cuando queden menos de
              </p>
              <div className="grid grid-cols-4 gap-1.5">
                {MIN_THRESHOLD_OPTIONS.map(t => (
                  <button key={t} onClick={() => setMinThreshold(t)}
                    className="py-2.5 rounded-lg text-[12px] font-semibold transition-all"
                    style={{
                      background: minThreshold === t ? '#6C3BFF' : '#ffffff',
                      border:     `1px solid ${minThreshold === t ? '#6C3BFF' : '#E8E3F5'}`,
                      color:      minThreshold === t ? '#ffffff' : '#6B6480',
                      boxShadow:  minThreshold === t ? '0 1px 2px rgba(108,59,255,0.24)' : 'none',
                      cursor:     'pointer',
                    }}
                  >{t} min</button>
                ))}
              </div>
            </div>
            <div>
              <p className="text-xs font-semibold mb-1.5" style={{ color: '#6B6480' }}>
                Agregar automáticamente
              </p>
              <div className="grid grid-cols-2 gap-1.5">
                {MIN_REFILL_OPTIONS.map(o => {
                  const active = minMinutes === o.minutes;
                  return (
                    <button key={o.minutes} onClick={() => setMinMinutes(o.minutes)}
                      className="flex flex-col items-start gap-1 p-3 rounded-xl text-left transition-all"
                      style={{
                        background: active ? 'rgba(108,59,255,0.06)' : '#ffffff',
                        border:     `1px solid ${active ? '#6C3BFF' : '#E8E3F5'}`,
                        boxShadow:  active ? '0 4px 12px rgba(108,59,255,0.12)' : '0 1px 2px rgba(26,10,59,0.04)',
                        cursor:     'pointer',
                      }}
                    >
                      <div className="flex items-baseline gap-1">
                        <span className="text-[20px] font-bold leading-none tabular-nums tracking-tight" style={{ color: '#1A0A3B' }}>
                          {o.minutes}
                        </span>
                        <span className="text-[12px]" style={{ color: '#9B8FB5' }}>min</span>
                      </div>
                      <span className="text-[11px] tabular-nums" style={{ color: '#6B6480' }}>
                        ${o.price.toLocaleString('es-MX')} + IVA
                      </span>
                    </button>
                  );
                })}
              </div>
              {(() => {
                const base = MIN_REFILL_OPTIONS.find(o => o.minutes === minMinutes)?.price ?? 0;
                const total = withIva(base);
                return (
                  <p className="text-xs mt-3" style={{ color: '#6B6480' }}>
                    Total con IVA: <span style={{ color: '#6C3BFF', fontWeight: 600 }}>${total.toLocaleString('es-MX')} MXN</span>
                  </p>
                );
              })()}
            </div>
          </>
        )}
      </div>

      <div style={{ borderTop: '1px solid #E8E3F5' }} />

      {/* ── Tareas ── */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold" style={{ color: '#1A0A3B' }}>Tareas</p>
            <p className="text-xs mt-0.5" style={{ color: '#6B6480' }}>
              Recarga cuando el saldo de tareas baje del umbral
            </p>
          </div>
          <Toggle on={opsEnabled} onToggle={() => setOpsEnabled(e => !e)} />
        </div>

        {opsEnabled && (
          <>
            <div>
              <p className="text-xs font-semibold mb-1.5" style={{ color: '#6B6480' }}>
                Recargar cuando queden menos de
              </p>
              <div className="grid grid-cols-4 gap-1.5">
                {OPS_THRESHOLD_OPTIONS.map(t => (
                  <button key={t} onClick={() => setOpsThreshold(t)}
                    className="py-2.5 rounded-lg text-[12px] font-semibold transition-all"
                    style={{
                      background: opsThreshold === t ? '#6C3BFF' : '#ffffff',
                      border:     `1px solid ${opsThreshold === t ? '#6C3BFF' : '#E8E3F5'}`,
                      color:      opsThreshold === t ? '#ffffff' : '#6B6480',
                      boxShadow:  opsThreshold === t ? '0 1px 2px rgba(108,59,255,0.24)' : 'none',
                      cursor:     'pointer',
                    }}
                  >{t} tareas</button>
                ))}
              </div>
            </div>
            <div>
              <p className="text-xs font-semibold mb-1.5" style={{ color: '#6B6480' }}>
                Agregar automáticamente
              </p>
              <div className="grid grid-cols-2 gap-1.5">
                {OPS_REFILL_OPTIONS.map(o => {
                  const active = opsAmount === o.ops;
                  return (
                    <button key={o.ops} onClick={() => setOpsAmount(o.ops)}
                      className="flex flex-col items-start gap-1 p-3 rounded-xl text-left transition-all"
                      style={{
                        background: active ? 'rgba(108,59,255,0.06)' : '#ffffff',
                        border:     `1px solid ${active ? '#6C3BFF' : '#E8E3F5'}`,
                        boxShadow:  active ? '0 4px 12px rgba(108,59,255,0.12)' : '0 1px 2px rgba(26,10,59,0.04)',
                        cursor:     'pointer',
                      }}
                    >
                      <div className="flex items-baseline gap-1">
                        <span className="text-[20px] font-bold leading-none tabular-nums tracking-tight" style={{ color: '#1A0A3B' }}>
                          {o.ops}
                        </span>
                        <span className="text-[12px]" style={{ color: '#9B8FB5' }}>tareas</span>
                      </div>
                      <span className="text-[11px] tabular-nums" style={{ color: '#6B6480' }}>
                        ${o.price.toLocaleString('es-MX')} + IVA
                      </span>
                    </button>
                  );
                })}
              </div>
              {(() => {
                const base = OPS_REFILL_OPTIONS.find(o => o.ops === opsAmount)?.price ?? 0;
                const total = withIva(base);
                return (
                  <p className="text-xs mt-3" style={{ color: '#6B6480' }}>
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
        className="flex items-center justify-center gap-2 py-3 rounded-xl text-[14px] font-semibold transition-all hover:opacity-90 disabled:cursor-not-allowed"
        style={{
          background: saved ? '#22c55e' : canSave ? '#6C3BFF' : '#FAFAFB',
          color:      canSave || saved ? '#ffffff' : '#9B8FB5',
          border:     canSave || saved ? 'none' : '1px solid #E8E3F5',
          boxShadow:  saved
            ? '0 4px 12px rgba(34,197,94,0.24)'
            : canSave ? '0 4px 12px rgba(108,59,255,0.24)' : 'none',
          opacity:    saving ? 0.6 : 1,
        }}
      >
        {saved
          ? <><RefreshCw size={13} /> Guardado</>
          : saving
          ? 'Guardando…'
          : <><Zap size={13} /> Guardar configuración</>}
      </button>
    </div>
  );
}
