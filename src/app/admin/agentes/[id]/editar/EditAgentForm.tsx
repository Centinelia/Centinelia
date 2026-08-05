'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft, RefreshCw, Check, Phone, PhoneOutgoing,
  Clock, ChevronDown, Puzzle, Settings2, Building2, User as UserIcon,
  Bot, Mic, Briefcase, BookOpen,
} from 'lucide-react';
import VoiceSelector from '@/components/VoiceSelector';
import { FEATURE_LABELS } from '@/types/agent';
import type { AgentFeatures, VoiceAgent, BusinessHours, DaySchedule } from '@/types/agent';

// ── Feature groups ────────────────────────────────────────────────────────────

const INBOUND_FEATURES: { key: keyof AgentFeatures; desc: string }[] = [
  { key: 'lead_qualification',      desc: 'Pregunta nombre, contacto e interés del llamante y lo registra' },
  { key: 'appointment_booking',     desc: 'Agenda, modifica o cancela citas y las registra' },
  { key: 'existing_client_support', desc: 'Atiende dudas y consultas de clientes actuales' },
  { key: 'smart_transfer',          desc: 'Transfiere a humano y notifica por WhatsApp cuando es necesario' },
  { key: 'order_taking',            desc: 'Toma pedidos de productos o platillos y los registra' },
  { key: 'multilingual',            desc: 'Cambia a inglés automáticamente si el llamante lo requiere' },
  { key: 'client_memory',           desc: 'Recuerda historial de llamadas anteriores del mismo número' },
];

const MODULE_FEATURES: { key: keyof AgentFeatures; label: string; desc: string }[] = [
  { key: 'helpdesk',       label: 'Mesa de ayuda IT',      desc: 'Activa tools de tickets, incidentes y directorio' },
  { key: 'of_encuestas',   label: 'Encuestas telefónicas', desc: 'El empleado puede aplicar encuestas en llamada' },
  { key: 'civic_reports',  label: 'Reportes ciudadanos',   desc: 'Módulo de reportes para verticales de gobierno' },
  { key: 'contract_drafts',label: 'Contratos',             desc: 'El empleado puede redactar borradores de contrato' },
];

const PROMPT_FLAGS: { key: keyof AgentFeatures; label: string; desc: string }[] = [
  { key: 'skip_aup',              label: 'Omitir aviso de privacidad', desc: 'No lee el AUP al iniciar la llamada' },
  { key: 'skip_recording_notice', label: 'Omitir aviso de grabación',  desc: 'No menciona que la llamada se graba' },
  { key: 'lite_prompt',           label: 'Prompt ligero',              desc: 'System prompt reducido, menor latencia, menos contexto' },
  { key: 'is_coordinator',        label: 'Coordinador (sin voz)',      desc: 'Empleado de oficina puro: Nox, Niva. Sin llamadas entrantes' },
];

// ── Constants ─────────────────────────────────────────────────────────────────

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

const DAYS: { key: keyof BusinessHours; label: string }[] = [
  { key: 'monday',    label: 'Lunes'     },
  { key: 'tuesday',   label: 'Martes'    },
  { key: 'wednesday', label: 'Miércoles' },
  { key: 'thursday',  label: 'Jueves'    },
  { key: 'friday',    label: 'Viernes'   },
  { key: 'saturday',  label: 'Sábado'    },
  { key: 'sunday',    label: 'Domingo'   },
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

type Tab = 'negocio' | 'empleado' | 'funciones';
const TABS: { id: Tab; label: string }[] = [
  { id: 'negocio',   label: 'Negocio'   },
  { id: 'empleado',  label: 'Empleado'  },
  { id: 'funciones', label: 'Funciones' },
];

// ── Component ─────────────────────────────────────────────────────────────────

export default function EditAgentForm({ agent }: { agent: VoiceAgent }) {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const initialTab   = (searchParams.get('tab') as Tab | null) ?? 'negocio';

  const [saving,        setSaving]        = useState(false);
  const [resyncing,     setResyncing]     = useState(false);
  const [resyncOk,      setResyncOk]      = useState(false);
  const [voiceId,       setVoiceId]       = useState<string | null>(agent.elevenlabs_voice_id ?? null);
  const [tab,           setTab]           = useState<Tab>(initialTab);
  const [role,          setRole]          = useState(agent.role ?? '');
  const [features,      setFeatures]      = useState<AgentFeatures>(agent.features);
  const [vertical,      setVertical]      = useState<'negocio' | 'gobierno'>(agent.features.vertical ?? 'negocio');
  const [businessHours, setBusinessHours] = useState<BusinessHours>(agent.business_hours ?? DEFAULT_HOURS);
  const [hoursEnabled,  setHoursEnabled]  = useState(!!agent.business_hours);
  const [timezone,      setTimezone]      = useState(agent.timezone ?? 'America/Monterrey');
  const [tzOpen,        setTzOpen]        = useState(false);
  const tzRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (tzRef.current && !tzRef.current.contains(e.target as Node)) setTzOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const toggleFeature = (key: keyof AgentFeatures) =>
    setFeatures(prev => ({ ...prev, [key]: !prev[key] }));

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
      client_email:           fd.get('client_email')   || null,
      portal_email:           fd.get('portal_email')   || null,
      business_name:          fd.get('business_name'),
      business_description:   fd.get('business_description'),
      business_address:       fd.get('business_address'),
      business_website:       fd.get('business_website') || null,
      timezone:               fd.get('timezone') || 'America/Monterrey',
      phone_number:           fd.get('phone_number'),
      knowledge_base:         fd.get('knowledge_base'),
      role_knowledge_base:    fd.get('role_knowledge_base'),
      agent_name:             fd.get('agent_name') || null,
      elevenlabs_voice_id:    voiceId ?? null,
      business_phone_display: fd.get('business_phone_display'),
      transfer_number:        fd.get('transfer_number'),
      transfer_whatsapp:      fd.get('transfer_whatsapp'),
      calendar_url:           fd.get('calendar_url'),
      role,
      features: { ...features, vertical },
      business_hours: hoursEnabled ? businessHours : null,
    };

    const res = await fetch(`/api/admin/agentes/${agent.id}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
    });

    if (res.ok) {
      router.push(`/admin/agentes/${agent.id}`);
      router.refresh();
    } else {
      const { error: errMsg } = await res.json().catch(() => ({ error: null }));
      alert(errMsg ?? 'Error al guardar los cambios');
      setSaving(false);
    }
  };

  const displayName = agent.agent_name || agent.business_name;

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto pb-32">

      {/* Back link */}
      <div className="mb-3">
        <Link
          href={`/admin/agentes/${agent.id}`}
          className="inline-flex items-center gap-1.5 text-[13px] font-medium transition-colors hover:opacity-80"
          style={{ color: '#6B7280' }}
        >
          <ArrowLeft size={14} /> {displayName}
        </Link>
      </div>

      {/* Header */}
      <div className="mb-6">
        <h1 className="text-[24px] font-semibold tracking-tight" style={{ color: '#111827' }}>
          Editar empleado
        </h1>
        <p className="text-[13px] mt-1.5" style={{ color: '#6B7280' }}>
          Cambia identidad, negocio, funciones y horario.
        </p>
      </div>

      {/* Tab nav */}
      <div
        className="inline-flex gap-1 p-1 rounded-lg mb-6"
        style={{ background: '#F9FAFB', border: '1px solid #E5E7EB' }}
      >
        {TABS.map(t => {
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className="px-4 py-1.5 rounded-md text-[13px] font-medium transition-all"
              style={{
                background: active ? '#FFFFFF' : 'transparent',
                color:      active ? '#111827' : '#6B7280',
                boxShadow:  active ? '0 1px 2px 0 rgb(0 0 0 / 0.05)' : undefined,
              }}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-6">

        {/* ── Tab: Negocio ─────────────────────────────────────────────── */}
        <div className={tab !== 'negocio' ? 'hidden' : 'flex flex-col gap-6'}>

          <Card title="Vertical" icon={<Briefcase size={13} />}
                subtitle="Determina qué secciones de la Oficina se muestran en el portal del cliente.">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {([
                { value: 'negocio',  label: 'Negocio',  desc: 'Empresas, comercios, servicios'          },
                { value: 'gobierno', label: 'Gobierno', desc: 'Municipios, dependencias, H. Cabildo'    },
              ] as const).map(opt => {
                const active = vertical === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setVertical(opt.value)}
                    className="flex flex-col gap-0.5 px-4 py-3 rounded-lg text-left transition-all"
                    style={{
                      background: active ? '#F3F0FF' : '#FFFFFF',
                      border:     active ? '1px solid #6C3BFF' : '1px solid #E5E7EB',
                      color:      active ? '#4C1D95' : '#111827',
                    }}
                  >
                    <span className="text-[13px] font-semibold">{opt.label}</span>
                    <span className="text-[12px]" style={{ color: active ? '#7C3AED' : '#6B7280' }}>{opt.desc}</span>
                  </button>
                );
              })}
            </div>
          </Card>

          <Card title="Cliente" icon={<UserIcon size={13} />}>
            <Field label="Nombre del contacto" name="client_name" required defaultValue={agent.client_name} />
            <Field label="Email del cliente" name="client_email" placeholder="cliente@email.com"
              defaultValue={agent.client_email ?? ''} />
            <Field label="Email del portal" name="portal_email" placeholder="acceso@negocio.com"
              defaultValue={(agent as any).portal_email ?? ''}
              helper="Correo con el que el cliente inicia sesión en su portal. Todos los empleados con el mismo email comparten pool de minutos y tareas." />
          </Card>

          <Card title="Negocio" icon={<Building2 size={13} />}>
            <Field label="Nombre del negocio" name="business_name" required defaultValue={agent.business_name} />
            <Field label="Descripción" name="business_description" textarea defaultValue={agent.business_description} />
            <Field label="Dirección" name="business_address" defaultValue={agent.business_address ?? ''} />

            <div>
              <label className="block text-[12px] font-medium mb-1.5" style={{ color: '#374151' }}>
                Sitio web
              </label>
              <div className="flex gap-2">
                <input
                  name="business_website"
                  placeholder="https://negocio.com"
                  defaultValue={agent.business_website ?? ''}
                  className="flex-1 text-[13px] px-3 py-2 outline-none transition-colors focus:border-[#6C3BFF]"
                  style={{ background: '#FFFFFF', border: '1px solid #E5E7EB', borderRadius: 8, color: '#111827' }}
                />
                <button
                  type="button"
                  onClick={handleResyncWebsite}
                  disabled={resyncing}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-[13px] font-medium whitespace-nowrap transition-opacity hover:opacity-80"
                  style={{
                    background: resyncOk ? '#ECFDF5' : '#F3F0FF',
                    color:      resyncOk ? '#047857' : '#6C3BFF',
                    border:     `1px solid ${resyncOk ? '#A7F3D0' : '#E9E1FF'}`,
                    opacity:    resyncing ? 0.5 : 1,
                  }}
                >
                  {resyncing ? <RefreshCw size={12} className="animate-spin" /> : resyncOk ? <Check size={12} /> : <RefreshCw size={12} />}
                  {resyncing ? 'Sincronizando…' : resyncOk ? 'Listo' : 'Sincronizar'}
                </button>
              </div>
            </div>

            {/* Timezone */}
            <div>
              <label className="block text-[12px] font-medium mb-1.5" style={{ color: '#374151' }}>Zona horaria</label>
              <input type="hidden" name="timezone" value={timezone} />
              <div className="relative" ref={tzRef}>
                <button
                  type="button"
                  onClick={() => setTzOpen(o => !o)}
                  className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-[13px] transition-colors focus:border-[#6C3BFF]"
                  style={{ background: '#FFFFFF', border: '1px solid #E5E7EB', color: '#111827' }}
                >
                  <span>{MEXICO_TIMEZONES.find(tz => tz.value === timezone)?.label ?? timezone}</span>
                  <ChevronDown size={14} style={{ color: '#6B7280', flexShrink: 0 }} />
                </button>
                {tzOpen && (
                  <div
                    className="absolute top-full left-0 right-0 mt-1 rounded-lg overflow-hidden z-50"
                    style={{ background: '#FFFFFF', border: '1px solid #E5E7EB', boxShadow: '0 8px 24px rgba(0,0,0,0.08)' }}
                  >
                    {MEXICO_TIMEZONES.map(tz => (
                      <button
                        key={tz.value}
                        type="button"
                        onClick={() => { setTimezone(tz.value); setTzOpen(false); }}
                        className="w-full text-left px-4 py-2 text-[13px] transition-colors hover:bg-gray-50"
                        style={{
                          color:      timezone === tz.value ? '#6C3BFF' : '#374151',
                          background: timezone === tz.value ? '#F3F0FF' : 'transparent',
                          fontWeight: timezone === tz.value ? 500 : 400,
                        }}
                      >
                        {tz.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <Field label="Número Centinelia (Vapi)" name="phone_number"
              defaultValue={agent.phone_number}
              helper="Número asignado en Vapi que recibe las llamadas entrantes." />
          </Card>
        </div>

        {/* ── Tab: Empleado ─────────────────────────────────────────────── */}
        <div className={tab !== 'empleado' ? 'hidden' : 'flex flex-col gap-6'}>

          <Card title="Identidad" icon={<Bot size={13} />}>
            <Field label="Nombre del empleado" name="agent_name"
              placeholder="Ej: Nia, Neo, Nova…"
              defaultValue={agent.agent_name ?? ''} />
          </Card>

          <Card title="Voz" icon={<Mic size={13} />}
                subtitle="Usa el ícono de reproducir para escuchar una muestra antes de seleccionar.">
            <VoiceSelector selected={voiceId} onChange={setVoiceId} />
          </Card>

          <Card title="Rol" icon={<Briefcase size={13} />}
                subtitle="Define el segundo rol del empleado. La base de conocimiento del rol aparece abajo al escribirlo.">
            <input
              type="text"
              value={role}
              onChange={e => setRole(e.target.value)}
              placeholder="Ej: Procesador de facturas, Coordinador de juntas…"
              className="w-full text-[13px] px-3 py-2 outline-none transition-colors focus:border-[#6C3BFF]"
              style={{ background: '#FFFFFF', border: '1px solid #E5E7EB', borderRadius: 8, color: '#111827' }}
            />
          </Card>

          <Card title="Base de conocimiento del negocio" icon={<BookOpen size={13} />}
                subtitle="Servicios, productos, precios, horarios y preguntas frecuentes. Mientras más detallada, mejor responde el empleado.">
            <Field label="" name="knowledge_base" textarea rows={12}
              defaultValue={agent.knowledge_base ?? ''}
              placeholder={`SERVICIOS:\n- Ejemplo: $150\n\nFAQs:\n¿Aceptan tarjeta? Sí.`} />
          </Card>

          {role.trim() && (
            <Card title={`Base de conocimiento: ${role}`} icon={<BookOpen size={13} />}
                  subtitle={`Procedimientos y reglas específicas para que el empleado actúe como ${role}.`}>
              <Field label="" name="role_knowledge_base" textarea rows={12}
                defaultValue={agent.role_knowledge_base ?? ''}
                placeholder={`PROCEDIMIENTO:\n1. Revisar el documento.\n2. Comparar contra criterios.\n3. Escalar si hay discrepancia.\n\nLÍMITES:\n- Hasta $10,000: aprobación automática.`} />
            </Card>
          )}
        </div>

        {/* ── Tab: Funciones ───────────────────────────────────────────── */}
        <div className={tab !== 'funciones' ? 'hidden' : 'flex flex-col gap-6'}>

          {/* Llamadas entrantes */}
          <Card title="Llamadas entrantes" icon={<Phone size={13} />}>
            <div className="rounded-lg overflow-hidden" style={{ border: '1px solid #E5E7EB' }}>
              {INBOUND_FEATURES.map(({ key, desc }, i) => {
                const on = !!features[key];
                return (
                  <div
                    key={key}
                    className="flex items-start gap-3 px-4 py-3 cursor-pointer select-none transition-colors hover:bg-gray-50"
                    onClick={() => toggleFeature(key)}
                    style={{
                      background: on ? '#FAFAFF' : '#FFFFFF',
                      borderTop:  i > 0 ? '1px solid #F3F4F6' : undefined,
                    }}
                  >
                    <Toggle on={on} />
                    <div className="min-w-0">
                      <p className="text-[13px] font-medium" style={{ color: on ? '#111827' : '#6B7280' }}>
                        {FEATURE_LABELS[key]}
                      </p>
                      <p className="text-[12px] mt-0.5" style={{ color: '#6B7280' }}>{desc}</p>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex flex-col gap-3 pt-2">
              <Field label="Número que menciona el empleado" name="business_phone_display" defaultValue={agent.business_phone_display} />
              <Field label="Número de transferencia a humano" name="transfer_number"
                defaultValue={agent.transfer_number ?? ''}
                helper="Si el llamante pide hablar con una persona, el empleado transfiere aquí." />
              <Field label="WhatsApp para notificaciones" name="transfer_whatsapp"
                defaultValue={agent.transfer_whatsapp ?? ''}
                helper="Recibe avisos de leads, citas y pedidos en este número." />
              <Field label="Link de calendario" name="calendar_url"
                defaultValue={agent.calendar_url ?? ''}
                helper="Calendly, Google Cal u otro link para agendar citas." />
            </div>
          </Card>

          {/* Llamadas salientes */}
          <Card title="Llamadas salientes" icon={<PhoneOutgoing size={13} />}>
            <FeatureToggleRow
              label="Activar llamadas salientes"
              desc="El cliente puede subir contactos y disparar campañas desde su portal"
              active={!!features.outbound_calls}
              onToggle={() => toggleFeature('outbound_calls')}
            />
          </Card>

          {/* Módulos */}
          <Card title="Módulos" icon={<Puzzle size={13} />}>
            <div className="flex flex-col gap-2">
              {MODULE_FEATURES.map(({ key, label, desc }) => (
                <FeatureToggleRow
                  key={key}
                  label={label}
                  desc={desc}
                  active={!!(features as any)[key]}
                  onToggle={() => toggleFeature(key)}
                />
              ))}
            </div>
          </Card>

          {/* Configuración avanzada */}
          <Card title="Configuración avanzada" icon={<Settings2 size={13} />}>
            <div className="flex flex-col gap-2">
              {PROMPT_FLAGS.map(({ key, label, desc }) => (
                <FeatureToggleRow
                  key={key}
                  label={label}
                  desc={desc}
                  active={!!(features as any)[key]}
                  onToggle={() => toggleFeature(key)}
                />
              ))}
            </div>
          </Card>

          {/* Horarios */}
          <Card title="Horarios de atención" icon={<Clock size={13} />}>
            <div
              className="flex items-center justify-between p-3 rounded-lg cursor-pointer select-none transition-colors hover:bg-gray-50"
              style={{ background: '#FFFFFF', border: '1px solid #E5E7EB' }}
              onClick={() => setHoursEnabled(v => !v)}
            >
              <div>
                <p className="text-[13px] font-medium" style={{ color: '#111827' }}>Restringir horario</p>
                <p className="text-[12px] mt-0.5" style={{ color: '#6B7280' }}>El empleado solo contesta en el horario configurado</p>
              </div>
              <Toggle on={hoursEnabled} />
            </div>
            {hoursEnabled && (
              <div className="rounded-lg overflow-hidden mt-3" style={{ border: '1px solid #E5E7EB' }}>
                {DAYS.map(({ key, label }, i) => {
                  const s: DaySchedule = businessHours[key] ?? { open: false };
                  return (
                    <div
                      key={key}
                      className="flex items-center gap-3 px-4 py-2.5"
                      style={{ background: '#FFFFFF', borderTop: i > 0 ? '1px solid #F3F4F6' : undefined }}
                    >
                      <div
                        className="flex items-center gap-2 w-32 flex-shrink-0 cursor-pointer select-none"
                        onClick={() => setBusinessHours(h => ({ ...h, [key]: { ...s, open: !s.open } }))}
                      >
                        <Toggle on={s.open} size="sm" />
                        <span className="text-[13px]" style={{ color: s.open ? '#111827' : '#9CA3AF' }}>{label}</span>
                      </div>
                      {s.open ? (
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            maxLength={5}
                            placeholder="09:00"
                            value={s.from ?? '09:00'}
                            onChange={e => {
                              let v = e.target.value.replace(/\D/g, '');
                              if (v.length >= 3) v = v.slice(0, 2) + ':' + v.slice(2, 4);
                              setBusinessHours(h => ({ ...h, [key]: { ...s, from: v } }));
                            }}
                            className="rounded-md px-2 py-1 text-[13px] outline-none w-16 text-center tabular-nums"
                            style={{ background: '#FFFFFF', border: '1px solid #E5E7EB', color: '#111827' }}
                          />
                          <span className="text-[13px]" style={{ color: '#9CA3AF' }}>:</span>
                          <input
                            type="text"
                            maxLength={5}
                            placeholder="18:00"
                            value={s.to ?? '18:00'}
                            onChange={e => {
                              let v = e.target.value.replace(/\D/g, '');
                              if (v.length >= 3) v = v.slice(0, 2) + ':' + v.slice(2, 4);
                              setBusinessHours(h => ({ ...h, [key]: { ...s, to: v } }));
                            }}
                            className="rounded-md px-2 py-1 text-[13px] outline-none w-16 text-center tabular-nums"
                            style={{ background: '#FFFFFF', border: '1px solid #E5E7EB', color: '#111827' }}
                          />
                        </div>
                      ) : (
                        <span className="text-[12px]" style={{ color: '#9CA3AF' }}>Cerrado</span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </div>
      </form>

      {/* Sticky footer with Save/Cancel */}
      <div
        className="fixed bottom-0 left-0 right-0 z-40"
        style={{ background: 'rgba(255,255,255,0.85)', backdropFilter: 'blur(8px)', borderTop: '1px solid #E5E7EB' }}
      >
        <div className="max-w-4xl mx-auto px-4 md:px-8 py-3 flex items-center justify-end gap-2">
          <Link
            href={`/admin/agentes/${agent.id}`}
            className="inline-flex items-center px-4 py-2 rounded-lg text-[13px] font-medium transition-colors hover:bg-gray-50"
            style={{ background: '#FFFFFF', color: '#374151', border: '1px solid #E5E7EB' }}
          >
            Cancelar
          </Link>
          <button
            type="button"
            onClick={() => {
              const form = document.querySelector('form') as HTMLFormElement | null;
              form?.requestSubmit();
            }}
            disabled={saving}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-[13px] font-medium transition-opacity"
            style={{ background: '#6C3BFF', color: '#FFFFFF', opacity: saving ? 0.6 : 1 }}
          >
            {saving ? (
              <>
                <RefreshCw size={13} className="animate-spin" />
                Guardando…
              </>
            ) : (
              <>
                <Check size={13} />
                Guardar cambios
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── UI primitives ─────────────────────────────────────────────────────────────

function Card({ title, subtitle, icon, children }: {
  title: React.ReactNode; subtitle?: string; icon?: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <div
      className="rounded-xl bg-white overflow-hidden"
      style={{ border: '1px solid #E5E7EB', boxShadow: '0 1px 3px 0 rgb(0 0 0 / 0.05)' }}
    >
      <div className="px-5 py-3.5" style={{ borderBottom: '1px solid #F3F4F6' }}>
        <h2 className="text-[11px] uppercase tracking-wider font-medium flex items-center gap-1.5" style={{ color: '#9CA3AF' }}>
          {icon}
          {title}
        </h2>
        {subtitle && (
          <p className="text-[12px] mt-1" style={{ color: '#6B7280' }}>{subtitle}</p>
        )}
      </div>
      <div className="px-5 py-4 flex flex-col gap-3">
        {children}
      </div>
    </div>
  );
}

function FeatureToggleRow({ label, desc, active, onToggle }: {
  label: string; desc: string; active: boolean; onToggle: () => void;
}) {
  return (
    <div
      className="flex items-center justify-between p-3 rounded-lg cursor-pointer select-none transition-colors hover:bg-gray-50"
      style={{
        background: active ? '#FAFAFF' : '#FFFFFF',
        border:     `1px solid ${active ? '#E9E1FF' : '#E5E7EB'}`,
      }}
      onClick={onToggle}
    >
      <div className="flex-1 min-w-0 mr-3">
        <p className="text-[13px] font-medium" style={{ color: active ? '#111827' : '#6B7280' }}>{label}</p>
        <p className="text-[12px] mt-0.5" style={{ color: '#6B7280' }}>{desc}</p>
      </div>
      <Toggle on={active} />
    </div>
  );
}

function Toggle({ on, size = 'md' }: { on: boolean; size?: 'md' | 'sm' }) {
  const w = size === 'sm' ? 28 : 36;
  const h = size === 'sm' ? 16 : 20;
  const d = size === 'sm' ? 12 : 16;
  return (
    <div
      className="rounded-full transition-colors relative flex-shrink-0"
      style={{ width: w, height: h, background: on ? '#6C3BFF' : '#E5E7EB' }}
    >
      <span
        className="absolute rounded-full bg-white transition-all"
        style={{ width: d, height: d, top: 2, left: on ? w - d - 2 : 2, boxShadow: '0 1px 2px 0 rgb(0 0 0 / 0.1)' }}
      />
    </div>
  );
}

function Field({ label, name, required, placeholder, textarea, rows, defaultValue, helper }: {
  label: string; name: string; required?: boolean; placeholder?: string;
  textarea?: boolean; rows?: number; defaultValue?: string; helper?: string;
}) {
  const base: React.CSSProperties = {
    background:  '#FFFFFF',
    border:      '1px solid #E5E7EB',
    borderRadius: 8,
    padding:     '8px 12px',
    color:       '#111827',
    fontSize:    13,
    width:       '100%',
    outline:     'none',
  };
  return (
    <div>
      {label && (
        <label className="block text-[12px] font-medium mb-1.5" style={{ color: '#374151' }}>
          {label}
          {required && <span style={{ color: '#6C3BFF' }}> *</span>}
        </label>
      )}
      {textarea ? (
        <textarea
          name={name}
          rows={rows ?? 3}
          placeholder={placeholder}
          defaultValue={defaultValue}
          className="focus:border-[#6C3BFF] transition-colors"
          style={{ ...base, resize: 'vertical', fontFamily: 'inherit' }}
        />
      ) : (
        <input
          name={name}
          required={required}
          placeholder={placeholder}
          defaultValue={defaultValue}
          className="focus:border-[#6C3BFF] transition-colors"
          style={base}
        />
      )}
      {helper && <p className="text-[12px] mt-1" style={{ color: '#6B7280' }}>{helper}</p>}
    </div>
  );
}
