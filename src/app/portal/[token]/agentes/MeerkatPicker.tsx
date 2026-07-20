'use client';

import { useState }                         from 'react';
import { useRouter }                        from 'next/navigation';
import { Plus, X, Check, ArrowLeft }        from 'lucide-react';
import { MEERKAT_ROLES, type MeerkatRole, type MeerkatRoleId }  from '@/lib/portal/meerkat-roles';

type Plan        = 'comercial' | 'pro';
type MinutesTier = 'starter' | 'growth' | 'scale';

const SETUP_FEE: Record<Plan, number> = {
  comercial: 8990,
  pro:       14990,
};

const JORNADAS: Record<Plan, { tier: MinutesTier; label: string; minutes: number; mxn: number }[]> = {
  comercial: [
    { tier: 'starter', label: 'Media Jornada',    minutes: 300,  mxn: 2997  },
    { tier: 'growth',  label: 'Jornada Completa', minutes: 600,  mxn: 5994  },
    { tier: 'scale',   label: 'Alta Demanda',     minutes: 1200, mxn: 11988 },
  ],
  pro: [
    { tier: 'starter', label: 'Media Jornada',    minutes: 300,  mxn: 2997  },
    { tier: 'growth',  label: 'Jornada Completa', minutes: 600,  mxn: 5994  },
    { tier: 'scale',   label: 'Alta Demanda',     minutes: 1200, mxn: 11988 },
  ],
};

function fmt(n: number) {
  return `$${n.toLocaleString('es-MX')} MXN`;
}

const CARD_SCALE: Partial<Record<MeerkatRoleId, number>> = {
  nia:   1.08,
  nelia: 0.965,
  niva:  0.985,
};

function MeerkatCardImage({ role }: { role: MeerkatRole }) {
  if (role.imagen) {
    const scale = CARD_SCALE[role.id];
    return (
      <img
        src={role.imagen}
        alt={role.nombre}
        className="w-full h-full"
        style={{
          objectFit: 'contain',
          objectPosition: 'center bottom',
          ...(scale ? { transform: `scale(${scale})`, transformOrigin: 'center bottom' } : {}),
        }}
      />
    );
  }
  if (role.id === 'custom') {
    return (
      <div className="w-full h-full flex items-center justify-center" style={{ background: `rgba(108,59,255,0.06)` }}>
        <svg viewBox="0 0 64 80" className="w-1/2 h-1/2" fill="rgba(108,59,255,0.25)">
          <ellipse cx="32" cy="26" rx="13" ry="14" />
          <ellipse cx="20" cy="16" rx="5" ry="6" />
          <ellipse cx="44" cy="16" rx="5" ry="6" />
          <rect x="14" y="38" width="36" height="28" rx="10" />
        </svg>
      </div>
    );
  }
  return (
    <div className="w-full h-full flex items-center justify-center text-4xl font-black"
      style={{ background: `${role.color}18`, color: role.color }}>
      {role.nombre[0]}
    </div>
  );
}

export default function MeerkatPicker({ token, plan = 'comercial', defaultTier = 'starter' }: {
  token:        string;
  plan?:        Plan;
  defaultTier?: MinutesTier;
}) {
  const [open,      setOpen]      = useState(false);
  const [selected,  setSelected]  = useState<MeerkatRole | null>(null);
  const [agentName, setAgentName] = useState('');
  const [tier,      setTier]      = useState<MinutesTier>(defaultTier);
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState('');
  const router = useRouter();

  const openPicker  = () => { setOpen(true); setSelected(null); setAgentName(''); setError(''); setTier(defaultTier); };
  const closePicker = () => { setOpen(false); setSelected(null); setAgentName(''); setError(''); };

  const handleSelect = (role: MeerkatRole) => {
    setSelected(role);
    setAgentName(role.id === 'custom' ? '' : role.nombre);
    setError('');
  };

  const handleCreate = async () => {
    if (!selected || !agentName.trim()) return;
    setLoading(true);
    setError('');
    try {
      const res  = await fetch(`/api/portal/${token}/agentes`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ meerkat_role_id: selected.id, agent_name: agentName.trim(), minutes_plan: tier }),
      });
      const data = await res.json() as { token?: string; checkoutUrl?: string; error?: string };
      if (data.token) {
        router.push(`/portal/${data.token}/configurar`);
      } else if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
      } else {
        setError(data.error ?? 'Error al crear el empleado');
        setLoading(false);
      }
    } catch {
      setError('Error de red, intenta de nuevo');
      setLoading(false);
    }
  };

  return (
    <>
      <button
        onClick={openPicker}
        className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-opacity hover:opacity-80"
        style={{ background: 'rgba(108,59,255,0.1)', color: '#9B6DFF', border: '1px solid rgba(108,59,255,0.25)' }}
      >
        <Plus size={13} />
        Agregar empleado
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(6px)' }}
          onClick={e => { if (e.target === e.currentTarget) closePicker(); }}
        >
          <div
            className="w-full max-w-2xl rounded-2xl overflow-hidden shadow-2xl flex flex-col"
            style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)', maxHeight: '90vh' }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 shrink-0"
              style={{ borderBottom: '1px solid var(--c-border)' }}>
              <div className="flex items-center gap-2">
                {selected && (
                  <button
                    onClick={() => setSelected(null)}
                    className="p-1 rounded-lg transition-opacity hover:opacity-70 mr-1"
                    style={{ color: 'var(--c-text-3)' }}
                  >
                    <ArrowLeft size={15} />
                  </button>
                )}
                <div>
                  <h2 className="font-bold text-base" style={{ color: 'var(--c-text)' }}>
                    {selected ? 'Confirmar contratación' : 'Elige un empleado'}
                  </h2>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--c-text-3)' }}>
                    {selected
                      ? 'Puedes cambiar el nombre y configurarlo después'
                      : 'Cada uno tiene un rol especializado, con herramientas listas desde el inicio'}
                  </p>
                </div>
              </div>
              <button
                onClick={closePicker}
                className="p-1.5 rounded-lg transition-opacity hover:opacity-70"
                style={{ color: 'var(--c-text-3)' }}
              >
                <X size={16} />
              </button>
            </div>

            {!selected ? (
              /* ── Role grid ── */
              <div className="p-4 overflow-y-auto">
                <div className="grid grid-cols-3 gap-3">
                  {MEERKAT_ROLES.map(role => (
                    <button
                      key={role.id}
                      onClick={() => handleSelect(role)}
                      className="flex flex-col rounded-xl overflow-hidden text-left transition-all hover:scale-[1.02] active:scale-[0.98]"
                      style={{
                        background: 'var(--c-surface-2)',
                        border:     `1px solid var(--c-border)`,
                        cursor:     'pointer',
                      }}
                    >
                      {/* Image */}
                      <div className="w-full overflow-hidden" style={{ height: 110, flexShrink: 0, background: `${role.color}10` }}>
                        <MeerkatCardImage role={role} />
                      </div>
                      {/* Text */}
                      <div className="px-3 py-2.5 flex flex-col gap-0.5">
                        <div className="font-bold text-sm leading-tight"
                          style={{ color: role.id === 'custom' ? 'var(--c-text-3)' : 'var(--c-text)' }}>
                          {role.nombre}
                        </div>
                        {role.rol && (
                          <div className="text-[10px] font-semibold" style={{ color: role.color }}>
                            {role.rol}
                          </div>
                        )}
                        <div className="text-[10px] mt-0.5 leading-tight" style={{ color: 'var(--c-text-4)' }}>
                          {role.descripcion}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              /* ── Confirmation step ── */
              <div className="p-6 flex flex-col gap-5">
                <div className="flex items-center gap-4 p-4 rounded-xl"
                  style={{ background: 'var(--c-surface-2)', border: '1px solid var(--c-border)' }}>
                  <div className="w-16 h-20 rounded-xl overflow-hidden flex-shrink-0" style={{ background: `${selected.color}10` }}>
                    <MeerkatCardImage role={selected} />
                  </div>
                  <div>
                    <div className="font-bold text-base" style={{ color: 'var(--c-text)' }}>
                      {selected.nombre}
                    </div>
                    {selected.rol && (
                      <div className="text-sm font-medium" style={{ color: selected.color }}>
                        {selected.rol}
                      </div>
                    )}
                    <div className="text-xs mt-0.5" style={{ color: 'var(--c-text-3)' }}>
                      {selected.descripcion}
                    </div>
                  </div>
                </div>

                {/* Nombre */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold" style={{ color: 'var(--c-text-2)' }}>
                    Nombre del empleado
                  </label>
                  <input
                    type="text"
                    value={agentName}
                    onChange={e => setAgentName(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && agentName.trim()) handleCreate(); }}
                    placeholder={selected.id === 'custom' ? 'Ej: Mi Asistente' : selected.nombre}
                    className="px-3 py-2.5 rounded-lg text-sm"
                    style={{
                      background: 'var(--c-surface-2)',
                      border:     '1px solid var(--c-border)',
                      color:      'var(--c-text)',
                      outline:    'none',
                    }}
                    autoFocus
                  />
                </div>

                {/* Jornada */}
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-semibold" style={{ color: 'var(--c-text-2)' }}>
                    Jornada mensual
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {JORNADAS[plan].map(j => {
                      const active = tier === j.tier;
                      return (
                        <button
                          key={j.tier}
                          type="button"
                          onClick={() => setTier(j.tier)}
                          className="flex flex-col gap-1 p-3 rounded-xl text-left transition-all"
                          style={{
                            background: active ? 'rgba(108,59,255,0.1)' : 'var(--c-surface-2)',
                            border:     active ? '1px solid rgba(108,59,255,0.45)' : '1px solid var(--c-border)',
                            cursor:     'pointer',
                          }}
                        >
                          <span className="text-xs font-bold" style={{ color: active ? '#9B6DFF' : 'var(--c-text)' }}>
                            {j.label}
                          </span>
                          <span className="text-[10px]" style={{ color: 'var(--c-text-3)' }}>
                            {j.minutes} min/mes
                          </span>
                          <span className="text-[11px] font-semibold mt-0.5" style={{ color: active ? '#9B6DFF' : 'var(--c-text-2)' }}>
                            {fmt(j.mxn)}/mes
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Resumen de costo */}
                {(() => {
                  const j        = JORNADAS[plan].find(x => x.tier === tier)!;
                  const subtotal = SETUP_FEE[plan] + j.mxn;
                  const iva      = Math.round(subtotal * 0.16);
                  const total    = subtotal + iva;
                  return (
                    <div className="rounded-xl p-4 flex flex-col gap-2"
                      style={{ background: 'rgba(108,59,255,0.06)', border: '1px solid rgba(108,59,255,0.18)' }}>
                      <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--c-text-3)' }}>
                        Resumen de contratación
                      </p>
                      <div className="flex items-center justify-between text-xs" style={{ color: 'var(--c-text-2)' }}>
                        <span>Contratación (único)</span>
                        <span className="font-semibold">{fmt(SETUP_FEE[plan])}</span>
                      </div>
                      <div className="flex items-center justify-between text-xs" style={{ color: 'var(--c-text-2)' }}>
                        <span>Jornada {j.label} · {j.minutes} min/mes</span>
                        <span className="font-semibold">{fmt(j.mxn)}/mes</span>
                      </div>
                      <div className="flex items-center justify-between text-xs" style={{ color: 'var(--c-text-3)', borderTop: '1px solid rgba(108,59,255,0.12)', paddingTop: 6, marginTop: 2 }}>
                        <span>Subtotal</span>
                        <span>{fmt(subtotal)}</span>
                      </div>
                      <div className="flex items-center justify-between text-xs" style={{ color: 'var(--c-text-3)' }}>
                        <span>IVA (16%)</span>
                        <span>{fmt(iva)}</span>
                      </div>
                      <div className="flex items-center justify-between text-sm font-bold pt-1"
                        style={{ borderTop: '1px solid rgba(108,59,255,0.18)', paddingTop: 8 }}>
                        <span style={{ color: 'var(--c-text)' }}>Total primer mes</span>
                        <span style={{ color: '#9B6DFF' }}>{fmt(total)}</span>
                      </div>
                    </div>
                  );
                })()}

                {error && (
                  <p className="text-xs px-3 py-2 rounded-lg"
                    style={{ background: 'rgba(239,68,68,0.08)', color: '#f87171', border: '1px solid rgba(239,68,68,0.2)' }}>
                    {error}
                  </p>
                )}

                <div className="flex items-center gap-2 justify-end pt-1">
                  <button
                    onClick={() => setSelected(null)}
                    className="px-4 py-2 rounded-lg text-sm"
                    style={{
                      color:      'var(--c-text-3)',
                      background: 'var(--c-surface-2)',
                      border:     '1px solid var(--c-border)',
                      cursor:     'pointer',
                    }}
                  >
                    Cambiar
                  </button>
                  <button
                    onClick={handleCreate}
                    disabled={loading || !agentName.trim()}
                    className="flex items-center gap-1.5 px-5 py-2 rounded-lg text-sm font-semibold transition-opacity hover:opacity-80 disabled:opacity-40"
                    style={{ background: selected.color, color: '#fff', cursor: 'pointer' }}
                  >
                    {loading ? 'Procesando...' : <><Check size={14} /> Contratar</>}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
