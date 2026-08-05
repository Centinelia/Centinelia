'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft, RefreshCw, Check, Phone, PhoneOutgoing,
  Puzzle, Settings2, Building2,
  Bot, Mic, Briefcase, BookOpen, Info,
} from 'lucide-react';
import VoiceSelector from '@/components/VoiceSelector';
import { FEATURE_LABELS } from '@/types/agent';
import type { AgentFeatures, VoiceAgent } from '@/types/agent';

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
  const [voiceId,       setVoiceId]       = useState<string | null>(agent.elevenlabs_voice_id ?? null);
  const [tab,           setTab]           = useState<Tab>(initialTab);
  const [role,          setRole]          = useState(agent.role ?? '');
  const [features,      setFeatures]      = useState<AgentFeatures>(agent.features);

  const toggleFeature = (key: keyof AgentFeatures) =>
    setFeatures(prev => ({ ...prev, [key]: !prev[key] }));

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSaving(true);
    const fd = new FormData(e.currentTarget);
    // Datos de cliente (contacto, vertical, timezone, horario, direccion,
    // sitio web, calendar) se editan desde /admin/clientes/[key]/editar.
    // Aqui solo los campos truly per-empleado.
    const body = {
      business_name:          fd.get('business_name'),
      business_description:   fd.get('business_description'),
      phone_number:           fd.get('phone_number'),
      knowledge_base:         fd.get('knowledge_base'),
      role_knowledge_base:    fd.get('role_knowledge_base'),
      agent_name:             fd.get('agent_name') || null,
      elevenlabs_voice_id:    voiceId ?? null,
      business_phone_display: fd.get('business_phone_display'),
      transfer_number:        fd.get('transfer_number'),
      transfer_whatsapp:      fd.get('transfer_whatsapp'),
      role,
      features,
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
          Cambia identidad, negocio y funciones del empleado.
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

          {/* Banner: datos de cliente viven en el editor de cliente */}
          <div
            className="rounded-lg px-4 py-3 flex items-start gap-2.5"
            style={{ background: '#F3F0FF', border: '1px solid #E9E1FF' }}
          >
            <Info size={14} className="flex-shrink-0 mt-0.5" style={{ color: '#6C3BFF' }} />
            <p className="text-[12px]" style={{ color: '#4C1D95' }}>
              Los datos del cliente (contacto, vertical, horario, ubicacion){' '}
              se editan desde{' '}
              <Link
                href={`/admin/clientes/${encodeURIComponent(agent.portal_email ?? agent.client_name)}/editar`}
                className="font-semibold underline hover:opacity-80"
                style={{ color: '#6C3BFF' }}
              >
                Editar cliente
              </Link>
              .
            </p>
          </div>

          <Card title="Negocio" icon={<Building2 size={13} />}
                subtitle="Datos especificos de esta empresa. Cada empleado puede representar una empresa distinta.">
            <Field label="Nombre del negocio" name="business_name" required defaultValue={agent.business_name} />
            <Field label="Descripcion" name="business_description" textarea defaultValue={agent.business_description} />

            <Field label="Numero Centinelia (Vapi)" name="phone_number"
              defaultValue={agent.phone_number}
              helper="Numero asignado en Vapi que recibe las llamadas entrantes." />
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
