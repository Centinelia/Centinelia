'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, RefreshCw, Check, MessageCircle, Phone, PhoneOutgoing, Clock, ChevronDown, Lock } from 'lucide-react';
import VoiceSelector from '@/components/VoiceSelector';
import { PLAN_FEATURES, PLAN_LABELS, PLAN_MINUTES, FEATURE_LABELS } from '@/types/agent';
import type { Plan, AgentFeatures, VoiceAgent, BusinessHours, DaySchedule } from '@/types/agent';

const PLANS: Plan[] = ['comercial', 'pro'];
const PLAN_COLORS: Record<Plan, string> = {
  comercial: '#6C3BFF', pro: '#a855f7',
};

const MEXICO_TIMEZONES = [
  { value: 'America/Monterrey',   label: 'Monterrey / Noreste' },
  { value: 'America/Mexico_City', label: 'Ciudad de México / Centro' },
  { value: 'America/Tijuana',     label: 'Tijuana / Baja California' },
  { value: 'America/Hermosillo',  label: 'Hermosillo / Sonora' },
  { value: 'America/Chihuahua',   label: 'Chihuahua / Montaña' },
  { value: 'America/Mazatlan',    label: 'Mazatlán / Sinaloa' },
  { value: 'America/Merida',      label: 'Mérida / Sureste' },
  { value: 'America/Cancun',      label: 'Cancún / Quintana Roo' },
];

const FEATURE_DESCRIPTIONS: Record<keyof AgentFeatures, string> = {
  receptionist:            'Contesta llamadas, da información del negocio y horarios',
  lead_qualification:      'Pregunta por nombre, contacto e interés del llamante',
  appointment_booking:     'Agenda citas o reservaciones y las registra',
  existing_client_support: 'Atiende a clientes que ya conocen el negocio',
  smart_transfer:          'Transfiere la llamada a un humano cuando es necesario',
  order_taking:            'Toma pedidos de productos o platillos',
  multilingual:            'Responde en inglés además de español',
  client_memory:           'Recuerda información de llamadas anteriores del mismo número',
  outbound_calls:          'Permite disparar llamadas salientes desde el portal del cliente',
  vertical:                '',
  helpdesk:                'Mesa de ayuda IT',
  is_coordinator:          'Coordinador de equipo',
};

const DAYS: { key: keyof BusinessHours; label: string }[] = [
  { key: 'monday',    label: 'Lunes' },
  { key: 'tuesday',   label: 'Martes' },
  { key: 'wednesday', label: 'Miércoles' },
  { key: 'thursday',  label: 'Jueves' },
  { key: 'friday',    label: 'Viernes' },
  { key: 'saturday',  label: 'Sábado' },
  { key: 'sunday',    label: 'Domingo' },
];

const DEFAULT_HOURS: BusinessHours = {
  monday:    { open: true,  from: '09:00', to: '18:00' },
  tuesday:   { open: true,  from: '09:00', to: '18:00' },
  wednesday: { open: true,  from: '09:00', to: '18:00' },
  thursday:  { open: true,  from: '09:00', to: '18:00' },
  friday:    { open: true,  from: '09:00', to: '18:00' },
  saturday:  { open: false },
  sunday:    { open: false },
};

// Features in inbound section, split by base vs pro-only
const ALL_INBOUND = (Object.keys(PLAN_FEATURES.pro) as (keyof AgentFeatures)[]).filter(k => k !== 'outbound_calls');
const BASE_INBOUND = ALL_INBOUND.filter(k => PLAN_FEATURES.comercial[k]);
const PRO_INBOUND  = ALL_INBOUND.filter(k => !PLAN_FEATURES.comercial[k]);

type Tab = 'info' | 'agente' | 'funciones';
const TABS: { id: Tab; label: string }[] = [
  { id: 'info',      label: 'Información' },
  { id: 'agente',    label: 'Agente' },
  { id: 'funciones', label: 'Funciones' },
];

export default function EditAgentForm({ agent }: { agent: VoiceAgent }) {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const initialTab   = (searchParams.get('tab') as Tab | null) ?? 'info';

  const [saving, setSaving]               = useState(false);
  const [resyncing, setResyncing]         = useState(false);
  const [resyncOk, setResyncOk]           = useState(false);
  const [voiceId, setVoiceId]             = useState<string | null>((agent as any).elevenlabs_voice_id ?? null);
  const [tab, setTab]                     = useState<Tab>(initialTab);
  const [role, setRole]                   = useState<string>((agent as any).role ?? '');
  const [plan, setPlan]                   = useState<Plan>(agent.plan);
  const [features, setFeatures]           = useState<AgentFeatures>(agent.features);
  const [vertical, setVertical]           = useState<'negocio' | 'gobierno'>((agent.features as any).vertical ?? 'negocio');
  const [businessHours, setBusinessHours] = useState<BusinessHours>(agent.business_hours ?? DEFAULT_HOURS);
  const [hoursEnabled, setHoursEnabled]   = useState<boolean>(!!agent.business_hours);
  const [waActive, setWaActive]           = useState<boolean>(!!agent.wa_phone_number);
  const [funcOpen, setFuncOpen]           = useState<Set<string>>(new Set(['entrantes', 'salientes', 'whatsapp', 'horarios']));
  const [timezone, setTimezone]           = useState(agent.timezone ?? 'America/Monterrey');
  const [tzOpen, setTzOpen]               = useState(false);
  const tzRef                             = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (tzRef.current && !tzRef.current.contains(e.target as Node)) setTzOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const toggleFunc = (key: string) =>
    setFuncOpen(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });

  const handlePlanChange = (p: Plan) => {
    setPlan(p);
    setFeatures(PLAN_FEATURES[p]);
  };

  const toggleFeature = (key: keyof AgentFeatures) => {
    if (PLAN_FEATURES.comercial[key]) return;
    if (!PLAN_FEATURES.comercial[key] && plan === 'comercial') return;
    setFeatures(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const handleResyncWebsite = async () => {
    setResyncing(true);
    setResyncOk(false);
    const res = await fetch(`/api/admin/agentes/${agent.id}/resync-website`, { method: 'POST' });
    setResyncing(false);
    if (res.ok) { setResyncOk(true); setTimeout(() => setResyncOk(false), 4000); }
    else { const { error } = await res.json().catch(() => ({ error: 'Error' })); alert(error ?? 'No se pudo sincronizar'); }
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSaving(true);
    const fd = new FormData(e.currentTarget);
    const body = {
      client_name:            fd.get('client_name'),
      client_email:           fd.get('client_email') || null,
      business_name:          fd.get('business_name'),
      business_description:   fd.get('business_description'),
      business_address:       fd.get('business_address'),
      business_website:       fd.get('business_website') || null,
      timezone:               fd.get('timezone') || 'America/Monterrey',
      phone_number:           fd.get('phone_number'),
      knowledge_base:         fd.get('knowledge_base'),
      agent_name:             plan === 'pro' ? fd.get('agent_name') : null,
      elevenlabs_voice_id:    voiceId ?? null,
      business_phone_display: fd.get('business_phone_display'),
      transfer_number:        fd.get('transfer_number'),
      transfer_whatsapp:      fd.get('transfer_whatsapp'),
      calendar_url:           fd.get('calendar_url'),
      role,
      role_knowledge_base: fd.get('role_knowledge_base'),
      plan,
      features: { ...features, vertical },
      business_hours:         hoursEnabled ? businessHours : null,
      minutes_included:       PLAN_MINUTES[plan],
      wa_phone_number:        plan === 'pro' && waActive ? (agent.phone_number ?? null) : null,
    };

    const res = await fetch(`/api/admin/agentes/${agent.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (res.ok) {
      router.push(`/admin/agentes/${agent.id}`);
      router.refresh();
    } else {
      alert('Error al guardar los cambios');
      setSaving(false);
    }
  };

  return (
    <div className="p-4 md:p-8 max-w-2xl">
      <div className="flex items-center gap-3 mb-6">
        <Link href={`/admin/agentes/${agent.id}`}
          className="p-2 rounded-lg hover:bg-[var(--c-surface-2)] transition-colors flex-shrink-0"
          style={{ color: 'var(--c-text-2)' }}>
          <ArrowLeft size={18} />
        </Link>
        <div className="min-w-0">
          <h1 className="text-xl font-bold truncate" style={{ color: 'var(--c-text)' }}>Editar agente</h1>
          <p className="text-sm mt-0.5 truncate" style={{ color: 'var(--c-text-2)' }}>{agent.business_name}</p>
        </div>
      </div>

      {/* Tab nav */}
      <div className="flex gap-1 p-1 rounded-xl mb-6" style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)' }}>
        {TABS.map(t => (
          <button key={t.id} type="button" onClick={() => setTab(t.id)}
            className="flex-1 py-2 rounded-lg text-xs font-medium transition-all"
            style={{ background: tab === t.id ? '#6C3BFF' : 'transparent', color: tab === t.id ? '#fff' : 'var(--c-text-3)' }}>
            {t.label}
          </button>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-6">

        {/* ── Tab: Información ─────────────────────────────────────────── */}
        <div className={tab !== 'info' ? 'hidden' : 'flex flex-col gap-6'}>

          <Section title="Vertical del cliente">
            <p className="text-xs mb-3" style={{ color: 'var(--c-text-3)' }}>
              Determina qué secciones de Oficina se muestran en el portal del cliente.
            </p>
            <div className="flex gap-2">
              {([
                { value: 'negocio',  label: 'Negocio',  desc: 'Empresas, comercios, servicios'   },
                { value: 'gobierno', label: 'Gobierno',  desc: 'Municipios, dependencias, H. Cabildo' },
              ] as const).map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setVertical(opt.value)}
                  className="flex-1 flex flex-col gap-0.5 px-4 py-3 rounded-xl text-left transition-all"
                  style={{
                    background: vertical === opt.value ? 'rgba(108,59,255,0.15)' : 'var(--c-surface-2)',
                    border:     vertical === opt.value ? '2px solid rgba(108,59,255,0.5)' : '2px solid var(--c-border)',
                    color:      vertical === opt.value ? '#9B6DFF' : 'var(--c-text-2)',
                  }}
                >
                  <span className="text-sm font-semibold">{opt.label}</span>
                  <span className="text-xs opacity-70">{opt.desc}</span>
                </button>
              ))}
            </div>
          </Section>

          <Section title="Segundo rol">
            <div>
              <label className="block text-xs mb-1.5" style={{ color: 'var(--c-text-2)' }}>Nombre del rol</label>
              <input
                type="text"
                value={role}
                onChange={e => setRole(e.target.value)}
                placeholder="Ej: Procesador de facturas, Coordinador de juntas…"
                style={{ background: 'var(--c-input-bg)', border: '1px solid var(--c-input-border)', borderRadius: 8, padding: '10px 12px', color: 'var(--c-text)', fontSize: 14, width: '100%', outline: 'none' }}
              />
              <p className="text-xs mt-1.5" style={{ color: 'var(--c-text-3)' }}>
                Opcional. El comportamiento se define en la base de conocimiento del agente.
              </p>
            </div>
          </Section>

          <Section title="Plan">
            <div className="grid grid-cols-2 gap-3">
              {PLANS.map(p => (
                <button key={p} type="button" onClick={() => handlePlanChange(p)}
                  className="p-3 sm:p-4 rounded-xl border text-left transition-all"
                  style={{
                    borderColor: plan === p ? PLAN_COLORS[p] : 'var(--c-border)',
                    background:  plan === p ? `${PLAN_COLORS[p]}15` : 'var(--c-surface)',
                  }}>
                  <div className="font-semibold text-sm" style={{ color: plan === p ? PLAN_COLORS[p] : 'var(--c-text)' }}>
                    {PLAN_LABELS[p]}
                  </div>
                  <div className="text-xs mt-1 leading-snug" style={{ color: 'var(--c-text-3)' }}>
                    {p === 'comercial' ? 'Funciones base · agente Centinelia' : 'Todas las funciones · nombre propio'}
                  </div>
                </button>
              ))}
            </div>
          </Section>

          <Section title="Datos del cliente">
            <Field label="Nombre del cliente" name="client_name" required defaultValue={agent.client_name} />
            <Field label="Email del cliente" name="client_email" placeholder="cliente@email.com"
              defaultValue={(agent as any).client_email ?? ''} />
          </Section>

          <Section title="Negocio">
            <Field label="Nombre del negocio" name="business_name" required defaultValue={agent.business_name} />
            <Field label="Descripción" name="business_description" textarea defaultValue={agent.business_description} />
            <Field label="Dirección" name="business_address" defaultValue={agent.business_address ?? ''} />
            {/* Website + resync */}
            <div>
              <label className="block text-xs mb-1.5" style={{ color: 'var(--c-text-2)' }}>Sitio web</label>
              <div className="flex gap-2">
                <input name="business_website" placeholder="https://negocio.com"
                  defaultValue={(agent as any).business_website ?? ''}
                  className="flex-1"
                  style={{ background: 'var(--c-input-bg)', border: '1px solid var(--c-input-border)', borderRadius: 8, padding: '10px 12px', color: 'var(--c-text)', fontSize: 14, outline: 'none' }} />
                <button type="button" onClick={handleResyncWebsite} disabled={resyncing}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium whitespace-nowrap transition-opacity hover:opacity-80"
                  style={{
                    background: resyncOk ? 'rgba(34,197,94,0.1)' : 'rgba(108,59,255,0.08)',
                    color:      resyncOk ? '#16a34a' : '#9B6DFF',
                    border:     `1px solid ${resyncOk ? 'rgba(34,197,94,0.25)' : 'rgba(108,59,255,0.2)'}`,
                    opacity:    resyncing ? 0.5 : 1,
                  }}>
                  {resyncing ? <RefreshCw size={11} className="animate-spin" /> : resyncOk ? <Check size={11} /> : <RefreshCw size={11} />}
                  {resyncing ? 'Sincronizando…' : resyncOk ? 'Listo' : 'Sincronizar'}
                </button>
              </div>
            </div>
            {/* Timezone custom dropdown */}
            <div>
              <label className="block text-xs mb-1.5" style={{ color: 'var(--c-text-2)' }}>Zona horaria</label>
              <input type="hidden" name="timezone" value={timezone} />
              <div className="relative" ref={tzRef}>
                <button type="button" onClick={() => setTzOpen(o => !o)}
                  className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm"
                  style={{ background: 'var(--c-input-bg)', border: '1px solid var(--c-input-border)', color: 'var(--c-text)' }}>
                  <span>{MEXICO_TIMEZONES.find(tz => tz.value === timezone)?.label ?? timezone}</span>
                  <ChevronDown size={14} style={{ color: 'var(--c-text-3)', flexShrink: 0 }} />
                </button>
                {tzOpen && (
                  <div className="absolute top-full left-0 right-0 mt-1 rounded-xl overflow-hidden z-50"
                    style={{ background: '#1e0d45', border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 8px 24px rgba(0,0,0,0.5)' }}>
                    {MEXICO_TIMEZONES.map(tz => (
                      <button key={tz.value} type="button"
                        onClick={() => { setTimezone(tz.value); setTzOpen(false); }}
                        className="w-full text-left px-4 py-2.5 text-sm transition-colors"
                        style={{
                          color: timezone === tz.value ? '#9B6DFF' : 'rgba(255,255,255,0.8)',
                          background: timezone === tz.value ? 'rgba(108,59,255,0.15)' : 'transparent',
                        }}>
                        {tz.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <Field label="Número de teléfono del agente" name="phone_number"
              defaultValue={agent.phone_number}
              helper="Número asignado en Vapi que recibe las llamadas entrantes." />
          </Section>
        </div>

        {/* ── Tab: Agente ──────────────────────────────────────────────── */}
        <div className={tab !== 'agente' ? 'hidden' : 'flex flex-col gap-6'}>

          <Section title="Identidad">
            <div className="p-3 rounded-lg leading-relaxed"
              style={{ background: 'rgba(168,85,247,0.08)', border: '1px solid rgba(168,85,247,0.2)' }}>
              <p className="text-xs" style={{ color: 'var(--c-text-2)' }}>
                En <strong style={{ color: 'var(--c-text)' }}>Agente Comercial</strong> el agente
                siempre se llama <strong style={{ color: 'var(--c-text)' }}>Centinelia</strong>.
                Con <span style={{ color: '#a855f7', fontWeight: 600 }}>Ejecutivo Senior</span> puedes
                asignarle un nombre personalizado.
              </p>
            </div>
            <Field label="Nombre del agente" name="agent_name"
              placeholder={plan === 'pro' ? 'Ej: Sofía, Carlos, Luna…' : 'Disponible en Ejecutivo Senior'}
              defaultValue={agent.agent_name ?? ''}
              disabled={plan !== 'pro'} />
          </Section>

          <Section title="Voz">
            <p className="text-xs mb-1" style={{ color: 'var(--c-text-2)' }}>
              Elige la voz de ElevenLabs. Usa ▶ para escuchar una muestra antes de seleccionar.
            </p>
            <VoiceSelector selected={voiceId} onChange={setVoiceId} />
          </Section>

          <Section title="Base de conocimiento general">
            <p className="text-xs leading-relaxed" style={{ color: 'var(--c-text-2)' }}>
              Servicios, productos, precios, horarios y preguntas frecuentes del negocio.
              Mientras más detallada, mejor responderá el agente.
            </p>
            <Field label="Información del negocio" name="knowledge_base" textarea rows={12}
              defaultValue={agent.knowledge_base ?? ''}
              placeholder={`SERVICIOS:\n- Ejemplo: $150\n\nFAQs:\n¿Aceptan tarjeta? Sí.`} />
          </Section>

          {(agent as any).role && (
            <Section title={`Base de conocimiento: ${(agent as any).role}`}>
              <p className="text-xs leading-relaxed" style={{ color: 'var(--c-text-2)' }}>
                Procedimientos, reglas y contexto específico para que el agente actúe como <strong>{(agent as any).role}</strong>.
              </p>
              <Field label="Instrucciones del rol" name="role_knowledge_base" textarea rows={12}
                defaultValue={(agent as any).role_knowledge_base ?? ''}
                placeholder={`PROCEDIMIENTO:\n1. Revisar el documento.\n2. Comparar contra criterios.\n3. Escalar si hay discrepancia.\n\nLÍMITES:\n- Hasta $10,000: aprobación automática.`} />
            </Section>
          )}
        </div>

        {/* ── Tab: Funciones ───────────────────────────────────────────── */}
        <div className={tab !== 'funciones' ? 'hidden' : 'flex flex-col gap-4'}>

          {/* Llamadas entrantes */}
          <CollapsibleSection
            id="entrantes"
            open={funcOpen.has('entrantes')}
            onToggle={() => toggleFunc('entrantes')}
            title={<span className="flex items-center gap-1.5"><Phone size={13} />Llamadas entrantes</span>}>

            {/* Base features — static, no toggle */}
            <div>
              <p className="text-[10px] font-semibold tracking-widest uppercase mb-2" style={{ color: 'var(--c-text-4)' }}>
                Siempre incluidas
              </p>
              <div className="rounded-xl overflow-hidden" style={{ border: '1px solid rgba(108,59,255,0.2)' }}>
                {BASE_INBOUND.map((key, i) => (
                  <div key={key} className="flex items-start gap-3 px-3 py-2.5"
                    style={{
                      background: 'var(--c-surface)',
                      borderBottom: i < BASE_INBOUND.length - 1 ? '1px solid rgba(108,59,255,0.08)' : undefined,
                    }}>
                    <Check size={14} className="flex-shrink-0 mt-0.5" style={{ color: '#6C3BFF' }} />
                    <div>
                      <p className="text-sm font-medium" style={{ color: 'var(--c-text)' }}>{FEATURE_LABELS[key]}</p>
                      <p className="text-xs mt-0.5" style={{ color: 'var(--c-text-3)' }}>{FEATURE_DESCRIPTIONS[key]}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Pro-only inbound features */}
            <div>
              <p className="text-[10px] font-semibold tracking-widest uppercase mb-2" style={{ color: 'var(--c-text-4)' }}>
                {plan === 'pro' ? 'Funciones adicionales' : 'Funciones Pro'}
              </p>
              {plan === 'comercial' && (
                <p className="text-xs mb-2" style={{ color: 'var(--c-text-3)' }}>
                  Disponibles al cambiar a <span style={{ color: '#a855f7', fontWeight: 600 }}>Ejecutivo Senior</span>.
                </p>
              )}
              <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${plan === 'pro' ? 'var(--c-border)' : 'rgba(168,85,247,0.15)'}` }}>
                {PRO_INBOUND.map((key, i) => {
                  const on = features[key] && plan === 'pro';
                  return (
                    <div key={key}
                      className={`flex items-start gap-3 px-3 py-2.5 ${plan === 'pro' ? 'cursor-pointer' : ''}`}
                      onClick={() => toggleFeature(key)}
                      style={{
                        background: 'var(--c-surface)',
                        borderBottom: i < PRO_INBOUND.length - 1 ? '1px solid var(--c-border)' : undefined,
                        opacity: plan === 'comercial' ? 0.45 : 1,
                      }}>
                      {plan === 'comercial'
                        ? <Lock size={14} className="flex-shrink-0 mt-0.5" style={{ color: '#a855f7' }} />
                        : <div className="w-9 h-5 rounded-full transition-colors relative flex-shrink-0 mt-0.5"
                            style={{ background: on ? '#6C3BFF' : 'var(--c-border-2)' }}>
                            <span className="absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all"
                              style={{ left: on ? '1.125rem' : '0.125rem' }} />
                          </div>
                      }
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium" style={{ color: on ? 'var(--c-text)' : 'var(--c-text-3)' }}>
                          {FEATURE_LABELS[key]}
                        </p>
                        <p className="text-xs mt-0.5" style={{ color: 'var(--c-text-3)' }}>{FEATURE_DESCRIPTIONS[key]}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Field settings */}
            <Field label="Teléfono que menciona el agente" name="business_phone_display" defaultValue={agent.business_phone_display} />
            <Field label="Número de transferencia a humano" name="transfer_number" defaultValue={agent.transfer_number ?? ''}
              helper="Si el caller pide hablar con una persona, el agente transfiere a este número." />
            <Field label="WhatsApp del dueño (notificaciones de leads)" name="transfer_whatsapp" defaultValue={agent.transfer_whatsapp ?? ''} />
            <Field label="Link de calendario (para agendar citas)" name="calendar_url" defaultValue={agent.calendar_url ?? ''} />
          </CollapsibleSection>

          {/* Llamadas salientes — solo Pro */}
          <CollapsibleSection
            id="salientes"
            open={funcOpen.has('salientes')}
            onToggle={() => toggleFunc('salientes')}
            title={<span className="flex items-center gap-1.5"><PhoneOutgoing size={13} />Llamadas salientes</span>}>
            <ProToggleRow
              label="Activar llamadas salientes"
              desc={features.outbound_calls
                ? 'El cliente puede subir contactos y disparar llamadas desde su portal'
                : 'Permite al cliente disparar llamadas programadas desde su portal'}
              isPro={plan === 'pro'}
              active={plan === 'pro' && features.outbound_calls}
              accentColor="#6C3BFF"
              onToggle={() => plan === 'pro' && toggleFeature('outbound_calls')}
            />
          </CollapsibleSection>

          {/* Horarios */}
          <CollapsibleSection
            id="horarios"
            open={funcOpen.has('horarios')}
            onToggle={() => toggleFunc('horarios')}
            title={<span className="flex items-center gap-1.5"><Clock size={13} />Horarios de atención</span>}>
            <div className="flex items-center justify-between p-3 rounded-xl cursor-pointer select-none"
              style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)' }}
              onClick={() => setHoursEnabled(v => !v)}>
              <div>
                <p className="text-sm" style={{ color: 'var(--c-text)' }}>Restringir horario</p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--c-text-3)' }}>El agente solo contesta en el horario configurado</p>
              </div>
              <Toggle on={hoursEnabled} color="#6C3BFF" />
            </div>

            {hoursEnabled && (
              <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--c-border)' }}>
                {DAYS.map(({ key, label }, i) => {
                  const s: DaySchedule = businessHours[key] ?? { open: false };
                  return (
                    <div key={key} className="flex items-center gap-3 px-3 py-2"
                      style={{
                        background:   'var(--c-surface)',
                        borderBottom: i < DAYS.length - 1 ? '1px solid var(--c-border)' : undefined,
                      }}>
                      <div className="flex items-center gap-2 w-28 flex-shrink-0 cursor-pointer select-none"
                        onClick={() => setBusinessHours(h => ({ ...h, [key]: { ...s, open: !s.open } }))}>
                        <Toggle on={s.open} size="sm" color="#6C3BFF" />
                        <span className="text-xs" style={{ color: s.open ? 'var(--c-text)' : 'var(--c-text-3)' }}>{label}</span>
                      </div>
                      {s.open ? (
                        <div className="flex items-center gap-2">
                          <input type="text" value={s.from ?? '09:00'} maxLength={5} placeholder="09:00"
                            onChange={e => {
                              let v = e.target.value.replace(/\D/g, '');
                              if (v.length >= 3) v = v.slice(0, 2) + ':' + v.slice(2, 4);
                              setBusinessHours(h => ({ ...h, [key]: { ...s, from: v } }));
                            }}
                            className="rounded px-2 py-1 text-xs outline-none w-14 text-center"
                            style={{ background: 'var(--c-input-bg)', border: '1px solid var(--c-input-border)', color: 'var(--c-text)' }} />
                          <span className="text-xs" style={{ color: 'var(--c-text-3)' }}>–</span>
                          <input type="text" value={s.to ?? '18:00'} maxLength={5} placeholder="18:00"
                            onChange={e => {
                              let v = e.target.value.replace(/\D/g, '');
                              if (v.length >= 3) v = v.slice(0, 2) + ':' + v.slice(2, 4);
                              setBusinessHours(h => ({ ...h, [key]: { ...s, to: v } }));
                            }}
                            className="rounded px-2 py-1 text-xs outline-none w-14 text-center"
                            style={{ background: 'var(--c-input-bg)', border: '1px solid var(--c-input-border)', color: 'var(--c-text)' }} />
                        </div>
                      ) : (
                        <span className="text-xs" style={{ color: 'var(--c-text-4)' }}>Cerrado</span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </CollapsibleSection>
        </div>

        <button type="submit" disabled={saving}
          className="w-full py-3 rounded-xl font-semibold text-sm transition-opacity"
          style={{ background: '#6C3BFF', color: '#FAFBFF', opacity: saving ? 0.6 : 1 }}>
          {saving ? 'Guardando…' : 'Guardar cambios'}
        </button>
      </form>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function Section({ title, children }: { title: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="text-xs font-semibold mb-3 tracking-widest uppercase flex items-center gap-1.5"
        style={{ color: 'var(--c-text-3)' }}>{title}</h2>
      <div className="flex flex-col gap-3">{children}</div>
    </div>
  );
}

function CollapsibleSection({ id, title, open, onToggle, children }: {
  id: string; title: React.ReactNode; open: boolean; onToggle: () => void; children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--c-border)', background: 'var(--c-surface)' }}>
      <button type="button" onClick={onToggle}
        className="w-full flex items-center justify-between px-4 py-3 text-left"
        style={{ background: open ? 'var(--c-surface-2)' : 'transparent' }}>
        <h2 className="text-xs font-semibold tracking-widest uppercase flex items-center gap-1.5"
          style={{ color: 'var(--c-text-3)' }}>{title}</h2>
        <ChevronDown size={14} className="flex-shrink-0 transition-transform"
          style={{ color: 'var(--c-text-4)', transform: open ? 'rotate(180deg)' : undefined }} />
      </button>
      {open && (
        <div className="flex flex-col gap-3 px-4 pb-4 pt-2" style={{ borderTop: '1px solid var(--c-border)' }}>
          {children}
        </div>
      )}
    </div>
  );
}

function Toggle({ on, color = '#6C3BFF', size = 'md', locked }: {
  on: boolean; color?: string; size?: 'md' | 'sm'; locked?: boolean;
}) {
  const w = size === 'sm' ? 28 : 36;
  const h = size === 'sm' ? 14 : 18;
  const d = size === 'sm' ? 10 : 14;
  return (
    <div className="rounded-full transition-colors relative flex-shrink-0"
      style={{ width: w, height: h, background: on ? color : 'var(--c-border-2)', opacity: locked ? 0.75 : 1, cursor: locked ? 'not-allowed' : undefined }}>
      <span className="absolute rounded-full bg-white transition-all"
        style={{ width: d, height: d, top: 2, left: on ? w - d - 2 : 2 }} />
    </div>
  );
}

function ProToggleRow({ label, desc, isPro, active, accentColor, onToggle }: {
  label: string; desc: string; isPro: boolean; active: boolean; accentColor: string; onToggle: () => void;
}) {
  return (
    <div className="flex items-center justify-between p-3 rounded-xl select-none"
      style={{
        background: active ? `${accentColor}0D` : 'var(--c-surface)',
        border:     `1px solid ${active ? `${accentColor}40` : 'var(--c-border)'}`,
        opacity:    !isPro ? 0.5 : 1,
        cursor:     !isPro ? 'not-allowed' : 'pointer',
      }}
      onClick={onToggle}>
      <div className="flex-1 min-w-0 mr-3">
        <p className="text-sm" style={{ color: active ? 'var(--c-text)' : 'var(--c-text-3)' }}>
          {label}
          {!isPro && <span className="ml-2 text-xs" style={{ color: '#a855f7' }}>Solo Ejecutivo Senior</span>}
        </p>
        <p className="text-xs mt-0.5" style={{ color: active ? accentColor : 'var(--c-text-3)' }}>{desc}</p>
      </div>
      <Toggle on={active} color={accentColor} />
    </div>
  );
}

function Field({ label, name, required, placeholder, textarea, rows, defaultValue, disabled, helper }: {
  label: string; name: string; required?: boolean; placeholder?: string;
  textarea?: boolean; rows?: number; defaultValue?: string; disabled?: boolean; helper?: string;
}) {
  const base: React.CSSProperties = {
    background: disabled ? 'var(--c-surface)' : 'var(--c-input-bg)',
    border: '1px solid var(--c-input-border)',
    borderRadius: 8,
    padding: '10px 12px',
    color: 'var(--c-text)',
    fontSize: 14,
    width: '100%',
    outline: 'none',
    opacity: disabled ? 0.45 : 1,
  };
  return (
    <div>
      <label className="block text-xs mb-1.5" style={{ color: 'var(--c-text-2)' }}>
        {label}{required && <span style={{ color: '#9B6DFF' }}> *</span>}
      </label>
      {textarea
        ? <textarea name={name} rows={rows ?? 3} placeholder={placeholder} defaultValue={defaultValue}
            disabled={disabled} style={{ ...base, resize: 'vertical' }} />
        : <input name={name} required={required} placeholder={placeholder} defaultValue={defaultValue}
            disabled={disabled} style={base} />
      }
      {helper && <p className="text-xs mt-1" style={{ color: 'var(--c-text-3)' }}>{helper}</p>}
    </div>
  );
}
