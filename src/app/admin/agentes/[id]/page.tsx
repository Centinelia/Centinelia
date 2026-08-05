export const dynamic = 'force-dynamic';

import { createAdminClient } from '@/lib/supabase/admin';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft, Phone, Globe, Calendar, Clock, MapPin, Mail, User, Building2,
  Bot, Pencil, ExternalLink, Check, Circle, MessageSquare,
} from 'lucide-react';
import type { VoiceAgent, VoiceCall } from '@/types/agent';
import { FEATURE_LABELS } from '@/types/agent';
import type { AgentFeatures } from '@/types/agent';
import AgentActions from './AgentActions';
import DangerZone from './DangerZone';
import CallsSection from './CallsSection';
import CopyButton from './CopyButton';
import { MEERKAT_CONFIGS } from '@/lib/vapi/meerkat-configs';
import { AgentVersionTab } from '@/components/admin/AgentVersionTab';

interface Props {
  params: Promise<{ id: string }>;
}

// Features shown in the detail view (skip internal/meta flags)
const DISPLAY_FEATURES: (keyof AgentFeatures)[] = [
  'lead_qualification',
  'appointment_booking',
  'existing_client_support',
  'smart_transfer',
  'order_taking',
  'outbound_calls',
  'multilingual',
  'client_memory',
  'helpdesk',
  'of_encuestas',
  'civic_reports',
  'contract_drafts',
];

const FEATURE_DESCRIPTIONS: Partial<Record<keyof AgentFeatures, string>> = {
  lead_qualification:      'Captura nombre, contacto e interés del llamante',
  appointment_booking:     'Agenda, modifica y cancela citas',
  existing_client_support: 'Atiende dudas de clientes actuales',
  smart_transfer:          'Transfiere a humano y notifica por WhatsApp',
  order_taking:            'Toma y registra pedidos',
  outbound_calls:          'Campañas de llamadas salientes desde el portal',
  multilingual:            'Cambia a inglés automáticamente',
  client_memory:           'Recuerda historial por número',
  helpdesk:                'Mesa de ayuda IT activa',
  of_encuestas:            'Módulo de encuestas telefónicas',
  civic_reports:           'Módulo de reportes ciudadanos',
  contract_drafts:         'Redacción de borradores de contrato',
};

const DAY_LABEL: Record<string, string> = {
  monday:'Lunes', tuesday:'Martes', wednesday:'Miércoles',
  thursday:'Jueves', friday:'Viernes', saturday:'Sábado', sunday:'Domingo',
};

export default async function AgentDetailPage({ params }: Props) {
  const { id } = await params;
  const supabase = createAdminClient();

  const { data: agentData } = await supabase.from('voice_agents').select('*').eq('id', id).single();
  if (!agentData) notFound();

  const agent = agentData as VoiceAgent;

  const { data: callsData } = await supabase
    .from('voice_calls').select('*').eq('agent_id', id).order('created_at', { ascending: false }).limit(50);

  const calls = (callsData ?? []) as VoiceCall[];

  const isOpen = getIsOpenNow(agent.business_hours, agent.timezone ?? 'America/Monterrey');

  const meerkatId   = (agent.features as any)?.meerkat_role_id as string | null;
  const jornadaType = (agent as any).jornada_type as string | null;

  // Fetch active global version del meerkat del agente
  let activeGlobalVersion: number | null = null;
  if (meerkatId) {
    const { data } = await supabase
      .from('meerkat_active_versions')
      .select('active_version')
      .eq('meerkat_id', meerkatId)
      .maybeSingle();
    activeGlobalVersion = data?.active_version ?? null;
  }
  const availableVersions = meerkatId ? Object.keys(MEERKAT_CONFIGS[meerkatId] ?? {}).map(Number).sort((a, b) => a - b) : [];
  const pinnedVersion = (agent.features as any)?.pinned_meerkat_version ?? null;

  const activeFeatures   = DISPLAY_FEATURES.filter(k => !!(agent.features as any)[k]);
  const inactiveFeatures = DISPLAY_FEATURES.filter(k => !(agent.features as any)[k]);

  // Display name preference: agent_name (Nia, Noah…) fallback to meerkat or business
  const displayName  = agent.agent_name || cap(meerkatId ?? '') || agent.business_name;
  const meerkatLabel = meerkatId ? cap(meerkatId) : null;
  const showMeerkatPill = !!meerkatLabel && (!agent.agent_name || agent.agent_name.toLowerCase() !== meerkatId);

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
            {showMeerkatPill && (
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
          <Link
            href={`/admin/agentes/${agent.id}/editar`}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-medium transition-colors hover:bg-gray-50"
            style={{ background: '#FFFFFF', color: '#374151', border: '1px solid #E5E7EB' }}
          >
            <Pencil size={13} /> Editar
          </Link>
          <AgentActions agentId={agent.id} active={agent.active} />
        </div>
      </div>

      {/* Grid 2 cols */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Left column */}
        <div className="lg:col-span-2 flex flex-col gap-6">

          {/* Empresa & contacto */}
          <Card title="Empresa y contacto" icon={<Building2 size={13} />}>
            <FieldRow icon={<Building2 size={13} />} label="Empresa" value={agent.business_name} />
            {agent.client_name && (
              <FieldRow icon={<User size={13} />} label="Contacto" value={agent.client_name} />
            )}
            {(agent as any).client_email && (
              <FieldRow icon={<Mail size={13} />} label="Email del cliente" value={(agent as any).client_email} />
            )}
            {agent.business_description && (
              <FieldRow icon={<MessageSquare size={13} />} label="Descripción" value={agent.business_description} multiline />
            )}
            {agent.business_address && (
              <FieldRow icon={<MapPin size={13} />} label="Dirección" value={agent.business_address} />
            )}
            {agent.calendar_url && (
              <FieldRow icon={<Globe size={13} />} label="Calendario" value={agent.calendar_url} link />
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
              {agent.business_phone_display && (
                <MetricRow label="Teléfono del negocio" value={agent.business_phone_display} icon={<Phone size={12} />} copyable />
              )}
              {agent.phone_number && (
                <MetricRow label="Número Centinelia" value={agent.phone_number} icon={<Phone size={12} />} copyable />
              )}
              {agent.timezone && (
                <MetricRow label="Zona horaria" value={agent.timezone} icon={<Calendar size={12} />} />
              )}
            </div>
          </Card>

          {/* Features */}
          <Card title="Funciones" icon={<Check size={13} />}>
            {activeFeatures.length > 0 ? (
              <div className="rounded-lg overflow-hidden" style={{ border: '1px solid #E5E7EB' }}>
                {activeFeatures.map((key, i) => (
                  <div
                    key={key}
                    className="flex items-start gap-3 px-4 py-3"
                    style={{
                      background: '#FFFFFF',
                      borderTop:  i > 0 ? '1px solid #F3F4F6' : undefined,
                    }}
                  >
                    <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: '#F3F0FF' }}>
                      <Check size={13} style={{ color: '#7C3AED' }} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[13px] font-medium" style={{ color: '#111827' }}>{FEATURE_LABELS[key]}</p>
                      {FEATURE_DESCRIPTIONS[key] && (
                        <p className="text-[12px] mt-0.5" style={{ color: '#6B7280' }}>{FEATURE_DESCRIPTIONS[key]}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-[13px]" style={{ color: '#9CA3AF' }}>Sin funciones activas</p>
            )}
            {inactiveFeatures.length > 0 && (
              <div className="mt-4">
                <p className="text-[11px] uppercase tracking-wider font-medium mb-2" style={{ color: '#9CA3AF' }}>
                  Desactivadas
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {inactiveFeatures.map(key => (
                    <span
                      key={key}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[12px]"
                      style={{ background: '#F9FAFB', color: '#6B7280', border: '1px solid #E5E7EB' }}
                    >
                      <Circle size={9} style={{ color: '#9CA3AF' }} />
                      {FEATURE_LABELS[key]}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </Card>

          {/* Recent calls */}
          <CallsSection calls={calls} timezone={agent.timezone ?? 'America/Monterrey'} agentName={agent.agent_name} />

          {/* Version pin controls */}
          <AgentVersionTab
            agentId={agent.id}
            meerkatId={meerkatId}
            availableVersions={availableVersions}
            activeGlobalVersion={activeGlobalVersion}
            pinnedVersion={pinnedVersion}
          />

          {/* Zona peligrosa: eliminar empleado */}
          <DangerZone
            agentId={agent.id}
            displayName={agent.agent_name || agent.business_name}
          />
        </div>

        {/* Right column */}
        <div className="flex flex-col gap-6">

          {/* Portal + Vapi */}
          {(agent.portal_token || agent.vapi_agent_id || agent.portal_email) && (
            <Card title="Acceso" icon={<ExternalLink size={13} />}>
              {agent.portal_email && (
                <div className="pb-3">
                  <p className="text-[11px] uppercase tracking-wider font-medium mb-1" style={{ color: '#9CA3AF' }}>
                    Email del portal
                  </p>
                  <p className="text-[13px] break-all" style={{ color: '#111827' }}>{agent.portal_email}</p>
                </div>
              )}
              {agent.portal_token && (
                <div style={agent.portal_email ? { borderTop: '1px solid #F3F4F6', paddingTop: 12 } : {}}>
                  <p className="text-[11px] uppercase tracking-wider font-medium mb-2" style={{ color: '#9CA3AF' }}>
                    Portal del cliente
                  </p>
                  <div className="flex items-center gap-2">
                    <a
                      href={`/portal/${agent.portal_token}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-[13px] font-medium flex-1 hover:underline"
                      style={{ color: '#6C3BFF' }}
                    >
                      <ExternalLink size={12} /> Ver portal
                    </a>
                    <CopyButton text={`${process.env.NEXT_PUBLIC_APP_URL ?? ''}/portal/${agent.portal_token}`} />
                  </div>
                  <div className="text-[11px] font-mono mt-1.5 break-all" style={{ color: '#9CA3AF' }}>
                    /portal/{agent.portal_token?.slice(0, 8)}…
                  </div>
                </div>
              )}
              {agent.vapi_agent_id && (
                <div style={{ borderTop: '1px solid #F3F4F6', paddingTop: 12, marginTop: 12 }}>
                  <p className="text-[11px] uppercase tracking-wider font-medium mb-1" style={{ color: '#9CA3AF' }}>
                    Vapi Agent ID
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
          )}

          {/* Business hours */}
          <Card title="Horario" icon={<Clock size={13} />}>
            {agent.business_hours ? (
              <div className="space-y-1.5">
                {(['monday','tuesday','wednesday','thursday','friday','saturday','sunday'] as const).map(day => {
                  const s = agent.business_hours?.[day];
                  return (
                    <div key={day} className="flex items-center justify-between text-[13px]">
                      <span style={{ color: '#6B7280' }}>{DAY_LABEL[day]}</span>
                      {s?.open
                        ? <span className="font-medium tabular-nums" style={{ color: '#111827' }}>{s.from} : {s.to}</span>
                        : <span style={{ color: '#9CA3AF' }}>Cerrado</span>}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div
                className="inline-flex items-center gap-1.5 text-[13px] px-2.5 py-1 rounded-md font-medium"
                style={{ background: '#ECFDF5', color: '#047857', border: '1px solid #A7F3D0' }}
              >
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: '#10B981' }} />
                24/7 sin restricción
              </div>
            )}
          </Card>

          {/* Transfer */}
          {(agent.transfer_whatsapp || agent.transfer_number) && (
            <Card title="Transferencia" icon={<Phone size={13} />}>
              {agent.transfer_whatsapp && (
                <div className="flex items-center justify-between text-[13px] py-1">
                  <span style={{ color: '#6B7280' }}>WhatsApp</span>
                  <span className="font-medium tabular-nums" style={{ color: '#111827' }}>{agent.transfer_whatsapp}</span>
                </div>
              )}
              {agent.transfer_number && (
                <div className="flex items-center justify-between text-[13px] py-1">
                  <span style={{ color: '#6B7280' }}>Teléfono</span>
                  <span className="font-medium tabular-nums" style={{ color: '#111827' }}>{agent.transfer_number}</span>
                </div>
              )}
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function cap(s: string): string {
  if (!s) return '';
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function getIsOpenNow(hours: any, timezone: string): boolean | null {
  if (!hours) return null;
  try {
    const now   = new Date();
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone, weekday: 'long', hour: 'numeric', minute: 'numeric', hour12: false,
    }).formatToParts(now);
    const weekday = parts.find(p => p.type === 'weekday')?.value?.toLowerCase() ?? '';
    const hour    = parseInt(parts.find(p => p.type === 'hour')?.value ?? '0', 10);
    const minute  = parseInt(parts.find(p => p.type === 'minute')?.value ?? '0', 10);
    const current = hour * 60 + minute;
    const schedule = hours[weekday];
    if (!schedule?.open || !schedule.from || !schedule.to) return false;
    const [fh, fm] = (schedule.from as string).split(':').map(Number);
    const [th, tm] = (schedule.to as string).split(':').map(Number);
    return current >= fh * 60 + fm && current < th * 60 + tm;
  } catch { return null; }
}

// ── UI primitives ─────────────────────────────────────────────────────────────

function Card({ title, icon, children }: { title: string; icon?: React.ReactNode; children: React.ReactNode }) {
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
      </div>
      <div className="px-5 py-4">
        {children}
      </div>
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

// Paleta oficial de jornadas (fuente de verdad Nazre):
//   tareas    → verde
//   minutos   → celeste
//   combinada → morado
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

function FieldRow({ icon, label, value, link, multiline }: {
  icon?: React.ReactNode; label: string; value: string; link?: boolean; multiline?: boolean;
}) {
  if (!value) return null;
  return (
    <div className="flex flex-col sm:flex-row sm:gap-4 py-2.5" style={{ borderBottom: '1px solid #F3F4F6' }}>
      <span className="text-[12px] sm:w-36 sm:flex-shrink-0 sm:pt-0.5 mb-0.5 sm:mb-0 flex items-center gap-1.5" style={{ color: '#6B7280' }}>
        {icon}
        {label}
      </span>
      <span className={`text-[13px] flex-1 min-w-0 ${multiline ? '' : 'truncate'}`} style={{ color: '#111827' }}>
        {link
          ? <a href={value} target="_blank" rel="noopener noreferrer" className="hover:underline break-all" style={{ color: '#6C3BFF' }}>{value}</a>
          : <span className="break-words">{value}</span>}
      </span>
    </div>
  );
}

function MetricRow({ label, value, icon, copyable }: {
  label: string; value: string; icon?: React.ReactNode; copyable?: boolean;
}) {
  if (!value) return null;
  return (
    <div className="rounded-lg px-3 py-2.5" style={{ background: '#F9FAFB', border: '1px solid #E5E7EB' }}>
      <div className="text-[11px] uppercase tracking-wider font-medium mb-1" style={{ color: '#9CA3AF' }}>{label}</div>
      <div className="flex items-center gap-1.5 min-w-0">
        {icon && <span style={{ color: '#6B7280' }}>{icon}</span>}
        <span className="text-[13px] truncate flex-1 tabular-nums" style={{ color: '#111827' }}>{value}</span>
        {copyable && <CopyButton text={value} />}
      </div>
    </div>
  );
}
