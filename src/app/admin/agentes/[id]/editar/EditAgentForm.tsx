'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft, RefreshCw, Check, Phone, PhoneOutgoing,
  Clock, ChevronDown, Puzzle, Settings2,
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
  { key: 'of_encuestas',   label: 'Encuestas telefónicas', desc: 'El agente puede aplicar encuestas en llamada' },
  { key: 'civic_reports',  label: 'Reportes ciudadanos',   desc: 'Módulo de reportes para verticales de gobierno' },
  { key: 'contract_drafts',label: 'Contratos',             desc: 'El agente puede redactar borradores de contrato' },
];

const PROMPT_FLAGS: { key: keyof AgentFeatures; label: string; desc: string }[] = [
  { key: 'skip_aup',              label: 'Omitir aviso de privacidad', desc: 'No lee el AUP al iniciar la llamada' },
  { key: 'skip_recording_notice', label: 'Omitir aviso de grabación',  desc: 'No menciona que la llamada se graba' },
  { key: 'lite_prompt',           label: 'Prompt ligero',              desc: 'System prompt reducido — menor latencia, menos contexto' },
  { key: 'is_coordinator',        label: 'Coordinador (sin voz)',       desc: 'Agente de oficina puro: Nox, Niva. Sin llamadas entrantes' },
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
  const [funcOpen,      setFuncOpen]      = useState(new Set(['entrantes', 'salientes', 'modulos', 'avanzado', 'horarios']));
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

  const toggleFunc    = (key: string) =>
    setFuncOpen(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });

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

  return (
    <div className="p-4 md:p-8 max-w-2xl">

      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Link href={`/admin/agentes/${agent.id}`}
          className="p-2 rounded-lg hover:bg-[var(--c-surface-2)] transition-colors flex-shrink-0"
          style={{ color: 'var(--c-text-2)' }}>
          <ArrowLeft size={18} />
        </Link>
        <div className="min-w-0">
          <h1 className="text-xl font-bold truncate" style={{ color: 'var(--c-text)' }}>
            Editar empleado
          </h1>
          <p className="text-sm mt-0.5 truncate" style={{ color: 'var(--c-text-2)' }}>
            {agent.business_name}
          </p>
        </div>
      </div>

      {/* Tab nav */}
      <div className="flex gap-1 p-1 rounded-xl mb-6"
        style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)' }}>
        {TABS.map(t => (
          <button key={t.id} type="button" onClick={() => setTab(t.id)}
            className="flex-1 py-2 rounded-lg text-xs font-medium transition-all"
            style={{ background: tab === t.id ? '#6C3BFF' : 'transparent', color: tab === t.id ? '#fff' : 'var(--c-text-3)' }}>
            {t.label}
          </button>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-6">

        {/* ── Tab: Negocio ─────────────────────────────────────────────── */}
        <div className={tab !== 'negocio' ? 'hidden' : 'flex flex-col gap-6'}>

          <Section title="Vertical">
            <p className="text-xs mb-3" style={{ color: 'var(--c-text-3)' }}>
              Determina qué secciones de la Oficina se muestran en el portal del cliente.
            </p>
            <div className="flex gap-2">
              {([
                { value: 'negocio',  label: 'Negocio',  desc: 'Empresas, comercios, servicios'          },
                { value: 'gobierno', label: 'Gobierno', desc: 'Municipios, dependencias, H. Cabildo'    },
              ] as const).map(opt => (
                <button key={opt.value} type="button" onClick={() => setVertical(opt.value)}
                  className="flex-1 flex flex-col gap-0.5 px-4 py-3 rounded-xl text-left transition-all"
                  style={{
                    background: vertical === opt.value ? 'rgba(108,59,255,0.15)' : 'var(--c-surface-2)',
                    border:     vertical === opt.value ? '2px solid rgba(108,59,255,0.5)' : '2px solid var(--c-border)',
                    color:      vertical === opt.value ? '#9B6DFF' : 'var(--c-text-2)',
                  }}>
                  <span className="text-sm font-semibold">{opt.label}</span>
                  <span className="text-xs opacity-70">{opt.desc}</span>
                </button>
              ))}
            </div>
          </Section>

          <Section title="Cliente">
            <Field label="Nombre del cliente"  name="client_name"  required defaultValue={agent.client_name} />
            <Field label="Email del cliente"   name="client_email" placeholder="cliente@email.com"
              defaultValue={agent.client_email ?? ''} />
            <Field label="Email del portal"    name="portal_email" placeholder="acceso@negocio.com"
              defaultValue={(agent as any).portal_email ?? ''}
              helper="Correo con el que el cliente inicia sesión en su portal. Todos los agentes con el mismo email comparten pool de minutos y tareas." />
          </Section>

          <Section title="Negocio">
            <Field label="Nombre del negocio" name="business_name" required defaultValue={agent.business_name} />
            <Field label="Descripción"        name="business_description" textarea defaultValue={agent.business_description} />
            <Field label="Dirección"          name="business_address" defaultValue={agent.business_address ?? ''} />

            <div>
              <label className="block text-xs mb-1.5" style={{ color: 'var(--c-text-2)' }}>Sitio web</label>
              <div className="flex gap-2">
                <input name="business_website" placeholder="https://negocio.com"
                  defaultValue={agent.business_website ?? ''}
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

            {/* Timezone */}
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
                          color:      timezone === tz.value ? '#9B6DFF' : 'rgba(255,255,255,0.8)',
                          background: timezone === tz.value ? 'rgba(108,59,255,0.15)' : 'transparent',
                        }}>
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
          </Section>
        </div>

        {/* ── Tab: Empleado ─────────────────────────────────────────────── */}
        <div className={tab !== 'empleado' ? 'hidden' : 'flex flex-col gap-6'}>

          <Section title="Identidad">
            <Field label="Nombre del empleado" name="agent_name"
              placeholder="Ej: Nia, Neo, Nova…"
              defaultValue={agent.agent_name ?? ''} />
          </Section>

          <Section title="Voz">
            <p className="text-xs mb-1" style={{ color: 'var(--c-text-2)' }}>
              Usa ▶ para escuchar una muestra antes de seleccionar.
            </p>
            <VoiceSelector selected={voiceId} onChange={setVoiceId} />
          </Section>

          <Section title="Rol">
            <p className="text-xs" style={{ color: 'var(--c-text-3)' }}>
              Define el segundo rol del empleado. La base de conocimiento del rol aparece abajo al escribirlo.
            </p>
            <input
              type="text"
              value={role}
              onChange={e => setRole(e.target.value)}
              placeholder="Ej: Procesador de facturas, Coordinador de juntas…"
              style={{ background: 'var(--c-input-bg)', border: '1px solid var(--c-input-border)', borderRadius: 8, padding: '10px 12px', color: 'var(--c-text)', fontSize: 14, width: '100%', outline: 'none' }}
            />
          </Section>

          <Section title="Base de conocimiento del negocio">
            <p className="text-xs leading-relaxed" style={{ color: 'var(--c-text-2)' }}>
              Servicios, productos, precios, horarios y preguntas frecuentes. Mientras más detallada, mejor responde el empleado.
            </p>
            <Field label="" name="knowledge_base" textarea rows={12}
              defaultValue={agent.knowledge_base ?? ''}
              placeholder={`SERVICIOS:\n- Ejemplo: $150\n\nFAQs:\n¿Aceptan tarjeta? Sí.`} />
          </Section>

          {role.trim() && (
            <Section title={`Base de conocimiento: ${role}`}>
              <p className="text-xs leading-relaxed" style={{ color: 'var(--c-text-2)' }}>
                Procedimientos y reglas específicas para que el empleado actúe como <strong>{role}</strong>.
              </p>
              <Field label="" name="role_knowledge_base" textarea rows={12}
                defaultValue={agent.role_knowledge_base ?? ''}
                placeholder={`PROCEDIMIENTO:\n1. Revisar el documento.\n2. Comparar contra criterios.\n3. Escalar si hay discrepancia.\n\nLÍMITES:\n- Hasta $10,000: aprobación automática.`} />
            </Section>
          )}
        </div>

        {/* ── Tab: Funciones ───────────────────────────────────────────── */}
        <div className={tab !== 'funciones' ? 'hidden' : 'flex flex-col gap-4'}>

          {/* Llamadas entrantes */}
          <CollapsibleSection id="entrantes" open={funcOpen.has('entrantes')} onToggle={() => toggleFunc('entrantes')}
            title={<span className="flex items-center gap-1.5"><Phone size={13} />Llamadas entrantes</span>}>
            <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--c-border)' }}>
              {INBOUND_FEATURES.map(({ key, desc }, i) => {
                const on = !!features[key];
                return (
                  <div key={key}
                    className="flex items-start gap-3 px-3 py-2.5 cursor-pointer select-none"
                    onClick={() => toggleFeature(key)}
                    style={{
                      background:   on ? 'rgba(108,59,255,0.04)' : 'var(--c-surface)',
                      borderBottom: i < INBOUND_FEATURES.length - 1 ? '1px solid var(--c-border)' : undefined,
                    }}>
                    <div className="w-9 h-5 rounded-full transition-colors relative flex-shrink-0 mt-0.5"
                      style={{ background: on ? '#6C3BFF' : 'var(--c-border-2)' }}>
                      <span className="absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all"
                        style={{ left: on ? '1.125rem' : '0.125rem' }} />
                    </div>
                    <div>
                      <p className="text-sm font-medium" style={{ color: on ? 'var(--c-text)' : 'var(--c-text-3)' }}>
                        {FEATURE_LABELS[key]}
                      </p>
                      <p className="text-xs mt-0.5" style={{ color: 'var(--c-text-3)' }}>{desc}</p>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex flex-col gap-3 pt-1">
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
          </CollapsibleSection>

          {/* Llamadas salientes */}
          <CollapsibleSection id="salientes" open={funcOpen.has('salientes')} onToggle={() => toggleFunc('salientes')}
            title={<span className="flex items-center gap-1.5"><PhoneOutgoing size={13} />Llamadas salientes</span>}>
            <FeatureToggleRow
              label="Activar llamadas salientes"
              desc="El cliente puede subir contactos y disparar campañas desde su portal"
              active={!!features.outbound_calls}
              onToggle={() => toggleFeature('outbound_calls')}
            />
          </CollapsibleSection>

          {/* Módulos */}
          <CollapsibleSection id="modulos" open={funcOpen.has('modulos')} onToggle={() => toggleFunc('modulos')}
            title={<span className="flex items-center gap-1.5"><Puzzle size={13} />Módulos</span>}>
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
          </CollapsibleSection>

          {/* Configuración avanzada */}
          <CollapsibleSection id="avanzado" open={funcOpen.has('avanzado')} onToggle={() => toggleFunc('avanzado')}
            title={<span className="flex items-center gap-1.5"><Settings2 size={13} />Configuración avanzada</span>}>
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
          </CollapsibleSection>

          {/* Horarios */}
          <CollapsibleSection id="horarios" open={funcOpen.has('horarios')} onToggle={() => toggleFunc('horarios')}
            title={<span className="flex items-center gap-1.5"><Clock size={13} />Horarios de atención</span>}>
            <div className="flex items-center justify-between p-3 rounded-xl cursor-pointer select-none"
              style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)' }}
              onClick={() => setHoursEnabled(v => !v)}>
              <div>
                <p className="text-sm" style={{ color: 'var(--c-text)' }}>Restringir horario</p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--c-text-3)' }}>El empleado solo contesta en el horario configurado</p>
              </div>
              <Toggle on={hoursEnabled} />
            </div>
            {hoursEnabled && (
              <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--c-border)' }}>
                {DAYS.map(({ key, label }, i) => {
                  const s: DaySchedule = businessHours[key] ?? { open: false };
                  return (
                    <div key={key} className="flex items-center gap-3 px-3 py-2"
                      style={{ background: 'var(--c-surface)', borderBottom: i < DAYS.length - 1 ? '1px solid var(--c-border)' : undefined }}>
                      <div className="flex items-center gap-2 w-28 flex-shrink-0 cursor-pointer select-none"
                        onClick={() => setBusinessHours(h => ({ ...h, [key]: { ...s, open: !s.open } }))}>
                        <Toggle on={s.open} size="sm" />
                        <span className="text-xs" style={{ color: s.open ? 'var(--c-text)' : 'var(--c-text-3)' }}>{label}</span>
                      </div>
                      {s.open ? (
                        <div className="flex items-center gap-2">
                          {(['from', 'to'] as const).map((field, fi) => (
                            <input key={field} type="text" maxLength={5} placeholder={field === 'from' ? '09:00' : '18:00'}
                              value={s[field] ?? (field === 'from' ? '09:00' : '18:00')}
                              onChange={e => {
                                let v = e.target.value.replace(/\D/g, '');
                                if (v.length >= 3) v = v.slice(0, 2) + ':' + v.slice(2, 4);
                                setBusinessHours(h => ({ ...h, [key]: { ...s, [field]: v } }));
                              }}
                              className="rounded px-2 py-1 text-xs outline-none w-14 text-center"
                              style={{ background: 'var(--c-input-bg)', border: '1px solid var(--c-input-border)', color: 'var(--c-text)' }} />
                          )).flatMap((el, fi) => fi === 0 ? [el, <span key="sep" className="text-xs" style={{ color: 'var(--c-text-3)' }}>–</span>] : [el])}
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
      {title && (
        <h2 className="text-xs font-semibold mb-3 tracking-widest uppercase flex items-center gap-1.5"
          style={{ color: 'var(--c-text-3)' }}>{title}</h2>
      )}
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

function FeatureToggleRow({ label, desc, active, onToggle }: {
  label: string; desc: string; active: boolean; onToggle: () => void;
}) {
  return (
    <div className="flex items-center justify-between p-3 rounded-xl cursor-pointer select-none"
      style={{
        background: active ? 'rgba(108,59,255,0.06)' : 'var(--c-surface)',
        border:     `1px solid ${active ? 'rgba(108,59,255,0.25)' : 'var(--c-border)'}`,
      }}
      onClick={onToggle}>
      <div className="flex-1 min-w-0 mr-3">
        <p className="text-sm font-medium" style={{ color: active ? 'var(--c-text)' : 'var(--c-text-3)' }}>{label}</p>
        <p className="text-xs mt-0.5" style={{ color: 'var(--c-text-3)' }}>{desc}</p>
      </div>
      <Toggle on={active} />
    </div>
  );
}

function Toggle({ on, size = 'md' }: { on: boolean; size?: 'md' | 'sm' }) {
  const w = size === 'sm' ? 28 : 36;
  const h = size === 'sm' ? 14 : 18;
  const d = size === 'sm' ? 10 : 14;
  return (
    <div className="rounded-full transition-colors relative flex-shrink-0"
      style={{ width: w, height: h, background: on ? '#6C3BFF' : 'var(--c-border-2)' }}>
      <span className="absolute rounded-full bg-white transition-all"
        style={{ width: d, height: d, top: 2, left: on ? w - d - 2 : 2 }} />
    </div>
  );
}

function Field({ label, name, required, placeholder, textarea, rows, defaultValue, helper }: {
  label: string; name: string; required?: boolean; placeholder?: string;
  textarea?: boolean; rows?: number; defaultValue?: string; helper?: string;
}) {
  const base: React.CSSProperties = {
    background: 'var(--c-input-bg)',
    border:     '1px solid var(--c-input-border)',
    borderRadius: 8,
    padding:    '10px 12px',
    color:      'var(--c-text)',
    fontSize:   14,
    width:      '100%',
    outline:    'none',
  };
  return (
    <div>
      {label && (
        <label className="block text-xs mb-1.5" style={{ color: 'var(--c-text-2)' }}>
          {label}{required && <span style={{ color: '#9B6DFF' }}> *</span>}
        </label>
      )}
      {textarea
        ? <textarea name={name} rows={rows ?? 3} placeholder={placeholder} defaultValue={defaultValue}
            style={{ ...base, resize: 'vertical' }} />
        : <input name={name} required={required} placeholder={placeholder} defaultValue={defaultValue}
            style={base} />
      }
      {helper && <p className="text-xs mt-1" style={{ color: 'var(--c-text-3)' }}>{helper}</p>}
    </div>
  );
}
