'use client';

import { useState, useRef, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Check, ChevronRight, ChevronLeft, ChevronDown, Loader, Phone, Building2, User, Utensils, Stethoscope, Sparkles, Smartphone, ShoppingBag, type LucideProps } from 'lucide-react';
import Image from 'next/image';

type FormPlan = 'comercial' | 'pro' | 'empresarial';
type FormTier = 'starter' | 'growth' | 'scale';
type Giro    = 'general' | 'restaurante' | 'consultorio' | 'estetica' | 'agencia' | 'retail';

const CITIES: { label: string; lada: string }[] = [
  { label: 'CDMX / Ciudad de México',  lada: '55'  },
  { label: 'Monterrey, NL',            lada: '81'  },
  { label: 'Guadalajara, JAL',         lada: '33'  },
  { label: 'Puebla, PUE',              lada: '222' },
  { label: 'Tijuana, BC',              lada: '664' },
  { label: 'León, GTO',                lada: '477' },
  { label: 'Querétaro, QRO',           lada: '442' },
  { label: 'Cancún, QR',               lada: '998' },
  { label: 'Mérida, YUC',              lada: '999' },
  { label: 'Hermosillo, SON',          lada: '662' },
  { label: 'Chihuahua, CHIH',          lada: '614' },
  { label: 'Juárez, CHIH',             lada: '656' },
  { label: 'San Luis Potosí, SLP',     lada: '444' },
  { label: 'Aguascalientes, AGS',      lada: '449' },
  { label: 'Morelia, MICH',            lada: '443' },
  { label: 'Torreón, COAH',            lada: '871' },
  { label: 'Saltillo, COAH',           lada: '844' },
  { label: 'Culiacán, SIN',            lada: '667' },
  { label: 'Mazatlán, SIN',            lada: '669' },
  { label: 'Veracruz, VER',            lada: '229' },
  { label: 'Xalapa, VER',              lada: '228' },
  { label: 'Oaxaca, OAX',              lada: '951' },
  { label: 'Acapulco, GRO',            lada: '744' },
  { label: 'Villahermosa, TAB',        lada: '993' },
  { label: 'Tuxtla Gutiérrez, CHIS',   lada: '961' },
  { label: 'San Cristóbal, CHIS',      lada: '967' },
  { label: 'Cuernavaca, MOR',          lada: '777' },
  { label: 'Toluca, MEX',              lada: '722' },
  { label: 'Durango, DUR',             lada: '618' },
  { label: 'Zacatecas, ZAC',           lada: '492' },
  { label: 'Tepic, NAY',               lada: '311' },
  { label: 'Colima, COL',              lada: '312' },
  { label: 'Pachuca, HGO',             lada: '771' },
  { label: 'Campeche, CAMP',           lada: '981' },
  { label: 'Chetumal, QR',             lada: '983' },
  { label: 'Ensenada, BC',             lada: '646' },
  { label: 'Los Cabos, BCS',           lada: '624' },
];

type AgentPlanDef = {
  id:           FormPlan;
  label:        string;
  setupFee:     number;
  color:        string;
  description:  string;
  recommended?: boolean;
  custom?:      boolean;
  features:     { label: string; desc: string }[];
};

const AGENT_PLANS: AgentPlanDef[] = [
  {
    id: 'comercial', label: 'Comercial', setupFee: 8990, color: '#6C3BFF',
    description: 'Para negocios con flujos estándar: recepción, leads, citas y seguimiento.',
    features: [
      { label: 'Recepcionista 24/7', desc: 'Contesta a cualquier hora con el nombre y la información de tu negocio.' },
      { label: 'Captura de leads', desc: 'Obtiene nombre, teléfono y necesidad de cada prospecto automáticamente.' },
      { label: 'Agendamiento de citas', desc: 'Confirma, modifica y cancela citas durante la llamada.' },
      { label: 'Transferencia inteligente', desc: 'Transfiere a tu celular cuando el cliente necesita hablar con alguien.' },
      { label: 'Escalación a WhatsApp', desc: 'Si el cliente prefiere mensaje, el agente lo dirige a tu WhatsApp.' },
      { label: 'Reseñas Google automáticas', desc: 'Tras cada llamada exitosa manda el link de tu reseña Google por WhatsApp.' },
      { label: 'Portal con reportes y horas pico', desc: 'Visualiza llamadas, leads, citas y horarios de mayor actividad.' },
    ],
  },
  {
    id: 'pro', label: 'Pro', setupFee: 14990, color: '#9B6DFF', recommended: true,
    description: 'Para negocios que necesitan personalización total y capacidades avanzadas.',
    features: [
      { label: 'Todo el plan Comercial', desc: 'Recepcionista 24/7, leads, citas, transferencia, escalación, reseñas y portal.' },
      { label: 'Hasta 3 llamadas simultáneas', desc: 'Tu agente atiende hasta 3 llamadas al mismo tiempo sin dar señal de ocupado.' },
      { label: 'Llamadas salientes y devolución automática', desc: 'Llama a tus contactos para confirmar citas, hacer seguimiento y devuelve las llamadas perdidas automáticamente.' },
      { label: 'Toma de pedidos', desc: 'Recibe pedidos completos durante la llamada y los manda a tu WhatsApp.' },
      { label: 'Memoria de cliente', desc: 'Recuerda quién ha llamado antes, qué pidió y sus preferencias.' },
      { label: 'Multiidioma (ES + EN)', desc: 'Detecta el idioma del cliente y responde en español o inglés.' },
      { label: 'Flujos complejos y voz personalizable', desc: 'Elige nombre, voz y diseña lógica conversacional a medida de tu operación.' },
    ],
  },
  {
    id: 'empresarial', label: 'Empresarial', setupFee: 0, color: '#f59e0b', custom: true,
    description: 'Múltiples agentes y sucursales, integraciones POS/CRM y SLA dedicado.',
    features: [
      { label: 'Todo el plan Pro', desc: 'Todas las capacidades del plan Pro más las siguientes.' },
      { label: 'Integración con tu sistema', desc: 'Conectamos el agente con tu POS, CRM o calendario en tiempo real.' },
      { label: 'Múltiples agentes / sucursales', desc: 'Un agente independiente por sucursal con su propio portal.' },
      { label: 'SLA y soporte dedicado', desc: 'Tiempo de respuesta garantizado y línea directa con el equipo técnico.' },
    ],
  },
];

type TierDef = {
  id:       FormTier;
  label:    string;
  minutes:  number;
  price:    number;
  popular?: boolean;
};

const TIERS: TierDef[] = [
  { id: 'starter', label: 'Starter', minutes: 300,  price: 2997 },
  { id: 'growth',  label: 'Growth',  minutes: 600,  price: 5994, popular: true },
  { id: 'scale',   label: 'Scale',   minutes: 1200, price: 11988 },
];

const GIROS: { id: Giro; label: string; icon: React.FC<LucideProps> }[] = [
  { id: 'retail',      label: 'Tienda / Comercio',    icon: ShoppingBag },
  { id: 'restaurante', label: 'Restaurante / Café',   icon: Utensils    },
  { id: 'consultorio', label: 'Consultorio / Clínica',icon: Stethoscope },
  { id: 'estetica',    label: 'Estética / Spa',       icon: Sparkles    },
  { id: 'agencia',     label: 'Agencia / Servicios',  icon: Smartphone  },
  { id: 'general',     label: 'General / Otro',       icon: Building2   },
];

const priceFmt = (n: number) =>
  new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 0 }).format(n);

// ─── City custom dropdown ──────────────────────────────────────────────────────

function CitySelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen]       = useState(false);
  const [openUp, setOpenUp]   = useState(false);
  const ref                   = useRef<HTMLDivElement>(null);
  const selected              = CITIES.find(c => c.lada === value);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  function handleToggle() {
    if (!open && ref.current) {
      const rect = ref.current.getBoundingClientRect();
      setOpenUp(rect.bottom + 240 > window.innerHeight);
    }
    setOpen(o => !o);
  }

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={handleToggle}
        style={{
          background:    'rgba(255,255,255,0.05)',
          border:        '1px solid rgba(255,255,255,0.1)',
          borderRadius:  12,
          padding:       '12px 16px',
          color:         selected ? '#E2D9FF' : 'rgba(255,255,255,0.3)',
          width:         '100%',
          fontSize:      14,
          display:       'flex',
          alignItems:    'center',
          justifyContent:'space-between',
          cursor:        'pointer',
          textAlign:     'left',
        }}
      >
        <span>{selected ? `${selected.label} · lada ${selected.lada}` : 'Selecciona tu ciudad…'}</span>
        <ChevronDown
          size={14}
          style={{
            flexShrink: 0,
            color:      'rgba(255,255,255,0.4)',
            transition: 'transform 0.2s',
            transform:  open ? 'rotate(180deg)' : 'none',
          }}
        />
      </button>

      {open && (
        <div style={{
          position:     'absolute',
          ...(openUp ? { bottom: 'calc(100% + 4px)' } : { top: 'calc(100% + 4px)' }),
          left:         0,
          right:        0,
          background:   '#1a0d3d',
          border:       '1px solid rgba(255,255,255,0.12)',
          borderRadius: 12,
          zIndex:       100,
          maxHeight:    220,
          overflowY:    'auto',
          boxShadow:    '0 8px 32px rgba(0,0,0,0.6)',
        }}>
          {CITIES.map(c => (
            <button
              key={c.lada}
              type="button"
              onClick={() => { onChange(c.lada); setOpen(false); }}
              style={{
                display:    'block',
                width:      '100%',
                padding:    '9px 14px',
                fontSize:   13,
                color:      c.lada === value ? '#9B6DFF' : 'rgba(255,255,255,0.72)',
                background: c.lada === value ? 'rgba(108,59,255,0.15)' : 'transparent',
                border:     'none',
                cursor:     'pointer',
                textAlign:  'left',
              }}
            >
              {c.label}{' '}
              <span style={{ color: 'rgba(255,255,255,0.32)', fontSize: 11 }}>lada {c.lada}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main form ────────────────────────────────────────────────────────────────

function RegistroInner() {
  const params   = useSearchParams();
  const canceled = params.get('canceled') === '1';
  const backUrl  = params.get('back') ?? null;

  const validPlans: FormPlan[] = ['comercial', 'pro', 'empresarial'];
  const validTiers: FormTier[] = ['starter', 'growth', 'scale'];
  const rawPlan = params.get('plan') as FormPlan | null;
  const rawTier = params.get('tier') as FormTier | null;
  const initPlan: FormPlan = rawPlan && validPlans.includes(rawPlan) ? rawPlan : 'comercial';
  const initTier: FormTier = rawTier && validTiers.includes(rawTier) ? rawTier : 'growth';

  const [step,         setStep]         = useState<1 | 2 | 3>(1);
  const [loading,      setLoading]      = useState(false);
  const [error,        setError]        = useState('');
  const [submitted,    setSubmitted]    = useState(false);

  // Form state
  const [plan,          setPlan]         = useState<FormPlan>(initPlan);
  const [tier,          setTier]         = useState<FormTier>(initTier);
  const [businessName,  setBusinessName] = useState('');
  const [businessDesc,  setBusinessDesc] = useState('');
  const [businessPhone, setBusinessPhone]= useState('');
  const [giro,          setGiro]         = useState<Giro>('general');
  const [cityLada,      setCityLada]     = useState('');
  const [agentName,     setAgentName]    = useState('');
  const [clientName,    setClientName]   = useState('');
  const [clientEmail,   setClientEmail]  = useState('');
  const [whatsapp,      setWhatsapp]     = useState('');

  const selectedAgentPlan  = AGENT_PLANS.find(p => p.id === plan)!;
  const selectedTier       = TIERS.find(t => t.id === tier) ?? TIERS[1];
  const monthlyPrice       = plan !== 'empresarial' ? selectedTier.price : 0;

  const handleNext = () => {
    setError('');
    if (step === 1) { setStep(2); return; }
    if (step === 2) {
      if (!businessName.trim())  { setError('Escribe el nombre de tu negocio'); return; }
      if (!businessDesc.trim())  { setError('Escribe una descripción del negocio'); return; }
      if (!businessPhone.trim()) { setError('Escribe el teléfono del negocio'); return; }
      setStep(3);
    }
  };

  const handleSubmit = async () => {
    setError('');
    if (!clientName.trim())                         { setError('Escribe tu nombre'); return; }
    if (!clientEmail.trim() || !clientEmail.includes('@')) { setError('Escribe un correo electrónico válido'); return; }
    if (!whatsapp.trim())                           { setError('Escribe tu número de WhatsApp'); return; }

    setLoading(true);
    try {
      const res = await fetch('/api/onboarding/start', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          plan,
          minutes_tier:           tier,
          business_name:          businessName.trim(),
          business_description:   businessDesc.trim(),
          business_phone_display: businessPhone.trim(),
          giro_template:          giro,
          area_code:              cityLada || undefined,
          agent_name:             agentName.trim() || null,
          client_name:            clientName.trim(),
          client_email:           clientEmail.trim(),
          transfer_whatsapp:      whatsapp.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'Ocurrió un error'); return; }
      if (data.empresarial) { setSubmitted(true); return; }
      window.location.href = data.url;
    } catch {
      setError('No se pudo conectar. Intenta de nuevo.');
    } finally {
      setLoading(false);
    }
  };

  const inputStyle = {
    background:   'rgba(255,255,255,0.05)',
    border:       '1px solid rgba(255,255,255,0.1)',
    borderRadius: 12,
    padding:      '12px 16px',
    color:        '#E2D9FF',
    width:        '100%',
    fontSize:     14,
    outline:      'none',
  } as const;

  const labelStyle = {
    fontSize:     12,
    color:        'rgba(255,255,255,0.5)',
    display:      'block',
    marginBottom: 6,
  } as const;

  // ── Empresarial success screen ─────────────────────────────────────────────
  if (submitted) {
    return (
      <div className="min-h-screen relative flex flex-col items-center justify-center px-4 overflow-hidden film-grain" style={{ background: '#0D0621' }}>
      <div className="orb" style={{ width: 500, height: 500, top: -150, left: '50%', transform: 'translateX(-50%)', background: 'radial-gradient(circle, rgba(245,158,11,0.15) 0%, transparent 65%)', ['--orb-dur' as string]: '12s' }} />
        <div
          className="w-full max-w-md rounded-3xl p-8 text-center"
          style={{ background: 'rgba(245,158,11,0.07)', border: '1px solid rgba(245,158,11,0.3)' }}
        >
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-5 text-2xl"
            style={{ background: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.3)' }}>
            🎯
          </div>
          <h1 className="text-xl font-bold text-white mb-2">¡Solicitud recibida!</h1>
          <p className="text-sm mb-6" style={{ color: 'rgba(255,255,255,0.5)' }}>
            Revisaremos los requisitos de integración de <strong style={{ color: '#fff' }}>{businessName}</strong> y
            te contactaremos en menos de 24 horas con una propuesta a medida.
          </p>
          <div className="flex flex-col gap-2 text-left mb-6">
            {['Revisión de necesidades de integración', 'Propuesta personalizada vía WhatsApp / correo', 'Llamada de onboarding con el equipo'].map((s, i) => (
              <div key={s} className="flex items-center gap-3">
                <div className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                  style={{ background: 'rgba(245,158,11,0.2)', color: '#f59e0b' }}>
                  {i + 1}
                </div>
                <span className="text-sm" style={{ color: 'rgba(255,255,255,0.6)' }}>{s}</span>
              </div>
            ))}
          </div>
          <a
            href="/"
            className="block py-3 rounded-2xl text-sm font-semibold text-white text-center transition-opacity hover:opacity-90"
            style={{ background: 'rgba(245,158,11,0.2)', border: '1px solid rgba(245,158,11,0.35)' }}
          >
            Volver al inicio
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen relative overflow-hidden film-grain" style={{ background: '#0D0621' }}>
      {/* Orbs */}
      <div className="orb" style={{ width: 600, height: 600, top: -200, right: -150, background: 'radial-gradient(circle, rgba(108,59,255,0.2) 0%, transparent 65%)', ['--orb-dur' as string]: '13s' }} />
      <div className="orb" style={{ width: 400, height: 400, bottom: 50, left: -120, background: 'radial-gradient(circle, rgba(155,109,255,0.12) 0%, transparent 65%)', ['--orb-dur' as string]: '18s' }} />

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', position: 'relative', zIndex: 1 }}>
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <a href="/" className="flex items-center">
            <Image src="/logo-icon.png" alt="Centinelia" width={56} height={56} style={{ width: 56, height: 56, objectFit: 'contain' }} />
          </a>
          {backUrl ? (
            <a href={backUrl} className="flex items-center gap-1 text-xs font-medium transition-opacity hover:opacity-80" style={{ color: 'rgba(255,255,255,0.5)' }}>
              <ChevronLeft size={13} /> Devuelta al portal
            </a>
          ) : (
            <a href="/portal/login" className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>
              ¿Ya tienes cuenta? Entra aquí
            </a>
          )}
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-10" style={{ position: 'relative', zIndex: 1 }}>

        {/* ── Steps indicator ─────────────────────────────────────────────── */}
        <div className="flex items-center justify-center gap-0 mb-10">
          {(['Plan', 'Negocio', 'Contacto'] as const).map((label, i) => {
            const n       = i + 1 as 1 | 2 | 3;
            const done    = step > n;
            const active  = step === n;
            const canNav  = done;
            return (
              <div key={label} className="flex items-center">
                <button
                  type="button"
                  onClick={() => { if (canNav) { setError(''); setStep(n); } }}
                  className="flex flex-col items-center"
                  style={{ cursor: canNav ? 'pointer' : 'default', background: 'none', border: 'none', padding: 0 }}
                >
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all"
                    style={{
                      background: done ? '#6C3BFF' : active ? 'rgba(108,59,255,0.3)' : 'rgba(255,255,255,0.05)',
                      border:     `2px solid ${done || active ? '#6C3BFF' : 'rgba(255,255,255,0.1)'}`,
                      color:      done || active ? '#fff' : 'rgba(255,255,255,0.3)',
                      boxShadow:  canNav ? '0 0 0 0 rgba(108,59,255,0)' : 'none',
                      transition: 'opacity 0.15s',
                    }}
                  >
                    {done ? <Check size={13} /> : n}
                  </div>
                  <span
                    className="text-xs mt-1.5 font-medium"
                    style={{
                      color:           active ? '#9B6DFF' : done ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.25)',
                      textDecoration:  canNav ? 'underline' : 'none',
                      textUnderlineOffset: 2,
                    }}
                  >
                    {label}
                  </span>
                </button>
                {i < 2 && (
                  <div
                    className="w-16 h-px mx-2 mb-4"
                    style={{ background: step > n + 1 ? '#6C3BFF' : 'rgba(255,255,255,0.08)' }}
                  />
                )}
              </div>
            );
          })}
        </div>

        {canceled && (
          <div
            className="mb-6 px-4 py-3 rounded-xl text-sm"
            style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.25)', color: '#fbbf24' }}
          >
            El pago fue cancelado. Puedes intentarlo de nuevo cuando quieras.
          </div>
        )}

        {/* ── STEP 1: Plan ──────────────────────────────────────────────────── */}
        {step === 1 && (
          <div>
            <h1 className="text-2xl font-bold text-white mb-1">Configura tu agente</h1>
            <p className="text-sm mb-8" style={{ color: 'rgba(255,255,255,0.4)' }}>
              Dos decisiones: tu tipo de agente (pago único) y tus minutos al mes.
            </p>

            {/* ── Sección A: Tipo de agente ─────────────── */}
            <p className="text-xs font-semibold tracking-widest uppercase mb-3"
              style={{ color: 'rgba(255,255,255,0.35)' }}>
              Paso 1 — Tipo de agente · Pago único de instalación
            </p>
            <div className="flex flex-col gap-3 mb-8">
              {AGENT_PLANS.map(p => {
                const selected = plan === p.id;
                return (
                  <div
                    key={p.id}
                    onClick={() => setPlan(p.id)}
                    className="rounded-2xl cursor-pointer transition-all relative overflow-hidden"
                    style={{
                      background: selected ? `${p.color}10` : 'rgba(255,255,255,0.03)',
                      border:     `2px solid ${selected ? p.color : 'rgba(255,255,255,0.07)'}`,
                    }}
                  >
                    {selected && (
                      <div style={{ height: 3, background: `linear-gradient(90deg, ${p.color}, ${p.color}88)` }} />
                    )}
                    <div className="p-5">
                      <div className="flex items-center gap-3 mb-3">
                        <div
                          className="w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all"
                          style={{
                            borderColor: selected ? p.color : 'rgba(255,255,255,0.2)',
                            background:  selected ? p.color : 'transparent',
                          }}
                        >
                          {selected && <div className="w-2 h-2 rounded-full bg-white" />}
                        </div>
                        <span className="text-base font-bold text-white">{p.label}</span>
                        {p.recommended && (
                          <span className="text-xs px-2 py-0.5 rounded-full font-semibold flex-shrink-0"
                            style={{ background: p.color, color: '#fff' }}>
                            Más completo
                          </span>
                        )}
                      </div>
                      <div className="ml-8">
                        {p.custom ? (
                          <p className="text-xl font-bold text-white mb-1">Cotización personalizada</p>
                        ) : (
                          <div className="flex items-baseline gap-1.5 mb-2">
                            <span className="text-3xl font-extrabold tabular-nums" style={{ color: selected ? p.color : '#fff' }}>
                              {priceFmt(p.setupFee)}
                            </span>
                            <span className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>+ IVA · pago único</span>
                          </div>
                        )}
                        <p className="text-xs mb-3" style={{ color: 'rgba(255,255,255,0.45)' }}>{p.description}</p>
                        {selected && (
                          <>
                            <div className="mb-3" style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }} />
                            <div className="flex flex-col gap-1.5">
                              {p.features.map(f => (
                                <div key={f.label} className="flex items-start gap-2">
                                  <Check size={11} style={{ color: p.color, flexShrink: 0, marginTop: 3 }} />
                                  <div>
                                    <span className="text-xs font-medium" style={{ color: 'rgba(255,255,255,0.8)' }}>
                                      {f.label}
                                    </span>
                                    <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.35)', lineHeight: 1.45 }}>
                                      {f.desc}
                                    </p>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* ── Sección B: Minutos mensuales (solo si no empresarial) ──── */}
            {plan !== 'empresarial' && (
              <>
                <p className="text-xs font-semibold tracking-widest uppercase mb-3"
                  style={{ color: 'rgba(255,255,255,0.35)' }}>
                  Paso 2 — Minutos al mes · Mensualidad recurrente
                </p>
                <div className="flex flex-col gap-2 mb-6">
                  {TIERS.map(t => {
                    const selected = tier === t.id;
                    const price = t.price;
                    return (
                      <div
                        key={t.id}
                        onClick={() => setTier(t.id)}
                        className="rounded-xl cursor-pointer transition-all"
                        style={{
                          background: selected ? 'rgba(108,59,255,0.14)' : 'rgba(255,255,255,0.03)',
                          border:     `2px solid ${selected ? '#6C3BFF' : 'rgba(255,255,255,0.07)'}`,
                        }}
                      >
                        <div className="px-4 py-3.5 flex items-center gap-3">
                          <div
                            className="w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all"
                            style={{
                              borderColor: selected ? '#6C3BFF' : 'rgba(255,255,255,0.2)',
                              background:  selected ? '#6C3BFF' : 'transparent',
                            }}
                          >
                            {selected && <div className="w-2 h-2 rounded-full bg-white" />}
                          </div>
                          <div className="flex-1 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-white">{t.label}</span>
                              <span className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>{t.minutes} min/mes</span>
                              {t.popular && (
                                <span className="text-xs px-1.5 py-0.5 rounded-full font-semibold"
                                  style={{ background: 'rgba(108,59,255,0.2)', color: '#9B6DFF' }}>
                                  Más usado
                                </span>
                              )}
                            </div>
                            <span className="font-bold tabular-nums" style={{ color: selected ? '#9B6DFF' : '#fff', fontSize: 15 }}>
                              {priceFmt(price)}/mes
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <p className="text-xs mb-6" style={{ color: 'rgba(255,255,255,0.28)' }}>
                  Minutos extra fuera del plan: $12.99 MXN / min
                </p>
              </>
            )}

            <button
              onClick={handleNext}
              className="w-full py-3.5 rounded-2xl font-semibold text-sm text-white flex items-center justify-center gap-2 transition-opacity hover:opacity-90"
              style={{ background: selectedAgentPlan.custom ? 'linear-gradient(135deg, #f59e0b, #fbbf24)' : 'linear-gradient(135deg, #6C3BFF, #9B6DFF)' }}
            >
              {selectedAgentPlan.custom
                ? <>Solicitar propuesta Empresarial <ChevronRight size={16} /></>
                : <>Continuar con {selectedAgentPlan.label} · {selectedTier.label} <ChevronRight size={16} /></>
              }
            </button>
          </div>
        )}

        {/* ── STEP 2: Business info ─────────────────────────────────────────── */}
        {step === 2 && (
          <div>
            <h1 className="text-2xl font-bold text-white mb-1">Tu negocio</h1>
            <p className="text-sm mb-8" style={{ color: 'rgba(255,255,255,0.4)' }}>
              El agente usará esta información para atender tus llamadas.
            </p>

            <div className="flex flex-col gap-5">
              <div>
                <label style={labelStyle}>Nombre del negocio *</label>
                <div className="relative">
                  <Building2 size={15} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'rgba(255,255,255,0.3)' }} />
                  <input
                    value={businessName}
                    onChange={e => setBusinessName(e.target.value)}
                    placeholder="Ej. Clínica San Rafael"
                    style={{ ...inputStyle, paddingLeft: 40 }}
                  />
                </div>
              </div>

              <div>
                <label style={labelStyle}>Giro o industria *</label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {GIROS.map(g => (
                    <button
                      key={g.id}
                      type="button"
                      onClick={() => setGiro(g.id)}
                      className="flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm transition-all"
                      style={{
                        background: giro === g.id ? 'rgba(108,59,255,0.2)' : 'rgba(255,255,255,0.04)',
                        border:     `1px solid ${giro === g.id ? '#6C3BFF' : 'rgba(255,255,255,0.08)'}`,
                        color:      giro === g.id ? '#9B6DFF' : 'rgba(255,255,255,0.5)',
                        fontWeight: giro === g.id ? 600 : 400,
                      }}
                    >
                      <g.icon size={14} color={giro === g.id ? '#9B6DFF' : 'rgba(255,255,255,0.4)'} />
                      <span className="text-xs">{g.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label style={labelStyle}>
                  Describe tu negocio brevemente *
                  <span style={{ color: 'rgba(255,255,255,0.25)', marginLeft: 6 }}>(el agente lo usa para responder preguntas)</span>
                </label>
                <textarea
                  value={businessDesc}
                  onChange={e => setBusinessDesc(e.target.value)}
                  placeholder="Ej. Somos una clínica dental en Monterrey con 15 años de experiencia. Ofrecemos limpiezas, ortodoncia y blanqueamiento. Abiertos lunes a sábado de 9am a 7pm."
                  rows={3}
                  style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.5 }}
                />
              </div>

              <div>
                <label style={labelStyle}>
                  Ciudad del negocio
                  <span style={{ color: 'rgba(255,255,255,0.25)', marginLeft: 6 }}>(para asignar un número local)</span>
                </label>
                <CitySelect value={cityLada} onChange={setCityLada} />
              </div>

              <div>
                <label style={labelStyle}>
                  Teléfono del negocio *
                  <span style={{ color: 'rgba(255,255,255,0.25)', marginLeft: 6 }}>(el agente lo menciona en llamadas)</span>
                </label>
                <div className="relative">
                  <Phone size={15} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'rgba(255,255,255,0.3)' }} />
                  <input
                    value={businessPhone}
                    onChange={e => setBusinessPhone(e.target.value)}
                    placeholder="Ej. 81 1234 5678"
                    style={{ ...inputStyle, paddingLeft: 40 }}
                  />
                </div>
              </div>

              {(plan === 'pro' || plan === 'empresarial') && (
                <div>
                  <label style={labelStyle}>
                    Nombre del agente
                    <span style={{ color: 'rgba(255,255,255,0.25)', marginLeft: 6 }}>(opcional, default: Centinelia)</span>
                  </label>
                  <input
                    value={agentName}
                    onChange={e => setAgentName(e.target.value)}
                    placeholder="Ej. Ana, Carlos, Sofía…"
                    style={inputStyle}
                  />
                </div>
              )}
            </div>

            {error && (
              <p
                className="mt-4 text-xs px-3 py-2 rounded-lg"
                style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: '#f87171' }}
              >
                {error}
              </p>
            )}

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => { setError(''); setStep(1); }}
                className="flex items-center gap-1 px-4 py-3.5 rounded-2xl text-sm font-medium transition-opacity hover:opacity-80"
                style={{ background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.6)', border: '1px solid rgba(255,255,255,0.1)' }}
              >
                <ChevronLeft size={16} /> Atrás
              </button>
              <button
                onClick={handleNext}
                className="flex-1 py-3.5 rounded-2xl font-semibold text-sm text-white flex items-center justify-center gap-2 transition-opacity hover:opacity-90"
                style={{ background: 'linear-gradient(135deg, #6C3BFF, #9B6DFF)' }}
              >
                Continuar <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}

        {/* ── STEP 3: Contact + summary ─────────────────────────────────────── */}
        {step === 3 && (
          <div>
            <h1 className="text-2xl font-bold text-white mb-1">Tus datos</h1>
            <p className="text-sm mb-8" style={{ color: 'rgba(255,255,255,0.4)' }}>
              Para crear tu acceso al portal y enviarte los resúmenes de llamadas.
            </p>

            <div className="flex flex-col gap-5">
              <div>
                <label style={labelStyle}>Tu nombre *</label>
                <div className="relative">
                  <User size={15} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'rgba(255,255,255,0.3)' }} />
                  <input
                    value={clientName}
                    onChange={e => setClientName(e.target.value)}
                    placeholder="Tu nombre completo"
                    style={{ ...inputStyle, paddingLeft: 40 }}
                  />
                </div>
              </div>

              <div>
                <label style={labelStyle}>
                  Correo electrónico *
                  <span style={{ color: 'rgba(255,255,255,0.25)', marginLeft: 6 }}>(acceso al portal)</span>
                </label>
                <input
                  type="email"
                  value={clientEmail}
                  onChange={e => setClientEmail(e.target.value)}
                  placeholder="tu@correo.com"
                  style={inputStyle}
                />
              </div>

              <div>
                <label style={labelStyle}>
                  WhatsApp *
                  <span style={{ color: 'rgba(255,255,255,0.25)', marginLeft: 6 }}>(resúmenes de llamadas en tiempo real)</span>
                </label>
                <div className="relative">
                  <Phone size={15} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'rgba(255,255,255,0.3)' }} />
                  <input
                    value={whatsapp}
                    onChange={e => setWhatsapp(e.target.value)}
                    placeholder="+52 81 1234 5678"
                    style={{ ...inputStyle, paddingLeft: 40 }}
                  />
                </div>
              </div>
            </div>

            {/* ── Order summary ────────────────────────────────────────────── */}
            {plan !== 'empresarial' ? (
              <div
                className="mt-7 rounded-2xl overflow-hidden"
                style={{ border: `1px solid ${selectedAgentPlan.color}38`, background: `${selectedAgentPlan.color}08` }}
              >
                {/* Plan header */}
                <div className="px-5 pt-5 pb-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full" style={{ background: selectedAgentPlan.color }} />
                      <span className="text-xs font-semibold tracking-widest uppercase" style={{ color: selectedAgentPlan.color }}>
                        {selectedAgentPlan.label} · {selectedTier.label}
                      </span>
                    </div>
                    <span className="text-xs px-2.5 py-1 rounded-full font-semibold"
                      style={{ background: `${selectedAgentPlan.color}22`, color: selectedAgentPlan.color }}>
                      {selectedTier.minutes} min/mes
                    </span>
                  </div>
                  <div className="flex items-baseline gap-1">
                    <span className="text-3xl font-bold tabular-nums" style={{ color: selectedAgentPlan.color }}>
                      {priceFmt(monthlyPrice)}
                    </span>
                    <span className="text-sm" style={{ color: 'rgba(255,255,255,0.4)' }}>/mes</span>
                  </div>
                  <p className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.28)' }}>Sin contrato mínimo</p>
                </div>

                {/* Line items */}
                <div className="px-5 py-3">
                  <div className="flex justify-between items-center py-2" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    <span className="text-sm" style={{ color: 'rgba(255,255,255,0.5)' }}>
                      Instalación del agente
                      <span className="text-xs ml-1.5" style={{ color: 'rgba(255,255,255,0.25)' }}>(pago único)</span>
                    </span>
                    <span className="text-sm font-medium text-white">{priceFmt(selectedAgentPlan.setupFee)}</span>
                  </div>
                  <div className="flex justify-between items-center py-2">
                    <span className="text-sm" style={{ color: 'rgba(255,255,255,0.5)' }}>Mensualidad ({selectedTier.label})</span>
                    <span className="text-sm font-medium text-white">{priceFmt(monthlyPrice)}</span>
                  </div>
                </div>

                {/* Total */}
                <div
                  className="mx-4 mb-4 px-4 py-3.5 rounded-xl"
                  style={{ background: `${selectedAgentPlan.color}16`, border: `1px solid ${selectedAgentPlan.color}28` }}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs" style={{ color: 'rgba(255,255,255,0.45)' }}>Subtotal</span>
                    <span className="text-xs tabular-nums" style={{ color: 'rgba(255,255,255,0.5)' }}>
                      {priceFmt(selectedAgentPlan.setupFee + monthlyPrice)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs" style={{ color: 'rgba(255,255,255,0.45)' }}>IVA (16%)</span>
                    <span className="text-xs tabular-nums" style={{ color: 'rgba(255,255,255,0.5)' }}>
                      {priceFmt(Math.round((selectedAgentPlan.setupFee + monthlyPrice) * 0.16))}
                    </span>
                  </div>
                  <div className="flex items-center justify-between pt-2.5" style={{ borderTop: `1px solid ${selectedAgentPlan.color}35` }}>
                    <div>
                      <p className="text-xs font-semibold" style={{ color: 'rgba(255,255,255,0.55)' }}>Total hoy</p>
                      <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.28)' }}>
                        Después: {priceFmt(Math.round(monthlyPrice * 1.16))}/mes
                      </p>
                    </div>
                    <span className="text-2xl font-bold tabular-nums" style={{ color: selectedAgentPlan.color }}>
                      {priceFmt(Math.round((selectedAgentPlan.setupFee + monthlyPrice) * 1.16))}
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              /* Empresarial summary */
              <div
                className="mt-7 rounded-2xl overflow-hidden"
                style={{ border: '1px solid rgba(245,158,11,0.3)', background: 'rgba(245,158,11,0.06)' }}
              >
                <div className="px-5 pt-5 pb-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-2 h-2 rounded-full" style={{ background: '#f59e0b' }} />
                    <span className="text-xs font-semibold tracking-widest uppercase" style={{ color: '#f59e0b' }}>
                      Plan Empresarial
                    </span>
                  </div>
                  <p className="text-xl font-bold text-white">Cotización personalizada</p>
                  <p className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.38)' }}>
                    Según tu industria, sistema actual e integraciones requeridas
                  </p>
                </div>
                <div className="px-5 py-4">
                  <p className="text-sm leading-relaxed" style={{ color: 'rgba(255,255,255,0.5)' }}>
                    Al enviar tu solicitud nuestro equipo revisará tus necesidades y te contactará en menos de 24 horas
                    con una propuesta detallada y precio final.
                  </p>
                </div>
              </div>
            )}

            {error && (
              <p
                className="mt-4 text-xs px-3 py-2 rounded-lg"
                style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: '#f87171' }}
              >
                {error}
              </p>
            )}

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => { setError(''); setStep(2); }}
                className="flex items-center gap-1 px-4 py-3.5 rounded-2xl text-sm font-medium transition-opacity hover:opacity-80"
                style={{ background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.6)', border: '1px solid rgba(255,255,255,0.1)' }}
              >
                <ChevronLeft size={16} /> Atrás
              </button>
              <button
                onClick={handleSubmit}
                disabled={loading}
                className="flex-1 py-3.5 rounded-2xl font-semibold text-sm text-white flex items-center justify-center gap-2 transition-opacity hover:opacity-90"
                style={{
                  background: plan === 'empresarial'
                    ? 'linear-gradient(135deg, #f59e0b, #fbbf24)'
                    : `linear-gradient(135deg, ${selectedAgentPlan.color}, #9B6DFF)`,
                  opacity: loading ? 0.6 : 1,
                }}
              >
                {loading
                  ? <><Loader size={15} className="animate-spin" /> Procesando…</>
                  : plan === 'empresarial'
                    ? <>Enviar solicitud <ChevronRight size={16} /></>
                    : <>Ir al pago seguro <ChevronRight size={16} /></>
                }
              </button>
            </div>

            <p className="text-center text-xs mt-4" style={{ color: 'rgba(255,255,255,0.22)', lineHeight: 1.6 }}>
              {plan !== 'empresarial' && <>Pago seguro procesado por Stripe · Precios en MXN<br /></>}
              Al continuar aceptas nuestros{' '}
              <a href="/legal" target="_blank" rel="noopener noreferrer" style={{ color: 'rgba(255,255,255,0.4)', textDecoration: 'underline' }}>
                Términos y Condiciones
              </a>
              {' '}y el{' '}
              <a href="/privacidad-datos" target="_blank" rel="noopener noreferrer" style={{ color: 'rgba(255,255,255,0.4)', textDecoration: 'underline' }}>
                Aviso de Privacidad
              </a>.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export default function RegistroPage() {
  return (
    <Suspense>
      <RegistroInner />
    </Suspense>
  );
}
