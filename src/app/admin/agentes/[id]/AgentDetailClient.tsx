'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft, Phone, PhoneOutgoing, Clock, Bot, Check, RefreshCw,
  Puzzle, Settings2, Mic, Briefcase, BookOpen,
} from 'lucide-react';
import type { VoiceAgent, AgentFeatures } from '@/types/agent';
import VoiceSelector from '@/components/VoiceSelector';
import AgentActions from './AgentActions';
import DangerZone from './DangerZone';
import CopyButton from './CopyButton';
import { AgentVersionTab } from '@/components/admin/AgentVersionTab';

// ── Feature groups (preservados de EditAgentForm) ─────────────────────────────

// INBOUND_FEATURES eliminado: eran capacidades baked-in del meerkat
// (lead_qualification, appointment_booking, etc.), no settings toggleables.

// MODULE_FEATURES: solo aplican al meerkat 'custom' (ensamble manual).
const MODULE_FEATURES: { key: keyof AgentFeatures; label: string; desc: string }[] = [
  { key: 'helpdesk',        label: 'Mesa de ayuda IT',      desc: 'Activa tools de tickets, incidentes y directorio' },
  { key: 'of_encuestas',    label: 'Encuestas telefónicas', desc: 'El empleado puede aplicar encuestas en llamada' },
  { key: 'civic_reports',   label: 'Reportes ciudadanos',   desc: 'Módulo de reportes para verticales de gobierno' },
  { key: 'contract_drafts', label: 'Contratos',             desc: 'El empleado puede redactar borradores de contrato' },
];

// PROMPT_FLAGS: comportamientos reales del prompt en llamada. Excluye
// is_coordinator porque eso lo define el meerkat (Nox/Niva), no un toggle.
const PROMPT_FLAGS: { key: keyof AgentFeatures; label: string; desc: string }[] = [
  { key: 'skip_aup',              label: 'Omitir aviso de privacidad', desc: 'No lee el AUP al iniciar la llamada' },
  { key: 'skip_recording_notice', label: 'Omitir aviso de grabación',  desc: 'No menciona que la llamada se graba' },
  { key: 'lite_prompt',           label: 'Prompt ligero',              desc: 'System prompt reducido, menor latencia, menos contexto' },
];

// Fuente de verdad en sync.ts: NON_VOICE_ROLES = ['nox', 'niva'].
const NON_VOICE_ROLES = new Set(['nox', 'niva']);

function isNonVoiceRole(agent: VoiceAgent): boolean {
  const roleId = (agent.features as { meerkat_role_id?: string })?.meerkat_role_id;
  const isCoord = !!(agent.features as { is_coordinator?: boolean })?.is_coordinator;
  return isCoord || (!!roleId && NON_VOICE_ROLES.has(roleId));
}

// Solo el meerkat 'custom' permite ensamblar módulos manualmente.
// Los meerkats predefinidos (Nia, Noah, Naia, etc.) tienen capacidades fijas
// baked-in en su rol/prompt/tools; toggle-ar módulos no les daría las
// herramientas subyacentes y confunde al admin.
function isCustomMeerkat(agent: VoiceAgent): boolean {
  const roleId = (agent.features as { meerkat_role_id?: string })?.meerkat_role_id;
  return roleId === 'custom';
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  agent:                VoiceAgent;
  meerkatId:            string | null;
  meerkatLabel:         string | null;
  showMeerkatPill:      boolean;
  displayName:          string;
  isOpen:               boolean | null;
  jornadaType:          string | null;
  availableVersions:    number[];
  activeGlobalVersion:  number | null;
  pinnedVersion:        number | null;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function AgentDetailClient({
  agent, meerkatId, meerkatLabel, showMeerkatPill, displayName,
  isOpen, jornadaType, availableVersions, activeGlobalVersion, pinnedVersion,
}: Props) {
  const router = useRouter();

  // Initial state snapshot (para dirty tracking)
  const initial = useMemo(() => ({
    agent_name:          agent.agent_name ?? '',
    elevenlabs_voice_id: agent.elevenlabs_voice_id ?? null,
    role:                agent.role ?? '',
    knowledge_base:      agent.knowledge_base ?? '',
    role_knowledge_base: agent.role_knowledge_base ?? '',
    phone_number:        agent.phone_number ?? '',
    transfer_number:     agent.transfer_number ?? '',
    transfer_whatsapp:   agent.transfer_whatsapp ?? '',
    features:            JSON.stringify(agent.features),
  }), [agent]);

  const [agentName,        setAgentName]        = useState(initial.agent_name);
  const [voiceId,          setVoiceId]          = useState<string | null>(initial.elevenlabs_voice_id);
  const [role,             setRole]             = useState(initial.role);
  const [knowledgeBase,    setKnowledgeBase]    = useState(initial.knowledge_base);
  const [roleKnowledge,    setRoleKnowledge]    = useState(initial.role_knowledge_base);
  const [phoneNumber,      setPhoneNumber]      = useState(initial.phone_number);
  const [transferNumber,   setTransferNumber]   = useState(initial.transfer_number);
  const [transferWhatsapp, setTransferWhatsapp] = useState(initial.transfer_whatsapp);
  const [features,         setFeatures]         = useState<AgentFeatures>(agent.features);

  const [saving,   setSaving]   = useState(false);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  const toggleFeature = (key: keyof AgentFeatures) =>
    setFeatures(prev => ({ ...prev, [key]: !prev[key] }));

  // Dirty tracking
  const dirty =
    agentName            !== initial.agent_name          ||
    voiceId              !== initial.elevenlabs_voice_id ||
    role                 !== initial.role                ||
    knowledgeBase        !== initial.knowledge_base      ||
    roleKnowledge        !== initial.role_knowledge_base ||
    phoneNumber          !== initial.phone_number        ||
    transferNumber       !== initial.transfer_number     ||
    transferWhatsapp     !== initial.transfer_whatsapp   ||
    JSON.stringify(features) !== initial.features;

  const nonVoice = isNonVoiceRole(agent);

  const handleSave = async () => {
    setSaving(true);
    setSavedMsg(null);
    const body = {
      phone_number:        phoneNumber || null,
      knowledge_base:      knowledgeBase,
      role_knowledge_base: roleKnowledge,
      agent_name:          agentName || null,
      elevenlabs_voice_id: nonVoice ? null : (voiceId ?? null),
      transfer_number:     transferNumber || null,
      transfer_whatsapp:   transferWhatsapp || null,
      role,
      features,
    };

    const res = await fetch(`/api/admin/agentes/${agent.id}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
    });

    setSaving(false);
    if (res.ok) {
      setSavedMsg('Cambios guardados');
      router.refresh();
      setTimeout(() => setSavedMsg(null), 2500);
    } else {
      const { error } = await res.json().catch(() => ({ error: null }));
      setSavedMsg(`Error: ${error ?? 'no se pudo guardar'}`);
    }
  };

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto space-y-6">

      {/* Back link */}
      <div>
        <Link
          href="/admin/clientes"
          className="inline-flex items-center gap-1.5 text-[13px] font-medium transition-colors hover:opacity-80"
          style={{ color: '#6B7280' }}
        >
          <ArrowLeft size={14} /> Clientes
        </Link>
      </div>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-[24px] font-semibold tracking-tight truncate" style={{ color: '#111827' }}>
              {displayName}
            </h1>
            <StatusPill active={agent.active} />
            {isOpen !== null && <OpenPill open={isOpen} />}
            {jornadaType && <JornadaPill jornada={jornadaType} />}
          </div>
          <div className="flex items-center gap-2 flex-wrap mt-1.5">
            {showMeerkatPill && meerkatLabel && (
              <span
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[12px] font-medium"
                style={{ background: '#F3F0FF', color: '#7C3AED', border: '1px solid #E9E1FF' }}
              >
                <Bot size={11} /> Meerkat: {meerkatLabel}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <AgentActions agentId={agent.id} active={agent.active} />
        </div>
      </div>

      {/* Grid 2 cols */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Left column: identidad, rol, KB, funciones, llamadas, versiones, danger */}
        <div className="lg:col-span-2 flex flex-col gap-6">

          {/* Identidad */}
          <Card title="Identidad" icon={<Bot size={13} />}>
            <FieldInput
              label="Nombre del empleado"
              value={agentName}
              onChange={setAgentName}
              placeholder="Ej: Nia, Neo, Nova"
            />
          </Card>

          {/* Voz (solo si no es coordinador) */}
          {!nonVoice && (
            <Card
              title="Voz"
              icon={<Mic size={13} />}
              subtitle="Usa el icono de reproducir para escuchar una muestra antes de seleccionar."
            >
              <VoiceSelector selected={voiceId} onChange={setVoiceId} />
            </Card>
          )}

          {/* Rol */}
          <Card
            title="Rol"
            icon={<Briefcase size={13} />}
            subtitle="Define el segundo rol del empleado. La base de conocimiento del rol aparece abajo al escribirlo."
          >
            <FieldInput
              label="Rol"
              value={role}
              onChange={setRole}
              placeholder="Ej: Procesador de facturas, Coordinador de juntas"
            />
          </Card>

          {/* Base de conocimiento general */}
          <Card
            title="Base de conocimiento del negocio"
            icon={<BookOpen size={13} />}
            subtitle="Servicios, productos, precios, horarios y preguntas frecuentes. Mientras mas detallada, mejor responde el empleado."
          >
            <FieldTextarea
              value={knowledgeBase}
              onChange={setKnowledgeBase}
              rows={12}
              placeholder={'SERVICIOS:\n- Ejemplo: $150\n\nFAQs:\n Aceptan tarjeta? Si.'}
            />
          </Card>

          {/* Base de conocimiento del rol (solo si hay rol) */}
          {role.trim() && (
            <Card
              title={`Base de conocimiento: ${role}`}
              icon={<BookOpen size={13} />}
              subtitle={`Procedimientos y reglas especificas para que el empleado actue como ${role}.`}
            >
              <FieldTextarea
                value={roleKnowledge}
                onChange={setRoleKnowledge}
                rows={12}
                placeholder={'PROCEDIMIENTO:\n1. Revisar el documento.\n2. Comparar contra criterios.\n3. Escalar si hay discrepancia.\n\nLIMITES:\n- Hasta $10,000: aprobacion automatica.'}
              />
            </Card>
          )}

          {/* Transferencia: destinos donde escalar/notificar cuando algo requiere humano */}
          <Card title="Transferencia" icon={<Phone size={13} />}>
            <FieldInput
              label="Número de transferencia a humano"
              value={transferNumber}
              onChange={setTransferNumber}
              helper="Si el llamante pide hablar con una persona, el empleado transfiere aquí."
            />
            <FieldInput
              label="WhatsApp para notificaciones"
              value={transferWhatsapp}
              onChange={setTransferWhatsapp}
              helper="Recibe avisos de leads, citas y pedidos en este número."
            />
          </Card>

          {/* Llamadas salientes */}
          <Card title="Llamadas salientes" icon={<PhoneOutgoing size={13} />}>
            <FeatureToggleRow
              label="Activar llamadas salientes"
              desc="El empleado puede hacer llamadas si así fuera necesario para la operación de la organización"
              active={!!features.outbound_calls}
              onToggle={() => toggleFeature('outbound_calls')}
            />
          </Card>

          {/* Modulos: solo para meerkat custom. Los predefinidos tienen tools fijas. */}
          {isCustomMeerkat(agent) && (
            <Card title="Módulos" icon={<Puzzle size={13} />}
                  subtitle="Capacidades opcionales del empleado personalizado. Activa las que aplique a su rol.">
              <div className="flex flex-col gap-2">
                {MODULE_FEATURES.map(({ key, label, desc }) => (
                  <FeatureToggleRow
                    key={key}
                    label={label}
                    desc={desc}
                    active={!!(features as unknown as Record<string, unknown>)[key]}
                    onToggle={() => toggleFeature(key)}
                  />
                ))}
              </div>
            </Card>
          )}

          {/* Configuracion avanzada */}
          <Card title="Configuracion avanzada" icon={<Settings2 size={13} />}>
            <div className="flex flex-col gap-2">
              {PROMPT_FLAGS.map(({ key, label, desc }) => (
                <FeatureToggleRow
                  key={key}
                  label={label}
                  desc={desc}
                  active={!!(features as unknown as Record<string, unknown>)[key]}
                  onToggle={() => toggleFeature(key)}
                />
              ))}
            </div>
          </Card>

          {/* Zona peligrosa */}
          <DangerZone
            agentId={agent.id}
            displayName={agent.agent_name || agent.business_name}
          />
        </div>

        {/* Right column: Versión + Vapi */}
        <div className="flex flex-col gap-6">

          {/* Version pin controls */}
          <AgentVersionTab
            agentId={agent.id}
            meerkatId={meerkatId}
            availableVersions={availableVersions}
            activeGlobalVersion={activeGlobalVersion}
            pinnedVersion={pinnedVersion}
          />

          <Card
            title="Vapi"
            icon={<Phone size={13} />}
            subtitle="Numero asignado en Vapi que recibe las llamadas entrantes de este empleado."
          >
            <FieldInput
              label="Numero entrante"
              value={phoneNumber}
              onChange={setPhoneNumber}
              placeholder="+52..."
              helper="El resto de la info del negocio (nombre, descripcion, horario) se administra desde el editor de cliente."
            />
            {agent.vapi_agent_id && (
              <div style={{ borderTop: '1px solid #F3F4F6', paddingTop: 12, marginTop: 6 }}>
                <p className="text-[11px] uppercase tracking-wider font-medium mb-1" style={{ color: '#9CA3AF' }}>
                  Agent ID
                </p>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-mono break-all flex-1" style={{ color: '#374151' }}>
                    {agent.vapi_agent_id}
                  </span>
                  <CopyButton text={agent.vapi_agent_id} />
                </div>
              </div>
            )}
          </Card>

        </div>
      </div>

      {/* Footer con Guardar cambios (no sticky). Oculto cuando no hay dirty. */}
      {dirty && (
        <div
          className="flex items-center justify-end gap-2 pt-4 mt-2"
          style={{ borderTop: '1px solid #E5E7EB' }}
        >
          {savedMsg && (
            <span
              className="text-[12px] mr-2"
              style={{ color: savedMsg.startsWith('Error') ? '#EF4444' : '#10B981' }}
            >
              {savedMsg}
            </span>
          )}
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-[13px] font-medium transition-opacity"
            style={{ background: '#6C3BFF', color: '#FFFFFF', opacity: saving ? 0.6 : 1 }}
          >
            {saving ? (
              <>
                <RefreshCw size={13} className="animate-spin" /> Guardando
              </>
            ) : (
              <>
                <Check size={13} /> Guardar cambios
              </>
            )}
          </button>
        </div>
      )}

      {/* Mensaje de guardado exitoso cuando no hay dirty (ej. justo despues de guardar) */}
      {!dirty && savedMsg && (
        <div
          className="flex items-center justify-end pt-4 mt-2"
          style={{ borderTop: '1px solid #E5E7EB' }}
        >
          <span
            className="text-[12px]"
            style={{ color: savedMsg.startsWith('Error') ? '#EF4444' : '#10B981' }}
          >
            {savedMsg}
          </span>
        </div>
      )}
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

function FieldInput({ label, value, onChange, placeholder, helper }: {
  label?: string; value: string; onChange: (v: string) => void;
  placeholder?: string; helper?: string;
}) {
  return (
    <div>
      {label && (
        <label className="block text-[12px] font-medium mb-1.5" style={{ color: '#374151' }}>
          {label}
        </label>
      )}
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full text-[13px] px-3 py-2 rounded-lg outline-none transition-colors focus:border-[#6C3BFF]"
        style={{ background: '#FFFFFF', border: '1px solid #E5E7EB', color: '#111827' }}
      />
      {helper && <p className="text-[12px] mt-1" style={{ color: '#6B7280' }}>{helper}</p>}
    </div>
  );
}

function FieldTextarea({ value, onChange, rows, placeholder }: {
  value: string; onChange: (v: string) => void; rows?: number; placeholder?: string;
}) {
  return (
    <textarea
      value={value}
      onChange={e => onChange(e.target.value)}
      rows={rows ?? 3}
      placeholder={placeholder}
      className="w-full text-[13px] px-3 py-2 rounded-lg outline-none transition-colors focus:border-[#6C3BFF]"
      style={{
        background: '#FFFFFF',
        border:     '1px solid #E5E7EB',
        color:      '#111827',
        resize:     'vertical',
        fontFamily: 'inherit',
      }}
    />
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

function StatusPill({ active }: { active: boolean }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[12px] font-medium"
      style={{
        background: active ? '#ECFDF5' : '#FEF2F2',
        color:      active ? '#047857' : '#B91C1C',
        border:     `1px solid ${active ? '#A7F3D0' : '#FECACA'}`,
      }}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: active ? '#10B981' : '#EF4444' }} />
      {active ? 'Activo' : 'Pausado'}
    </span>
  );
}

function OpenPill({ open }: { open: boolean }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[12px] font-medium"
      style={{
        background: open ? '#EFF6FF' : '#F9FAFB',
        color:      open ? '#1D4ED8' : '#6B7280',
        border:     `1px solid ${open ? '#BFDBFE' : '#E5E7EB'}`,
      }}
    >
      <Clock size={10} />
      {open ? 'Abierto ahora' : 'Cerrado ahora'}
    </span>
  );
}

const JORNADA_COLORS: Record<string, { bg: string; fg: string; border: string; label: string }> = {
  tareas:    { bg: '#ECFDF5', fg: '#047857', border: '#A7F3D0', label: 'Tareas'    },
  minutos:   { bg: '#ECFEFF', fg: '#0E7490', border: '#A5F3FC', label: 'Minutos'   },
  combinada: { bg: '#F3F0FF', fg: '#6C3BFF', border: '#DDD6FE', label: 'Combinada' },
};

function JornadaPill({ jornada }: { jornada: string }) {
  const c = JORNADA_COLORS[jornada] ?? { bg: '#F3F4F6', fg: '#4B5563', border: '#E5E7EB', label: jornada };
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[12px] font-medium"
      style={{ background: c.bg, color: c.fg, border: `1px solid ${c.border}` }}
    >
      Jornada: {c.label}
    </span>
  );
}
