'use client';

import { useState } from 'react';
import { Phone, PhoneIncoming, X, Loader2 } from 'lucide-react';
import { OUTBOUND_CAPABILITIES } from '@/lib/portal/outbound-capabilities';
import { MEERKAT_ROLES } from '@/lib/portal/meerkat-roles';

interface Props {
  token:                  string;
  initOutbound:           boolean;
  initMissedCallRecovery: boolean;
  agentCapabilities?:     string[];
  agentName?:             string;
}

/** Meerkats que declaran cada capability, para el hover-tooltip discovery. */
const CAPABILITY_OWNERS: Record<string, { id: string; nombre: string; imagen: string; color: string }[]> =
  OUTBOUND_CAPABILITIES.reduce((acc, cap) => {
    acc[cap.id] = MEERKAT_ROLES
      .filter(m => (m.features.outbound_capabilities ?? []).includes(cap.id) && m.id !== 'custom')
      .map(m => ({ id: m.id, nombre: m.nombre, imagen: m.imagen, color: m.color }));
    return acc;
  }, {} as Record<string, { id: string; nombre: string; imagen: string; color: string }[]>);

function Toggle({ on, onChange, disabled }: { on: boolean; onChange: (v: boolean) => void; disabled: boolean }) {
  return (
    <button
      role="switch"
      aria-checked={on}
      disabled={disabled}
      onClick={() => onChange(!on)}
      style={{
        width:         44,
        height:        24,
        borderRadius:  12,
        border:        'none',
        cursor:        disabled ? 'default' : 'pointer',
        background:    on ? '#6C3BFF' : 'var(--c-surface-2)',
        outline:       on ? '2px solid rgba(108,59,255,0.3)' : '1px solid var(--c-border)',
        outlineOffset: 0,
        position:      'relative',
        transition:    'background 0.2s, outline 0.2s',
        flexShrink:    0,
      }}
    >
      <span style={{
        position:     'absolute',
        top:          3,
        left:         on ? 23 : 3,
        width:        18,
        height:       18,
        borderRadius: '50%',
        background:   '#fff',
        transition:   'left 0.18s',
        boxShadow:    '0 1px 3px rgba(0,0,0,0.3)',
      }} />
    </button>
  );
}

function OutboundConsentModal({ onConfirm, onCancel, saving }: {
  onConfirm: () => void;
  onCancel:  () => void;
  saving:    boolean;
}) {
  const [checked, setChecked] = useState(false);

  return (
    <div
      style={{
        position:       'fixed',
        inset:          0,
        zIndex:         50,
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'center',
        padding:        16,
        background:     'rgba(0,0,0,0.6)',
        backdropFilter: 'blur(4px)',
      }}
      onClick={e => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div style={{
        width:        '100%',
        maxWidth:     480,
        borderRadius: 16,
        overflow:     'hidden',
        background:   'var(--c-modal)',
        border:       '1px solid var(--c-border)',
        boxShadow:    '0 24px 64px rgba(0,0,0,0.4)',
      }}>
        {/* Header */}
        <div style={{
          display:        'flex',
          alignItems:     'center',
          justifyContent: 'space-between',
          padding:        '16px 20px',
          borderBottom:   '1px solid var(--c-border)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width:          32,
              height:         32,
              borderRadius:   8,
              background:     'rgba(108,59,255,0.12)',
              border:         '1px solid rgba(108,59,255,0.25)',
              display:        'flex',
              alignItems:     'center',
              justifyContent: 'center',
              flexShrink:     0,
            }}>
              <Phone size={15} style={{ color: '#6C3BFF' }} />
            </div>
            <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--c-text)', margin: 0 }}>
              Activar llamadas salientes
            </p>
          </div>
          <button
            onClick={onCancel}
            style={{
              background: 'none',
              border:     'none',
              cursor:     'pointer',
              padding:    6,
              borderRadius: 8,
              color:      'var(--c-text-3)',
              display:    'flex',
            }}
            aria-label="Cerrar"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '20px 20px 4px' }}>
          <p style={{ fontSize: 13, color: 'var(--c-text-2)', lineHeight: 1.65, margin: '0 0 20px' }}>
            Al activar las llamadas salientes confirmo que las usaré exclusivamente
            para contactar a personas con relación previa a mi organización: clientes
            actuales, prospectos que dejaron sus datos, y devolución de llamadas
            perdidas. Entiendo que como responsable de las llamadas, debo cumplir
            con la Lista Nacional de No Llamar (LNCL) de PROFECO cuando aplique.
          </p>

          <label style={{
            display:    'flex',
            alignItems: 'flex-start',
            gap:        10,
            cursor:     'pointer',
            padding:    '12px 14px',
            borderRadius: 10,
            background: checked ? 'rgba(108,59,255,0.07)' : 'var(--c-surface-2)',
            border:     `1px solid ${checked ? 'rgba(108,59,255,0.3)' : 'var(--c-border)'}`,
            transition: 'background 0.15s, border-color 0.15s',
          }}>
            <input
              type="checkbox"
              checked={checked}
              onChange={e => setChecked(e.target.checked)}
              style={{ marginTop: 2, accentColor: '#6C3BFF', flexShrink: 0, width: 15, height: 15 }}
            />
            <span style={{ fontSize: 12, color: 'var(--c-text-2)', lineHeight: 1.5 }}>
              He leído y acepto los términos de uso responsable de llamadas salientes.
            </span>
          </label>
        </div>

        {/* Footer */}
        <div style={{
          display:        'flex',
          justifyContent: 'flex-end',
          gap:            8,
          padding:        '16px 20px',
        }}>
          <button
            onClick={onCancel}
            disabled={saving}
            style={{
              padding:      '8px 16px',
              borderRadius: 10,
              fontSize:     13,
              fontWeight:   500,
              cursor:       'pointer',
              background:   'var(--c-surface-2)',
              border:       '1px solid var(--c-border)',
              color:        'var(--c-text-2)',
            }}
          >
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            disabled={!checked || saving}
            style={{
              padding:      '8px 18px',
              borderRadius: 10,
              fontSize:     13,
              fontWeight:   600,
              cursor:       !checked || saving ? 'default' : 'pointer',
              background:   !checked ? 'var(--c-surface-2)' : '#6C3BFF',
              border:       'none',
              color:        !checked ? 'var(--c-text-3)' : '#fff',
              display:      'flex',
              alignItems:   'center',
              gap:          6,
              transition:   'background 0.15s, color 0.15s',
            }}
          >
            {saving && <Loader2 size={13} className="animate-spin" />}
            Activar
          </button>
        </div>
      </div>
    </div>
  );
}

export default function OutboundToggles({ token, initOutbound, initMissedCallRecovery, agentCapabilities = [], agentName }: Props) {
  const [outbound,     setOutbound]     = useState(initOutbound);
  const [missed,       setMissed]       = useState(initMissedCallRecovery);
  const [saving,       setSaving]       = useState<string | null>(null);
  const [saved,        setSaved]        = useState<string | null>(null);
  const [showConsent,  setShowConsent]  = useState(false);
  const [hoverCap,     setHoverCap]     = useState<string | null>(null);
  const activeCaps = new Set(agentCapabilities);

  async function update(field: string, value: boolean) {
    setSaving(field);
    setSaved(null);
    try {
      await fetch(`/api/portal/${token}/settings`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ [field]: value }),
      });
      setSaved(field);
      setTimeout(() => setSaved(null), 2000);
    } finally {
      setSaving(null);
    }
  }

  function handleOutboundToggle(v: boolean) {
    if (v) {
      // Turning ON — require consent first
      setShowConsent(true);
    } else {
      setOutbound(false);
      update('outbound_calls', false);
    }
  }

  async function handleConsentConfirm() {
    setOutbound(true);
    await update('outbound_calls', true);
    setShowConsent(false);
  }

  function handleConsentCancel() {
    setShowConsent(false);
    setOutbound(false);
  }

  const rows: {
    field:  string;
    icon:   React.ReactNode;
    label:  string;
    desc:   string;
    value:  boolean;
    set:    (v: boolean) => void;
    hint?:  string;
  }[] = [
    {
      field: 'outbound_calls',
      icon:  <Phone size={15} style={{ color: '#6C3BFF' }} />,
      label: 'Llamadas salientes',
      desc:  'Permite que el empleado realice llamadas a tus contactos de forma manual o automática.',
      value: outbound,
      set:   handleOutboundToggle,
      hint:  outbound ? undefined : 'Actívalo para comenzar a usar esta función.',
    },
    {
      field: 'missed_call_recovery',
      icon:  <PhoneIncoming size={15} style={{ color: '#9B6DFF' }} />,
      label: 'Devolución automática',
      desc:  'Si un cliente llama y el empleado no puede contestar, el empleado lo llama de regreso automáticamente para disculparse y atenderle.',
      value: missed,
      set:   (v) => { setMissed(v); update('missed_call_recovery', v); },
    },
  ];

  return (
    <>
      {showConsent && (
        <OutboundConsentModal
          onConfirm={handleConsentConfirm}
          onCancel={handleConsentCancel}
          saving={saving === 'outbound_calls'}
        />
      )}

      <div className="flex flex-col gap-5">

        {/* Capability discovery: iluminados = puede este empleado, muted = otro meerkat */}
        <div className="flex flex-col gap-3">
          <div>
            <h2 className="text-sm font-bold" style={{ color: 'var(--c-text)' }}>
              Tu empleado puede salir a trabajar
            </h2>
            <p className="text-xs mt-1" style={{ color: 'var(--c-text-3)' }}>
              {outbound
                ? `Estas son las tareas${agentName ? ` que ${agentName}` : ' que este empleado'} puede ejecutar. Los grises los desbloquea otro empleado (pasa el mouse para ver cuál).`
                : 'Activa las llamadas salientes abajo. Estas son las tareas que puede hacer este empleado; los grises los desbloquea otro (pasa el mouse para ver cuál).'}
            </p>
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            {OUTBOUND_CAPABILITIES.map(cap => {
              const isActive = outbound && activeCaps.has(cap.id);
              const owners   = CAPABILITY_OWNERS[cap.id] ?? [];
              return (
                <div
                  key={cap.id}
                  onMouseEnter={() => !isActive && setHoverCap(cap.id)}
                  onMouseLeave={() => setHoverCap(null)}
                  className="relative flex items-center gap-2 px-3 py-2 rounded-lg transition-opacity basis-[calc(50%-4px)] sm:basis-[calc(33.333%-6px)] max-w-full"
                  style={{
                    background: isActive ? 'rgba(108,59,255,0.10)' : 'var(--c-surface-2)',
                    border:     isActive ? '1px solid rgba(108,59,255,0.35)' : '1px solid var(--c-border)',
                    opacity:    isActive ? 1 : 0.55,
                    cursor:     isActive ? 'default' : 'help',
                  }}
                  title={isActive ? cap.description : undefined}
                >
                  <div
                    className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                    style={{ background: isActive ? '#6C3BFF' : 'var(--c-text-4)' }}
                  />
                  <span className="text-xs truncate" style={{ color: isActive ? 'var(--c-text)' : 'var(--c-text-3)' }}>
                    {cap.label}
                  </span>

                  {hoverCap === cap.id && !isActive && owners.length > 0 && (
                    <div
                      className="absolute z-10 top-full left-0 mt-1 min-w-[180px] rounded-xl shadow-lg p-2.5"
                      style={{
                        background: 'var(--c-modal)',
                        border:     '1px solid var(--c-border)',
                        boxShadow:  '0 8px 24px rgba(0,0,0,0.15)',
                      }}
                    >
                      <p className="text-[10px] uppercase tracking-wider font-semibold mb-2" style={{ color: 'var(--c-text-4)' }}>
                        Lo desbloquea
                      </p>
                      <div className="flex flex-col gap-1.5">
                        {owners.map(o => (
                          <div key={o.id} className="flex items-center gap-2">
                            <div
                              className="w-6 h-6 rounded-full flex-shrink-0 overflow-hidden"
                              style={{ background: `${o.color}18`, border: `1px solid ${o.color}55` }}
                            >
                              <img src={o.imagen} alt={o.nombre} className="w-full h-full object-cover" />
                            </div>
                            <span className="text-xs font-medium" style={{ color: 'var(--c-text)' }}>
                              {o.nombre}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Permisos */}
        <div className="flex flex-col gap-3">
          <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--c-text-4)' }}>
            Permisos
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {rows.map(r => (
              <div key={r.field} style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            <div style={{
              display:        'flex',
              alignItems:     'center',
              justifyContent: 'space-between',
              gap:            16,
              padding:        '12px 14px',
              borderRadius:   r.hint ? '12px 12px 0 0' : 12,
              background:     'var(--c-surface-2)',
              border:         '1px solid var(--c-border)',
              borderBottom:   r.hint ? 'none' : '1px solid var(--c-border)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
                <div style={{
                  width:          32,
                  height:         32,
                  borderRadius:   8,
                  background:     'var(--c-surface)',
                  border:         '1px solid var(--c-border)',
                  display:        'flex',
                  alignItems:     'center',
                  justifyContent: 'center',
                  flexShrink:     0,
                }}>
                  {r.icon}
                </div>
                <div style={{ minWidth: 0 }}>
                  <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--c-text)', margin: 0, lineHeight: 1.3 }}>
                    {r.label}
                    {saved === r.field && (
                      <span style={{ marginLeft: 8, fontSize: 11, color: '#22c55e', fontWeight: 500 }}>Guardado ✓</span>
                    )}
                  </p>
                  <p style={{ fontSize: 12, color: 'var(--c-text-3)', margin: '2px 0 0', lineHeight: 1.4 }}>
                    {r.desc}
                  </p>
                </div>
              </div>
              <Toggle on={r.value} onChange={r.set} disabled={saving === r.field} />
            </div>

            {r.hint && (
              <div style={{
                padding:      '8px 14px',
                borderRadius: '0 0 12px 12px',
                background:   'var(--c-surface-2)',
                border:       '1px solid var(--c-border)',
                borderTop:    '1px solid var(--c-border)',
              }}>
                <p style={{ fontSize: 11, color: 'var(--c-text-3)', margin: 0 }}>{r.hint}</p>
              </div>
            )}
          </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
