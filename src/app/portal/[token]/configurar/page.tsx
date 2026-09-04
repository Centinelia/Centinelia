export const dynamic = 'force-dynamic';

import { createAdminClient } from '@/lib/supabase/admin';
import { getAgentByToken, resolveOrgFromToken } from '@/lib/portal/org-token';
import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { ChevronLeft, Mail, CheckCircle, AlertTriangle, Phone, Zap, Clock } from 'lucide-react';
import { cookies } from 'next/headers';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';
import { ThemeProvider } from '@/components/ThemeProvider';

import PortalLogout              from '../PortalLogout';
import PortalVoiceSelector       from '../PortalVoiceSelector';
import NotificationsToggle       from '../NotificationsToggle';
import AgentCustomization        from '../AgentCustomization';
import AgentNameEditor           from '../AgentNameEditor';
import ResyncButton              from '../ResyncButton';
import PortalFooter              from '../PortalFooter';
import { COORDINATOR_ROLE_IDS, MEERKAT_MAP } from '@/lib/portal/meerkat-roles';

import AgentKnowledgeBaseEditor      from '../AgentKnowledgeBaseEditor';
import PassphraseEditor              from '../PassphraseEditor';
import DefinitionOfDoneEditor        from '../DefinitionOfDoneEditor';
import GoalsSection                  from '../GoalsSection';
import GuardrailsEditor              from '../GuardrailsEditor';
import HeartbeatEditor               from '../HeartbeatEditor';
import AutonomySection              from './AutonomySection';
import RoleEmailLearningSection     from '../RoleEmailLearningSection';
import JornadaSection               from '../JornadaSection';
import ApprovalEmailEditor          from '../ApprovalEmailEditor';
import CallForwardingSection   from '../CallForwardingSection';
import FallbackNumberSection  from '../FallbackNumberSection';
import AgentEmailSection     from '../AgentEmailSection';
import AgentAccountsSection  from '../AgentAccountsSection';
import SpamFolderToggle      from '../SpamFolderToggle';
import AutomationsSection    from './AutomationsSection';
import { BriefDelDiaSection } from './BriefDelDiaSection';
import { BrandTemplateSection } from './BrandTemplateSection';
import ToolOverridesSection from './ToolOverridesSection';
import ConfigurarTabs from './ConfigurarTabs';
import { TemplateUploader } from '../oficina/bitacora/TemplateUploader';
import { DeliveryConfig } from '../oficina/bitacora/DeliveryConfig';
import { BITACORA_TEMPLATE_UPLOAD_TASKS } from '@/app/api/portal/[token]/oficina/bitacora/template-upload/route';
import OutboundToggles from '../OutboundToggles';
import EmpleadoPickerChips from './EmpleadoPickerChips';
import { Card, SectionHeader } from '@/components/portal-ui';

const SCROLL_STYLE: React.CSSProperties = { scrollMarginTop: '1.5rem' };

interface Props {
  params:       Promise<{ token: string }>;
  searchParams: Promise<{ empleado_id?: string }>;
}

export default async function ConfigurarAgentePage({ params, searchParams }: Props) {
  const { token }        = await params;
  const { empleado_id }  = await searchParams;

  const cookieStore   = await cookies();
  const sessionCookie = cookieStore.get(PORTAL_COOKIE)?.value ?? '';
  const session       = await verifySession(sessionCookie);

  const supabase = createAdminClient();

  // /configurar es per-agent — resolvemos el target agent en este orden:
  // 1. `?empleado_id=xxx` explícito → usa ese agente (validando que pertenece al org).
  // 2. Legacy URL (token = voice_agents.portal_token) → ese agente.
  // 3. Org token corto sin empleado_id → primer agente activo del org (con picker en UI si hay N > 1).
  let agent: Record<string, any> | null = null;

  const resolved = await resolveOrgFromToken(token);
  if (!resolved) notFound();

  if (empleado_id) {
    const { data } = await supabase
      .from('voice_agents').select('*')
      .eq('id', empleado_id)
      .eq('portal_email', resolved.portalEmail)
      .eq('active', true)
      .maybeSingle() as { data: Record<string, any> | null };
    agent = data;
  }

  if (!agent) {
    agent = await getAgentByToken<Record<string, any>>(token, '*', supabase);
    if (!agent || agent.active !== true) agent = null;
  }

  if (!agent) {
    const { data } = await supabase
      .from('voice_agents').select('*')
      .eq('portal_email', resolved.portalEmail)
      .eq('active', true)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle() as { data: Record<string, any> | null };
    agent = data;
  }
  if (!agent) notFound();

  // Roster de agentes activos del org (para picker cuando N > 1).
  const { data: orgAgentsRaw } = await supabase
    .from('voice_agents')
    .select('id, agent_name, role, features')
    .eq('portal_email', resolved.portalEmail)
    .eq('active', true)
    .order('created_at', { ascending: true });
  const orgAgents = (orgAgentsRaw ?? []) as Array<{
    id: string; agent_name: string | null; role: string | null;
    features: Record<string, unknown> | null;
  }>;

  if (session?.portalEmail && agent.portal_email && agent.portal_email !== session.portalEmail) {
    redirect('/portal/login');
  }

  const isOwner = !session?.isSubUser;
  if (isOwner && (agent as any).onboarding_completed === false) {
    redirect(`/setup/${token}`);
  }

  const agentName    = agent.agent_name?.trim() || 'Centinelia';
  const features     = (agent.features ?? {}) as Record<string, unknown>;
  const agentRole    = (agent as any).role?.trim() ?? '';
  const meerkatId      = (features.meerkat_role_id as string | null) ?? null;
  const meerkatDef     = meerkatId ? (MEERKAT_MAP as Record<string, { color?: string; imagen?: string | null }>)[meerkatId] : null;
  // Fallback ladder para color y avatar. Ver bug fix 2026-08-19: sin este ladder,
  // los meerkats canónicos (Nox/Nala) que no tenían features.role_color caían al
  // morado default sin usar su color de rol.
  const roleColor    = (features.role_color as string) || meerkatDef?.color || '#6C3BFF';
  const colorLocked    = !!meerkatId;
  const isCoordinator  = !!meerkatId && (COORDINATOR_ROLE_IDS as readonly string[]).includes(meerkatId);
  const jornadaType    = ((agent as any).jornada_type as string) ?? 'combinada';
  const hasVoice       = !isCoordinator && agent.plan === 'pro' && (!meerkatId || meerkatId === 'custom');
  const hasVoiceJornada = !isCoordinator && jornadaType !== 'tareas';
  const initOutbound   = !!(features.outbound_calls);
  const initMissedCall = !!((agent as any).missed_call_recovery);
  // Coordinadores (Nox, Niva, Nash) NO tienen voz — nunca deben ver el
  // toggle de llamadas salientes en su config (confusión al usuario).
  const showOutbound   = !isCoordinator && (initOutbound || agent.plan === 'pro');
  // Capabilities de outbound: agent-level override > meerkat default. Ver
  // src/lib/portal/outbound-capabilities.ts y outbound-gate.ts.
  const meerkatCaps = meerkatId ? ((MEERKAT_MAP as Record<string, { features: { outbound_capabilities?: string[] } }>)[meerkatId]?.features.outbound_capabilities ?? []) : [];
  const agentOutboundCaps: string[] = Array.isArray(features.outbound_capabilities)
    ? (features.outbound_capabilities as string[])
    : meerkatCaps;

  // Correo del negocio: fuente de verdad para aprendizaje del rol es
  // integration_accounts (per-org). El empleado no aprende del correo del
  // empleado, aprende del correo del NEGOCIO. Fallback a email_integrations
  // solo por retrocompat con conexiones viejas per-agent.
  let connectedEmail: string | null = null;
  if (agent.portal_email) {
    const { data } = await supabase
      .from('integration_accounts')
      .select('account_label, status')
      .eq('portal_email', agent.portal_email)
      .in('provider', ['gmail', 'outlook'])
      .maybeSingle();
    if (data && (data as any).status !== 'needs_reauth') {
      connectedEmail = ((data as any).account_label as string) ?? null;
    }
  }

  const { data: emailIntegration } = await supabase
    .from('email_integrations')
    .select('email, needs_reauth, provider, send_as_email')
    .eq('agent_id', agent.id)
    .maybeSingle();

  if (!connectedEmail && emailIntegration && !emailIntegration.needs_reauth) {
    connectedEmail = (emailIntegration.email as string);
  }

  const { data: orgRow } = agent.portal_email
    ? await supabase.from('organizations').select('owner_passphrase, fallback_phone_number').eq('portal_email', agent.portal_email).maybeSingle()
    : { data: null };
  const ownerPassphrase      = orgRow?.owner_passphrase ?? '';
  const fallbackPhoneNumber  = (orgRow as any)?.fallback_phone_number as string | null ?? null;

  // Fetch spam folder stats for the last 7 days
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();
  let spamRevisados = 0;
  let spamRescatados = 0;
  try {
    const { count } = await supabase
      .from('ops_inbox')
      .select('*', { count: 'exact', head: true })
      .eq('agent_id', agent.id)
      .like('source_folder', 'spam%')
      .gte('created_at', sevenDaysAgo);
    spamRevisados = count ?? 0;
  } catch {
    // Silently fail if table/column doesn't exist yet
  }
  try {
    const { count } = await supabase
      .from('ops_inbox')
      .select('*', { count: 'exact', head: true })
      .eq('agent_id', agent.id)
      .eq('source_folder', 'spam_rescued')
      .gte('created_at', sevenDaysAgo);
    spamRescatados = count ?? 0;
  } catch {
    // Silently fail if table/column doesn't exist yet
  }

  const spamCheckEnabled     = ((agent.features as Record<string, unknown>)?.check_spam_folder) === true;
  const spamStats = {
    revisados: spamRevisados,
    rescatados: spamRescatados,
    ops_consumidas: Math.round(spamRevisados * 0.3),
  };

  return (
    <ThemeProvider storageKey="centinelia-portal-theme" defaultTheme="light">
      <div className="min-h-screen flex flex-col overflow-x-hidden" style={{ background: 'var(--c-bg)', color: 'var(--c-text)' }}>

        {/* Header */}
        <div style={{ background: 'var(--c-surface)', borderBottom: '1px solid var(--c-border)' }}>
          <div className="max-w-5xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-3">
            <Link
              href={`/portal/${token}/empleados`}
              className="flex items-center gap-1.5 text-sm font-medium transition-opacity hover:opacity-70"
              style={{ color: 'var(--c-text-2)' }}
            >
              <ChevronLeft size={16} />
              Mis empleados
            </Link>
            <div className="flex items-center gap-1.5">
              <PortalLogout />
            </div>
          </div>
        </div>

        {/* Empleado picker — solo cuando N > 1. Preserva otros query params. */}
        {orgAgents.length > 1 && (
          <div style={{ background: 'var(--c-surface)' }}>
            <div className="max-w-5xl mx-auto px-4 sm:px-6 pt-4">
              <EmpleadoPickerChips
                token={token}
                activeId={agent.id as string}
                agents={orgAgents.map(a => ({
                  id:    a.id,
                  name:  a.agent_name?.trim() || 'Empleado',
                  role:  a.role?.trim() ?? null,
                  color: ((a.features as any)?.role_color as string | null) ?? null,
                }))}
              />
            </div>
          </div>
        )}

        {/* Agent identity header */}
        {(() => {
          const avatarSrc = (features.avatar as string | null) || meerkatDef?.imagen || null;
          const initial   = (agentName?.trim() || (agent.business_name as string) || 'C').charAt(0).toUpperCase();
          // Paleta oficial de jornadas: tareas verde, minutos celeste, combinada morado.
          const JORNADA_META: Record<string, { label: string; desc: string; icon: React.ReactNode; color: string }> = {
            combinada: { label: 'Combinada',    desc: 'Minutos de voz + tareas',  icon: <><Clock size={11}/><Zap size={11}/></>, color: '#6C3BFF' },
            minutos:   { label: 'Solo minutos', desc: 'Canal de voz',              icon: <Clock size={11}/>,                       color: '#0E7490' },
            tareas:    { label: 'Solo tareas',  desc: 'Sin canal de voz',          icon: <Zap size={11}/>,                         color: '#10B981' },
          };
          const jornada = JORNADA_META[jornadaType] ?? JORNADA_META['combinada'];

          return (
            <div style={{ background: 'var(--c-surface)', borderBottom: '1px solid var(--c-border)' }}>
              <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 flex items-center gap-5">

                {/* Avatar grande con imagen del meerkat */}
                <div className="w-24 h-24 rounded-2xl overflow-hidden flex-shrink-0 relative"
                  style={{ background: `${roleColor}12`, border: `1px solid ${roleColor}33` }}>
                  {avatarSrc ? (
                    <img src={avatarSrc} alt={agentName}
                      className="w-full h-full"
                      style={{ objectFit: 'contain', objectPosition: 'center bottom' }} />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-4xl font-black"
                      style={{ color: roleColor }}>
                      {initial}
                    </div>
                  )}
                </div>

                {/* Nombre + rol + business + chip de jornada */}
                <div className="flex-1 min-w-0 flex flex-col gap-1.5">
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <AgentNameEditor token={token} agentId={agent.id as string} initialName={agentName} />
                    {agentRole && (
                      <span className="text-sm font-semibold" style={{ color: roleColor }}>
                        {agentRole}
                      </span>
                    )}
                  </div>
                  <p className="text-xs" style={{ color: 'var(--c-text-3)' }}>
                    {agent.business_name}
                  </p>
                  {!isCoordinator && (
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-full"
                        style={{ background: `${jornada.color}12`, color: jornada.color, border: `1px solid ${jornada.color}33` }}>
                        <span className="flex items-center gap-0.5">{jornada.icon}</span>
                        {jornada.label}
                      </span>
                      <span className="text-[11px]" style={{ color: 'var(--c-text-4)' }}>
                        {jornada.desc}
                      </span>
                    </div>
                  )}
                </div>

                {/* CTA lateral: contratar canal de voz (solo si jornada=tareas y no coordinador) */}
                {!isCoordinator && jornadaType === 'tareas' && (
                  <div className="flex-shrink-0 w-64">
                    <JornadaSection token={token} agentId={agent.id as string} jornadaType={jornadaType} />
                  </div>
                )}
              </div>
            </div>
          );
        })()}

        {/* Configuración pendiente — bloque destacado si falta setup crítico */}
        {(() => {
          const hasFirstMessage = !!((agent as any).first_message as string | null)?.trim();
          const hasRoleKb       = !!((agent as any).role_knowledge_base as string | null)?.trim();
          const hasTransferRules = !!((agent as any).transfer_rules as string | null)?.trim();
          const needsEmail      = !isCoordinator && !connectedEmail;

          // Cada item incluye el tab correcto para que ConfigurarTabs lo abra
          // y haga scroll al anchor correspondiente.
          const pending = [
            !hasFirstMessage && hasVoice && { label: 'Configura el saludo de bienvenida',          tab: 'personalidad', anchor: 'llamadas' },
            !hasRoleKb       && !isCoordinator && { label: 'Redacta las instrucciones del puesto', tab: 'personalidad', anchor: 'rol'      },
            !hasTransferRules && hasVoiceJornada && !!(agent as any).phone_number && { label: 'Define las reglas de transferencia', tab: 'personalidad', anchor: 'llamadas' },
            needsEmail       && { label: 'Conecta un correo para el empleado',                      tab: 'tools',        anchor: 'correo'   },
          ].filter(Boolean) as { label: string; tab: string; anchor: string }[];

          if (pending.length === 0) return null;

          return (
            <div className="max-w-5xl mx-auto px-4 sm:px-6 pt-6">
              <div className="rounded-2xl overflow-hidden"
                style={{
                  background: 'linear-gradient(180deg, rgba(108,59,255,0.06) 0%, var(--c-surface) 100%)',
                  border:     '2px solid rgba(108,59,255,0.28)',
                  boxShadow:  '0 4px 20px rgba(108,59,255,0.08)',
                }}>
                <div className="px-5 pt-5 pb-4 flex items-center gap-3" style={{ borderBottom: '1px solid var(--c-border-2)' }}>
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{ background: roleColor, boxShadow: `0 4px 12px ${roleColor}55` }}>
                    <AlertTriangle size={18} color="#fff" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h2 className="text-base font-bold" style={{ color: 'var(--c-text)' }}>
                      Configuración pendiente de {agentName}
                    </h2>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--c-text-3)' }}>
                      {pending.length} {pending.length === 1 ? 'ajuste' : 'ajustes'} para que este empleado trabaje al 100%.
                    </p>
                  </div>
                </div>
                <div className="p-5 flex flex-col gap-2">
                  {pending.map((p, idx) => (
                    <a key={idx} href={`?tab=${p.tab}#${p.anchor}`}
                      className="flex items-center justify-between text-sm no-underline transition-opacity hover:opacity-80"
                      style={{ color: 'var(--c-text)' }}>
                      <span>
                        <span style={{ color: roleColor, marginRight: 6 }}>●</span>
                        {p.label}
                      </span>
                      <span className="text-xs whitespace-nowrap" style={{ color: roleColor }}>Configurar →</span>
                    </a>
                  ))}
                </div>
              </div>
            </div>
          );
        })()}

        {/* Full-width content with 5-tab layout */}
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
          <ConfigurarTabs roleColor={roleColor}>

            {/* ── Tab 0: Rol y Personalidad ─────────────────────────────
                 Cómo suena y cómo se identifica el empleado.               */}
            <div className="flex flex-col gap-5">

              {hasVoice && (
                <div id="voz" style={SCROLL_STYLE}>
                  <Card border elevated={false} padding="sm">
                    <SectionHeader
                      as="h2"
                      title="Voz del empleado"
                      tooltip="Elige la voz con la que este empleado atenderá las llamadas. Usa el botón ▶ para escuchar una muestra."
                      className="mb-4"
                    />
                    <PortalVoiceSelector token={token} agentId={agent.id as string} currentVoiceId={(agent as any).elevenlabs_voice_id ?? null} />
                  </Card>
                </div>
              )}

              {/* Idioma movido a /negocio#idioma en 2026-08-06.
                  Era config per-org disfrazada de per-empleado. */}

              {/* Tono de marca movido a /negocio#branding en 2026-08-06.
                  Era config per-org (organizations.brand_voice_guide). */}

              <div id="rol" style={SCROLL_STYLE}>
                <Card border elevated={false} padding="sm">
                  <SectionHeader
                    as="h2"
                    title="Responsabilidades, objetivos y conducta"
                    tooltip="Define el rol de este empleado: qué hace, cómo se comporta y qué reglas sigue en su trabajo diario."
                    className="mb-4"
                  />
                  <AgentKnowledgeBaseEditor
                    token={token}
                    agentId={agent.id as string}
                    initialRole={(agent as any).role ?? ''}
                    initialRoleColor={((agent as any).features as any)?.role_color ?? ''}
                    initialRoleKb={(agent as any).role_knowledge_base ?? ''}
                    initialLearnings={(agent as any).role_learnings ?? ''}
                    websiteSynced={!!((agent as any).website_knowledge)}
                    hasBusinessKb={!!((agent as any).knowledge_base?.trim())}
                    colorLocked={colorLocked}
                    roleLocked={!!meerkatId}
                  />
                </Card>
              </div>

              {!isCoordinator && (
                <div id="llamadas" style={SCROLL_STYLE}>
                  <Card border elevated={false} padding="sm">
                    <SectionHeader
                      as="h2"
                      title="Llamadas entrantes"
                      tooltip="Ajusta cómo saluda el empleado, cuándo transfiere y cómo trata a los clientes."
                      className="mb-4"
                    />
                    <AgentCustomization
                      token={token}
                      agentId={agent.id as string}
                      initGreeting={(agent as any).first_message ?? ''}
                      initTransferRules={(agent as any).transfer_rules ?? ''}
                    />
                  </Card>
                </div>
              )}

            </div>

            {/* ── Tab 1: Conocimiento ────────────────────────────────────
                 Qué sabe y qué le toca hacer.                              */}
            <div className="flex flex-col gap-5">

              {/* 'Responsabilidades, objetivos y conducta' movido a tab
                  Rol y Personalidad (2026-08-06). Es la definición del rol,
                  no una pieza de conocimiento adquirido. */}

              <div id="dod" style={SCROLL_STYLE}>
                <Card border elevated={false} padding="sm">
                  <SectionHeader
                    as="h2"
                    title="Definición de listo"
                    tooltip="Tu empleado usará esto como brújula: sabe que hizo bien su trabajo cuando cumple exactamente esta condición. Sin esto, trabaja sin un target claro."
                    className="mb-4"
                  />
                  <DefinitionOfDoneEditor token={token} agentId={agent.id as string} initDod={(agent as any).definition_of_done ?? ''} />
                </Card>
              </div>

              <div id="metas" style={SCROLL_STYLE}>
                <Card border elevated={false} padding="sm">
                  <SectionHeader
                    as="h2"
                    title="Metas"
                    tooltip="Define objetivos medibles para este empleado. El empleado conoce su avance en cada llamada y puede usarlo para priorizar y motivar sus acciones."
                    className="mb-4"
                  />
                  <GoalsSection token={token} roleColor={roleColor} />
                </Card>
              </div>

              <div id="limites" style={SCROLL_STYLE}>
                <Card border elevated={false} padding="sm">
                  <SectionHeader
                    as="h2"
                    title="Límites de autoridad"
                    tooltip="Define qué puede hacer este empleado por su cuenta y qué debe escalar antes de actuar. Sin límites claros, el empleado adivina, y eso genera errores."
                    className="mb-4"
                  />
                  <GuardrailsEditor
                    token={token}
                    agentId={agent.id as string}
                    initialValue={(agent as any).agent_guardrails ?? ''}
                    initialGuardrailsLearnings={(agent as any).guardrails_learnings ?? ''}
                  />
                </Card>
              </div>

              <div id="aprendizaje" style={SCROLL_STYLE}>
                <Card border elevated={false} padding="sm">
                  <SectionHeader
                    as="h2"
                    title="Aprendizaje de plataformas"
                    tooltip="Tu empleado lee los correos de la organización, filtra los de su área y aprende cómo se toman decisiones reales. No almacena correos, solo las reglas que extrae."
                    className="mb-4"
                  />
                  <RoleEmailLearningSection
                    token={token}
                    connectedEmail={connectedEmail}
                    agentRole={agentRole || agentName}
                  />
                </Card>
              </div>

              {['noah', 'nelia'].includes(meerkatId ?? '') && (
                <div id="plantillas" style={SCROLL_STYLE}>
                  <Card border elevated={false} padding="sm">
                    <SectionHeader
                      as="h2"
                      title="Plantillas de documentos"
                      tooltip="Sube tu plantilla .docx custom para cada tipo de documento. Tu empleado la usará en lugar del formato por defecto al generar propuestas, cotizaciones o one_pagers."
                      className="mb-4"
                    />
                    <BrandTemplateSection
                      availableTipos={
                        meerkatId === 'noah'  ? ['propuesta', 'cotizacion', 'one_pager'] :
                        meerkatId === 'nelia' ? ['one_pager'] :
                        []
                      }
                    />
                  </Card>
                </div>
              )}

            </div>

            {/* ── Tab 2: Herramientas ────────────────────────────────────
                 Con qué canales y apps interactúa el empleado.             */}
            <div className="flex flex-col gap-5">

              <div id="correo" style={SCROLL_STYLE}>
                <Card border elevated={false} padding="sm">
                  <SectionHeader
                    as="h2"
                    title="Correo"
                    tooltip="Conecta la cuenta de correo que este empleado usará para enviar y leer mensajes."
                    className="mb-4"
                  />
                  <AgentEmailSection token={token} agentId={agent.id as string} />

                    {connectedEmail && (
                      <div className="mt-5 pt-5" style={{ borderTop: '1px solid var(--c-border)' }}>
                        <SpamFolderToggle
                          token={token}
                          agentId={agent.id as string}
                          initial={spamCheckEnabled}
                          stats={spamStats.revisados > 0 ? spamStats : null}
                        />
                      </div>
                    )}

                    <div className="mt-5 pt-5" style={{ borderTop: '1px solid var(--c-border)' }}>
                      <SectionHeader
                        as="h3"
                        title="Aprobador de borradores"
                        tooltip="Cuando el empleado redacta una respuesta de correo que necesita revisión humana (según su Modo de respuesta), esta persona recibirá la notificación para aprobar o descartar el borrador."
                        className="mb-3"
                      />
                      <ApprovalEmailEditor token={token} agentId={agent.id as string} initialEmail={(agent as any).approval_email ?? ''} />
                    </div>

                  </Card>
                </div>

              <div id="calendario-empleado" style={SCROLL_STYLE}>
                <Card border elevated={false} padding="sm">
                  <SectionHeader
                    as="h2"
                    title="Calendario"
                    tooltip="Conecta el calendario personal de este empleado (Google o Outlook). Al agendar o consultar citas, usará esta cuenta directamente."
                    className="mb-4"
                  />
                  <AgentAccountsSection token={token} agentId={agent.id as string} kind="calendar" />
                </Card>
              </div>

              <div id="almacenamiento-empleado" style={SCROLL_STYLE}>
                <Card border elevated={false} padding="sm">
                  <SectionHeader
                    as="h2"
                    title="Almacenamiento en la nube"
                    tooltip="Conecta el Drive u OneDrive del empleado. Los archivos que guarde o busque vivirán en esta cuenta."
                    className="mb-4"
                  />
                  <AgentAccountsSection token={token} agentId={agent.id as string} kind="storage" />
                </Card>
              </div>

              {!isCoordinator && hasVoiceJornada && !!(agent as any).phone_number && (
                <div id="desvio" style={SCROLL_STYLE}>
                  <Card border elevated={false} padding="sm">
                    <SectionHeader
                      as="h2"
                      title="Desvío de llamadas"
                      tooltip="Redirige las llamadas de tu número actual al número Centinelia para que tu empleado las atienda automáticamente."
                      className="mb-4"
                    />
                    <CallForwardingSection
                      phoneNumber={(agent as any).phone_number as string}
                      agentName={agentName}
                    />
                  </Card>
                </div>
              )}

              {!isCoordinator && hasVoiceJornada && (
                <div id="respaldo" style={SCROLL_STYLE}>
                  <Card border elevated={false} padding="sm">
                    <SectionHeader
                      as="h2"
                      title="Número de respaldo cuando se agoten tus minutos"
                      tooltip="Si no te quedan minutos en tu ciclo, las llamadas entrantes se redirigen a este número en lugar de colgarse. Recibes un aviso por WhatsApp cuando esto ocurra."
                      className="mb-4"
                    />
                    <FallbackNumberSection
                      token={token}
                      initialValue={fallbackPhoneNumber}
                      suggestedFromTransferWhatsapp={(agent as any).transfer_whatsapp ?? null}
                      apiPath={`/api/portal/${token}/org`}
                    />
                  </Card>
                </div>
              )}

              {!isCoordinator && (
                <div id="equipo" style={SCROLL_STYLE}>
                  <Card border elevated={false} padding="sm">
                    <SectionHeader
                      as="h2"
                      title="Directorio de la organización"
                      className="mb-2"
                    />
                    <p className="text-xs mb-3" style={{ color: 'var(--c-text-3)' }}>
                      El directorio de personas (responsable, equipo, especialistas) vive a nivel organización y lo comparten todos tus empleados.
                    </p>
                    <a
                      href={`/portal/${token}?tab=organizacion&nav=directorio`}
                      className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg"
                      style={{ background: 'rgba(108,59,255,0.1)', color: '#6C3BFF' }}
                    >
                      Editar en Organización →
                    </a>
                  </Card>
                </div>
              )}

              {showOutbound && (
                <div id="llamadas-salientes" style={SCROLL_STYLE}>
                  <Card border elevated={false} padding="sm">
                    <SectionHeader
                      as="h2"
                      title="Llamadas salientes"
                      tooltip="Activa o desactiva las llamadas salientes y el recovery de llamadas perdidas para este empleado."
                      className="mb-4"
                    />
                    <OutboundToggles
                      token={token}
                      agentId={agent.id as string}
                      initOutbound={initOutbound}
                      initMissedCallRecovery={initMissedCall}
                      agentCapabilities={agentOutboundCaps}
                      agentName={agentName}
                    />
                  </Card>
                </div>
              )}

              {isOwner && hasVoiceJornada && (
                <div id="passphrase" style={SCROLL_STYLE}>
                  <Card border elevated={false} padding="sm">
                    <SectionHeader
                      as="h2"
                      title="Frase de verificación interna"
                      tooltip="Dila al teléfono desde cualquier número y el empleado sabrá que eres tú o alguien del equipo autorizado."
                      className="mb-4"
                    />
                    <PassphraseEditor token={token} initial={ownerPassphrase} />
                    {/* PassphraseEditor saves owner_passphrase (org-level field) — agentId not needed */}
                  </Card>
                </div>
              )}

              {/* Sheets del negocio — vive en Organización (?tab=organizacion#sheets-crm)
                  porque es config per-organización, no per-empleado. */}

              {isOwner && (
                <div id="herramientas-finas" style={SCROLL_STYLE}>
                  <Card border elevated={false} padding="sm">
                    <ToolOverridesSection
                      token={token}
                      agentId={agent.id as string}
                      agentName={agentName}
                      roleColor={roleColor}
                    />
                  </Card>
                </div>
              )}

            </div>

            {/* ── Tab 3: Autonomía y Avisos ─────────────────────────────
                 Cuánto decide solo y cómo te informa.                      */}
            <div className="flex flex-col gap-5">

              <div id="autonomia" style={SCROLL_STYLE}>
                <Card border elevated={false} padding="sm">
                  <SectionHeader
                    as="h2"
                    title="Cómo trabaja tu empleado"
                    tooltip="Controla cuánta independencia tiene el empleado. Por default actúa como uno real; sube el control solo si prefieres validar cada paso."
                    className="mb-4"
                  />
                  <AutonomySection
                    token={token}
                    agentId={agent.id as string}
                    agentName={(agent as any).agent_name ?? ''}
                    initStage={(agent as any).trust_stage ?? 3}
                    roleColor={roleColor}
                    isOwner={isOwner}
                  />
                </Card>
              </div>

              {/* 'Metas' y 'Límites de autoridad' movidos a tab Conocimiento
                  (2026-08-06). Son cosas que el empleado debe SABER (qué
                  perseguir, hasta dónde puede llegar), no automatizaciones. */}

              <div id="checkin" style={SCROLL_STYLE}>
                <Card border elevated={false} padding="sm">
                  <SectionHeader
                    as="h2"
                    title="Check-in automático"
                    tooltip="Tu empleado ejecuta una tarea proactiva en el horario que configures y te envía el resultado. Sin que tengas que pedírselo."
                    className="mb-4"
                  />
                  <HeartbeatEditor
                    token={token}
                    agentId={agent.id as string}
                    initConfig={(agent as any).heartbeat_config ?? null}
                    isCoordinator={isCoordinator}
                  />
                </Card>
              </div>

              {meerkatId === 'nox' && (
                <div id="brief-del-dia" style={SCROLL_STYLE}>
                  <Card border elevated={false} padding="sm">
                    <SectionHeader
                      as="h2"
                      title="Brief del día"
                      tooltip="Nox prepara un resumen diario con lo que requiere tu atención, lo que necesita preparación y lo que ya está en orden. Puedes recibirlo automáticamente cada mañana."
                      className="mb-4"
                    />
                    <BriefDelDiaSection agentId={agent.id} />
                  </Card>
                </div>
              )}

              <div id="automatizaciones" style={SCROLL_STYLE}>
                <Card border elevated={false} padding="sm">
                  <SectionHeader
                    as="h2"
                    title="Automatizaciones"
                    tooltip="Activa o pausa los reportes y tareas automáticas que tu empleado ejecuta por su cuenta. Cada una consume tareas de tu pool mensual."
                    className="mb-4"
                  />
                  <AutomationsSection token={token} agentId={agent.id} roleColor={roleColor} />
                </Card>
              </div>

              {!isCoordinator && (
                <div id="notificaciones" style={SCROLL_STYLE}>
                  <Card border elevated={false} padding="sm">
                    <SectionHeader
                      as="h2"
                      title="Notificaciones"
                      tooltip="Elige cómo quieres recibir la información de cada llamada atendida por este empleado."
                      className="mb-4"
                    />
                    <NotificationsToggle
                      token={token}
                      agentId={agent.id as string}
                      initWhatsApp={(agent as any).notify_whatsapp ?? false}
                      initEmail={(agent as any).notify_email ?? true}
                    />
                  </Card>
                </div>
              )}

              {/* Reportes de fallas: siempre disponibles, no consumen tareas
                  ni minutos. Toggle removido 2026-08-06 — el FAB del portal
                  siempre está visible y el endpoint /bug-report acepta
                  siempre sin gate. */}

              {/* Términos de servicio viven per-cliente en /portal?tab=cuenta#terminos-servicio */}
              <Card border elevated={false} padding="sm">
                <ResyncButton token={token} />
              </Card>

            </div>

            {/* 5to tab: Bitácora — plantilla custom y envío automático per-empleado */}
            <div className="flex flex-col gap-5">
              <TemplateUploader
                token={token}
                agentId={agent.id as string}
                current={(agent.bitacora_template as any) ?? null}
                uploadCost={BITACORA_TEMPLATE_UPLOAD_TASKS}
              />
              <DeliveryConfig
                token={token}
                agentId={agent.id as string}
                initial={(agent.bitacora_weekly_config as any) ?? {
                  enabled: false, day_of_week: 6, hour: 14, recipients: [], include_monthly_last_saturday: true,
                }}
              />
            </div>

          </ConfigurarTabs>
        </div>

        <PortalFooter noSidebar token={token} />

      </div>
    </ThemeProvider>
  );
}
