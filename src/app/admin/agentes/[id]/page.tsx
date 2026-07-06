export const dynamic = 'force-dynamic';

import { createAdminClient } from '@/lib/supabase/admin';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Phone, Globe, Calendar, CheckCircle, XCircle, Pencil, ExternalLink, Check, Lock } from 'lucide-react';
import type { VoiceAgent, VoiceCall } from '@/types/agent';
import { PLAN_LABELS, FEATURE_LABELS, PLAN_FEATURES } from '@/types/agent';
import type { AgentFeatures } from '@/types/agent';
import AgentActions from './AgentActions';
import CallsSection from './CallsSection';
import CopyButton from './CopyButton';
import MinutesAdjuster from './MinutesAdjuster';

interface Props {
  params: Promise<{ id: string }>;
}

const PLAN_COLORS: Record<string, string> = {
  comercial: '#6C3BFF', pro: '#a855f7',
};

const FEATURE_DESCRIPTIONS: Record<keyof AgentFeatures, string> = {
  receptionist:            'Contesta llamadas, da información del negocio y horarios',
  lead_qualification:      'Pregunta por nombre, contacto e interés del llamante',
  appointment_booking:     'Agenda citas o reservaciones y las registra',
  existing_client_support: 'Atiende a clientes que ya conocen el negocio',
  smart_transfer:          'Transfiere la llamada a un humano cuando es necesario',
  order_taking:            'Toma pedidos de productos o platillos',
  multilingual:            'Responde en inglés además de español',
  client_memory:           'Recuerda información de llamadas anteriores del mismo número',
  whatsapp_escalation:     'Envía un WhatsApp al dueño si el agente no puede resolver',
  outbound_calls:          'Permite disparar llamadas salientes desde el portal del cliente',
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

  const planColor = PLAN_COLORS[agent.plan] ?? '#6b7280';
  const isOpen = getIsOpenNow(agent.business_hours, agent.timezone ?? 'America/Monterrey');

  const featureKeys = Object.keys(agent.features) as (keyof AgentFeatures)[];
  const baseKeys    = featureKeys.filter(k => PLAN_FEATURES.comercial[k]);
  const proKeys     = featureKeys.filter(k => !PLAN_FEATURES.comercial[k]);

  return (
    <div className="p-4 md:p-8 max-w-4xl">
      {/* Header */}
      <div className="mb-6">
        {/* Row 1: back + title + badges */}
        <div className="flex items-start gap-3">
          <Link href="/admin/agentes"
            className="p-2 rounded-lg hover:bg-[var(--c-surface-2)] transition-colors flex-shrink-0 mt-0.5"
            style={{ color: 'var(--c-text-3)' }}>
            <ArrowLeft size={18} />
          </Link>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-lg sm:text-2xl font-bold truncate" style={{ color: 'var(--c-text)' }}>
                {agent.business_name}
              </h1>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold flex-shrink-0"
                style={{ background: `${planColor}22`, color: planColor, border: `1px solid ${planColor}44` }}>
                {PLAN_LABELS[agent.plan]}
              </span>
              {agent.active
                ? <CheckCircle size={15} color="#22c55e" className="flex-shrink-0" />
                : <XCircle size={15} color="#ef4444" className="flex-shrink-0" />}
              {isOpen !== null && (
                <span className="text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0"
                  style={{
                    background: isOpen ? 'rgba(34,197,94,0.1)' : 'rgba(107,114,128,0.1)',
                    color: isOpen ? '#22c55e' : '#9ca3af',
                    border: `1px solid ${isOpen ? 'rgba(34,197,94,0.2)' : 'rgba(107,114,128,0.2)'}`,
                  }}>
                  {isOpen ? 'Abierto' : 'Cerrado'}
                </span>
              )}
            </div>
            <p className="text-sm mt-0.5" style={{ color: 'var(--c-text-2)' }}>{agent.client_name}</p>
            {/* Actions — mobile: below pills, right-aligned to sit under "Cerrado" */}
            <div className="sm:hidden flex items-center justify-end gap-2 mt-2 pr-4">
              <Link href={`/admin/agentes/${agent.id}/editar`}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-opacity hover:opacity-80"
                style={{ background: 'var(--c-surface-2)', color: 'var(--c-text-2)', border: '1px solid var(--c-border)' }}>
                <Pencil size={13} /> Editar
              </Link>
              <AgentActions agentId={agent.id} active={agent.active} />
            </div>
          </div>
          {/* Actions — desktop: right side */}
          <div className="hidden sm:flex items-center gap-2 flex-shrink-0">
            <Link href={`/admin/agentes/${agent.id}/editar`}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-opacity hover:opacity-80"
              style={{ background: 'var(--c-surface-2)', color: 'var(--c-text-2)', border: '1px solid var(--c-border)' }}>
              <Pencil size={13} /> Editar
            </Link>
            <AgentActions agentId={agent.id} active={agent.active} />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column */}
        <div className="lg:col-span-2 flex flex-col gap-6">

          {/* Business info */}
          <Card title="Información del negocio">
            {agent.business_description && (
              <InfoRow label="Descripción" value={agent.business_description} />
            )}
            {agent.business_address && (
              <InfoRow label="Dirección" value={agent.business_address} />
            )}
            {agent.calendar_url && (
              <InfoRow label="Calendario" value={agent.calendar_url} icon={<Globe size={13} />} link />
            )}
            <div className="flex flex-col sm:flex-row gap-0">
              {agent.business_phone_display && (
                <InfoRowCompact label="Teléfono del negocio" value={agent.business_phone_display} icon={<Phone size={12} />} copyable />
              )}
              {agent.phone_number && (
                <InfoRowCompact label="Número del agente" value={agent.phone_number} icon={<Phone size={12} />} copyable />
              )}
              <InfoRowCompact label="Zona horaria" value={agent.timezone} icon={<Calendar size={12} />} />
            </div>
          </Card>

          {/* Features */}
          <Card title="Funcionalidades">
            <div className="flex flex-col gap-4">
              {/* Base */}
              <div>
                <p className="text-[10px] font-semibold tracking-widest uppercase mb-2" style={{ color: 'var(--c-text-4)' }}>
                  Siempre incluidas
                </p>
                <div className="rounded-xl overflow-hidden" style={{ border: '1px solid rgba(108,59,255,0.2)' }}>
                  {baseKeys.map((key, i) => (
                    <div key={key} className="flex items-center gap-3 px-3 py-2.5"
                      style={{
                        background: 'var(--c-surface)',
                        borderBottom: i < baseKeys.length - 1 ? '1px solid rgba(108,59,255,0.08)' : undefined,
                      }}>
                      <Check size={13} className="flex-shrink-0" style={{ color: '#6C3BFF' }} />
                      <div className="min-w-0">
                        <p className="text-xs font-medium" style={{ color: 'var(--c-text)' }}>{FEATURE_LABELS[key]}</p>
                        <p className="text-[10px]" style={{ color: 'var(--c-text-3)' }}>{FEATURE_DESCRIPTIONS[key]}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              {/* Pro */}
              <div>
                <p className="text-[10px] font-semibold tracking-widest uppercase mb-2" style={{ color: 'var(--c-text-4)' }}>
                  Funciones Pro
                </p>
                <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--c-border)' }}>
                  {proKeys.map((key, i) => {
                    const active = agent.features[key];
                    return (
                      <div key={key} className="flex items-center gap-3 px-3 py-2.5"
                        style={{
                          background: 'var(--c-surface)',
                          borderBottom: i < proKeys.length - 1 ? '1px solid var(--c-border)' : undefined,
                          opacity: active ? 1 : 0.45,
                        }}>
                        {active
                          ? <Check size={13} className="flex-shrink-0" style={{ color: '#a855f7' }} />
                          : <Lock size={13} className="flex-shrink-0" style={{ color: 'var(--c-text-4)' }} />
                        }
                        <div className="min-w-0">
                          <p className="text-xs font-medium" style={{ color: active ? 'var(--c-text)' : 'var(--c-text-3)' }}>
                            {FEATURE_LABELS[key]}
                          </p>
                          <p className="text-[10px]" style={{ color: 'var(--c-text-3)' }}>{FEATURE_DESCRIPTIONS[key]}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </Card>

          {/* Recent calls */}
          <CallsSection calls={calls} timezone={agent.timezone ?? 'America/Monterrey'} />
        </div>

        {/* Right column */}
        <div className="flex flex-col gap-4">
          <MinutesAdjuster
            agentId={agent.id}
            minutesUsed={agent.minutes_used}
            minutesIncluded={agent.minutes_included}
          />

          {/* Portal + Vapi config */}
          {(agent.portal_token || agent.vapi_agent_id) && (
            <div className="p-4 rounded-xl" style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)' }}>
              {agent.portal_token && (
                <>
                  <div className="text-xs mb-2 tracking-widest uppercase font-semibold" style={{ color: 'var(--c-text-3)' }}>
                    Portal del cliente
                  </div>
                  <div className="flex items-center gap-2">
                    <a href={`/portal/${agent.portal_token}`} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-1.5 text-xs hover:underline flex-1" style={{ color: '#9B6DFF' }}>
                      <ExternalLink size={11} /> Ver portal
                    </a>
                    <CopyButton text={`${process.env.NEXT_PUBLIC_APP_URL ?? ''}/portal/${agent.portal_token}`} />
                  </div>
                  <div className="text-xs mt-1.5 font-mono break-all" style={{ color: 'var(--c-text-4)' }}>
                    /portal/{agent.portal_token?.slice(0, 8)}…
                  </div>
                </>
              )}
              {agent.vapi_agent_id && (
                <div className={agent.portal_token ? 'mt-3 pt-3' : ''}
                  style={agent.portal_token ? { borderTop: '1px solid var(--c-divider)' } : {}}>
                  <div className="text-xs mb-1 tracking-widest uppercase font-semibold" style={{ color: 'var(--c-text-3)' }}>
                    Vapi Agent ID
                  </div>
                  <div className="text-xs font-mono break-all" style={{ color: 'var(--c-text-2)' }}>{agent.vapi_agent_id}</div>
                </div>
              )}
            </div>
          )}

          {/* Business hours */}
          <div className="p-4 rounded-xl" style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)' }}>
            <div className="text-xs mb-2 tracking-widest uppercase font-semibold" style={{ color: 'var(--c-text-3)' }}>
              Horario de atención
            </div>
            {agent.business_hours ? (
              <div className="flex flex-col gap-1">
                {(['monday','tuesday','wednesday','thursday','friday','saturday','sunday'] as const).map(day => {
                  const DAY_LABEL: Record<string, string> = {
                    monday:'Lun', tuesday:'Mar', wednesday:'Mié',
                    thursday:'Jue', friday:'Vie', saturday:'Sáb', sunday:'Dom',
                  };
                  const s = (agent.business_hours as any)[day];
                  return (
                    <div key={day} className="flex items-center justify-between">
                      <span className="text-xs w-8" style={{ color: 'var(--c-text-3)' }}>{DAY_LABEL[day]}</span>
                      {s?.open
                        ? <span className="text-xs font-medium" style={{ color: 'var(--c-text)' }}>{s.from} – {s.to}</span>
                        : <span className="text-xs" style={{ color: 'var(--c-text-4)' }}>Cerrado</span>}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-xs" style={{ color: '#22c55e' }}>24/7, sin restricción de horario</div>
            )}
          </div>

          {/* Transfer */}
          {(agent.transfer_whatsapp || agent.transfer_number) && (
            <div className="p-4 rounded-xl" style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)' }}>
              <div className="text-xs mb-2 tracking-widest uppercase font-semibold" style={{ color: 'var(--c-text-3)' }}>
                Transferencia
              </div>
              {agent.transfer_whatsapp && (
                <div className="text-xs" style={{ color: 'var(--c-text)' }}>WhatsApp: {agent.transfer_whatsapp}</div>
              )}
              {agent.transfer_number && (
                <div className="text-xs mt-1" style={{ color: 'var(--c-text-2)' }}>Tel: {agent.transfer_number}</div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function getIsOpenNow(hours: any, timezone: string): boolean | null {
  if (!hours) return null;
  try {
    const now = new Date();
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

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="p-4 sm:p-5 rounded-xl" style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)' }}>
      <h2 className="text-xs font-semibold mb-4 tracking-widest uppercase" style={{ color: 'var(--c-text-3)' }}>{title}</h2>
      {children}
    </div>
  );
}

function InfoRow({ label, value, icon, link }: { label: string; value: string; icon?: React.ReactNode; link?: boolean }) {
  if (!value) return null;
  return (
    <div className="flex flex-col sm:flex-row sm:gap-3 py-2 border-b last:border-b-0" style={{ borderColor: 'var(--c-divider)' }}>
      <span className="text-xs sm:w-28 sm:flex-shrink-0 sm:pt-0.5 mb-0.5 sm:mb-0" style={{ color: 'var(--c-text-3)' }}>{label}</span>
      <span className="text-xs flex items-center gap-1.5 flex-1 min-w-0" style={{ color: 'var(--c-text)' }}>
        {icon}
        <span className="break-all">
          {link
            ? <a href={value} target="_blank" rel="noopener noreferrer" className="text-cyan-400 hover:underline">{value}</a>
            : value}
        </span>
      </span>
    </div>
  );
}

function InfoRowCompact({ label, value, icon, copyable }: { label: string; value: string; icon?: React.ReactNode; copyable?: boolean }) {
  if (!value) return null;
  return (
    <div className="flex flex-col gap-0.5 py-2 border-b last:border-b-0" style={{ borderColor: 'var(--c-divider)' }}>
      <span className="text-xs" style={{ color: 'var(--c-text-3)' }}>{label}</span>
      <span className="text-xs flex items-center gap-1 min-w-0" style={{ color: 'var(--c-text)' }}>
        {icon}
        <span className="truncate flex-1">{value}</span>
        {copyable && <CopyButton text={value} />}
      </span>
    </div>
  );
}
