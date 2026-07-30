export const dynamic = 'force-dynamic';

import { createAdminClient } from '@/lib/supabase/admin';
import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { ChevronLeft, Settings, Mail, CheckCircle, AlertTriangle } from 'lucide-react';
import { cookies } from 'next/headers';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';
import { ThemeProvider } from '@/components/ThemeProvider';
import ThemeToggle from '@/components/ThemeToggle';

import PortalLogout              from '../PortalLogout';
import PortalVoiceSelector       from '../PortalVoiceSelector';
import NotificationsToggle       from '../NotificationsToggle';
import AgentCustomization        from '../AgentCustomization';
import AgentNameEditor           from '../AgentNameEditor';
import ResyncButton              from '../ResyncButton';
import PortalFooter              from '../PortalFooter';
import InfoTooltip               from '@/components/InfoTooltip';
import { COORDINATOR_ROLE_IDS }  from '@/lib/portal/meerkat-roles';

import AgentKnowledgeBaseEditor      from '../AgentKnowledgeBaseEditor';
import TeamNumbersEditor             from '../TeamNumbersEditor';
import PassphraseEditor              from '../PassphraseEditor';
import BugReportToggle               from '../BugReportToggle';
import DefinitionOfDoneEditor        from '../DefinitionOfDoneEditor';
import GoalsSection                  from '../GoalsSection';
import GuardrailsEditor              from '../GuardrailsEditor';
import HeartbeatEditor               from '../HeartbeatEditor';
import TrustStageSelector           from '../TrustStageSelector';
import RoleEmailLearningSection     from '../RoleEmailLearningSection';
import JornadaSection               from '../JornadaSection';
import ContractSection              from '../ContractSection';
import ApprovalEmailEditor          from '../ApprovalEmailEditor';
import ConfigurarSidebar, { type SidebarSection } from './ConfigurarSidebar';
import CallForwardingSection from '../CallForwardingSection';
import SendAsEmailEditor     from '../SendAsEmailEditor';
import AutomationsSection    from './AutomationsSection';
import { AutoModeSelector, type AutoMode } from '@/components/portal/AutoModeSelector';

// IDs de agentes habilitados durante piloto de auto-mode classifier.
// Se remueve este gate en Deploy 2 (ver runbook auto-mode-classifier.md).
// Nia (voz-only) originalmente, Sofía (oficina) es la que realmente prueba el flujo.
const PILOT_AGENT_IDS = new Set(
  [
    process.env.NEXT_PUBLIC_NIA_DEMO_AGENT_ID,
    process.env.NEXT_PUBLIC_SOFIA_DEMO_AGENT_ID,
  ].filter((id): id is string => Boolean(id)),
);

const SCROLL_STYLE: React.CSSProperties = { scrollMarginTop: '1.5rem' };

interface Props {
  params: Promise<{ token: string }>;
}

export default async function ConfigurarAgentePage({ params }: Props) {
  const { token } = await params;

  const cookieStore   = await cookies();
  const sessionCookie = cookieStore.get(PORTAL_COOKIE)?.value ?? '';
  const session       = await verifySession(sessionCookie);

  const supabase = createAdminClient();
  const { data: agent } = await supabase
    .from('voice_agents').select('*').eq('portal_token', token).single();
  if (!agent) notFound();

  if (session?.portalEmail && agent.portal_email && agent.portal_email !== session.portalEmail) {
    redirect('/portal/login');
  }

  const isOwner = !session?.isSubUser;
  if (isOwner && (agent as any).onboarding_completed === false) {
    redirect(`/setup/${token}`);
  }

  const agentName    = agent.agent_name?.trim() || 'Centinelia';
  const features     = (agent.features ?? {}) as Record<string, unknown>;
  const roleColor    = (features.role_color as string) || '#6C3BFF';
  const agentRole    = (agent as any).role?.trim() ?? '';
  const meerkatId      = (features.meerkat_role_id as string | null) ?? null;
  const colorLocked    = !!meerkatId && meerkatId !== 'custom';
  const isCoordinator  = !!meerkatId && (COORDINATOR_ROLE_IDS as readonly string[]).includes(meerkatId);
  const jornadaType    = ((agent as any).jornada_type as string) ?? 'combinada';
  const hasVoice       = !isCoordinator && agent.plan === 'pro' && (!meerkatId || meerkatId === 'custom');
  const hasVoiceJornada = !isCoordinator && jornadaType !== 'tareas';
  const teamNumbers    = ((agent as any).team_numbers ?? []) as { number: string; name?: string }[];

  const { data: emailIntegration } = await supabase
    .from('email_integrations')
    .select('email, needs_reauth, provider, send_as_email')
    .eq('agent_id', agent.id)
    .maybeSingle();
  const connectedEmail = emailIntegration && !emailIntegration.needs_reauth
    ? (emailIntegration.email as string)
    : null;

  const { data: orgRow } = agent.portal_email
    ? await supabase.from('organizations').select('owner_passphrase').eq('portal_email', agent.portal_email).maybeSingle()
    : { data: null };
  const ownerPassphrase = orgRow?.owner_passphrase ?? '';

  // Build sidebar sections list matching what's actually rendered
  const sidebarSections: SidebarSection[] = [
    ...(hasVoice
      ? [{ id: 'voz',        label: 'Voz',                   group: 'Configuración' }] : []),
    { id: 'rol',             label: 'Responsabilidades',      group: 'Entrenamiento' },
    { id: 'dod',             label: 'Definición de listo',    group: 'Entrenamiento' },
    { id: 'metas',           label: 'Metas',                  group: 'Entrenamiento' },
    { id: 'limites',         label: 'Límites de autoridad',   group: 'Entrenamiento' },
    { id: 'aprendizaje',     label: 'Aprendizaje',            group: 'Entrenamiento' },
    ...(!isCoordinator
      ? [{ id: 'llamadas',   label: 'Llamadas entrantes',     group: 'Operación'     }] : []),
    ...(!isCoordinator && hasVoiceJornada && !!(agent as any).phone_number
      ? [{ id: 'desvio',    label: 'Desvío de llamadas',     group: 'Operación'     }] : []),
    { id: 'autonomia',       label: 'Nivel de autonomía',     group: 'Operación'     },
    { id: 'checkin',         label: 'Check-in automático',    group: 'Operación'     },
    { id: 'automatizaciones', label: 'Automatizaciones',      group: 'Operación'     },
    ...(!isCoordinator
      ? [{ id: 'notificaciones', label: 'Notificaciones',     group: 'Operación'     }] : []),
    ...(!isCoordinator
      ? [{ id: 'equipo',     label: 'Números del equipo',     group: 'Operación'     }] : []),
    { id: 'correo',          label: 'Correo',                 group: 'Herramientas'  },
    ...(isOwner && hasVoiceJornada
      ? [{ id: 'passphrase', label: 'Frase de verificación',  group: 'Seguridad'     }] : []),
    ...(!isCoordinator && isOwner
      ? [{ id: 'reportes',   label: 'Reportes de fallas',     group: 'Seguridad'     }] : []),
    { id: 'contrato',        label: 'Contrato',               group: 'Seguridad'     },
  ];

  return (
    <ThemeProvider storageKey="centinelia-portal-theme" defaultTheme="light">
      <div className="min-h-screen" style={{ background: 'var(--c-bg)', color: 'var(--c-text)' }}>

        {/* Header */}
        <div style={{ background: 'var(--c-surface)', borderBottom: '1px solid var(--c-border)' }}>
          <div className="max-w-5xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-3">
            <Link
              href={`/portal/${token}/agentes`}
              className="flex items-center gap-1.5 text-sm font-medium transition-opacity hover:opacity-70"
              style={{ color: 'var(--c-text-2)' }}
            >
              <ChevronLeft size={16} />
              Mis empleados
            </Link>
            <div className="flex items-center gap-1.5">
              <ThemeToggle className="!text-[var(--c-text-2)] !bg-[var(--c-surface-2)]" />
              <PortalLogout />
            </div>
          </div>
        </div>

        {/* Agent identity header */}
        <div style={{ background: 'var(--c-surface)', borderBottom: '1px solid var(--c-border)' }}>
          <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4 flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5"
              style={{ background: `${roleColor}1a`, border: `1px solid ${roleColor}33` }}>
              <Settings size={16} color={roleColor} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <AgentNameEditor token={token} initialName={agentName} />
                {agentRole && (
                  <span className="text-xs px-1.5 py-0.5 rounded-full font-medium"
                    style={{ background: `${roleColor}1f`, color: roleColor, border: `1px solid ${roleColor}40` }}>
                    {agentRole}
                  </span>
                )}
              </div>
              <p className="text-xs mt-0.5" style={{ color: 'var(--c-text-3)' }}>
                {agent.business_name}
              </p>
            </div>
            {!isCoordinator && (
              <div className="flex-shrink-0 w-72">
                <JornadaSection token={token} jornadaType={jornadaType} />
              </div>
            )}
          </div>
        </div>

        {/* 2-column layout */}
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 flex gap-8 items-start">

          <ConfigurarSidebar sections={sidebarSections} roleColor={roleColor} />

          {/* Content */}
          <div className="flex-1 min-w-0 flex flex-col gap-5">

            {hasVoice && (
              <div id="voz" style={SCROLL_STYLE}>
                <div className="rounded-xl p-5" style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)' }}>
                  <div className="flex items-center gap-1.5 mb-4">
                    <h2 className="text-xs font-semibold tracking-widest uppercase" style={{ color: 'var(--c-text-3)' }}>Voz del empleado</h2>
                    <InfoTooltip text="Elige la voz con la que este empleado atenderá las llamadas. Usa el botón ▶ para escuchar una muestra." />
                  </div>
                  <PortalVoiceSelector token={token} currentVoiceId={(agent as any).elevenlabs_voice_id ?? null} />
                </div>
              </div>
            )}

            <div id="rol" style={SCROLL_STYLE}>
              <div className="rounded-xl p-5" style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)' }}>
                <div className="flex items-center gap-1.5 mb-4">
                  <h2 className="text-xs font-semibold tracking-widest uppercase" style={{ color: 'var(--c-text-3)' }}>Responsabilidades, objetivos y conducta</h2>
                  <InfoTooltip text="Define el rol de este empleado: qué hace, cómo se comporta y qué reglas sigue en su trabajo diario." />
                </div>
                <AgentKnowledgeBaseEditor
                  token={token}
                  initialRole={(agent as any).role ?? ''}
                  initialRoleColor={((agent as any).features as any)?.role_color ?? ''}
                  initialRoleKb={(agent as any).role_knowledge_base ?? ''}
                  initialLearnings={(agent as any).role_learnings ?? ''}
                  websiteSynced={!!((agent as any).website_knowledge)}
                  hasBusinessKb={!!((agent as any).knowledge_base?.trim())}
                  colorLocked={colorLocked}
                />
              </div>
            </div>

            <div id="dod" style={SCROLL_STYLE}>
              <div className="rounded-xl p-5" style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)' }}>
                <div className="flex items-center gap-1.5 mb-4">
                  <h2 className="text-xs font-semibold tracking-widest uppercase" style={{ color: 'var(--c-text-3)' }}>Definición de listo</h2>
                  <InfoTooltip text="Tu empleado usará esto como brújula: sabe que hizo bien su trabajo cuando cumple exactamente esta condición. Sin esto, trabaja sin un target claro." />
                </div>
                <DefinitionOfDoneEditor token={token} initDod={(agent as any).definition_of_done ?? ''} />
              </div>
            </div>

            <div id="metas" style={SCROLL_STYLE}>
              <div className="rounded-xl p-5" style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)' }}>
                <div className="flex items-center gap-1.5 mb-4">
                  <h2 className="text-xs font-semibold tracking-widest uppercase" style={{ color: 'var(--c-text-3)' }}>Metas</h2>
                  <InfoTooltip text="Define objetivos medibles para este empleado. El empleado conoce su avance en cada llamada y puede usarlo para priorizar y motivar sus acciones." />
                </div>
                <GoalsSection token={token} roleColor={roleColor} />
              </div>
            </div>

            <div id="limites" style={SCROLL_STYLE}>
              <div className="rounded-xl p-5" style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)' }}>
                <div className="flex items-center gap-1.5 mb-4">
                  <h2 className="text-xs font-semibold tracking-widest uppercase" style={{ color: 'var(--c-text-3)' }}>Límites de autoridad</h2>
                  <InfoTooltip text="Define qué puede hacer este empleado por su cuenta y qué debe escalar antes de actuar. Sin límites claros, el empleado adivina — y eso genera errores." />
                </div>
                <GuardrailsEditor
                  token={token}
                  initialValue={(agent as any).agent_guardrails ?? ''}
                  initialGuardrailsLearnings={(agent as any).guardrails_learnings ?? ''}
                />
              </div>
            </div>

            <div id="aprendizaje" style={SCROLL_STYLE}>
              <div className="rounded-xl p-5" style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)' }}>
                <div className="flex items-center gap-1.5 mb-4">
                  <h2 className="text-xs font-semibold tracking-widest uppercase" style={{ color: 'var(--c-text-3)' }}>Aprendizaje de plataformas</h2>
                  <InfoTooltip text="Tu empleado lee los correos de la organización, filtra los de su área y aprende cómo se toman decisiones reales. No almacena correos, solo las reglas que extrae." />
                </div>
                <RoleEmailLearningSection
                  token={token}
                  connectedEmail={connectedEmail}
                  agentRole={agentRole || agentName}
                />
              </div>
            </div>

            {!isCoordinator && (
              <div id="llamadas" style={SCROLL_STYLE}>
                <div className="rounded-xl p-5" style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)' }}>
                  <div className="flex items-center gap-1.5 mb-4">
                    <h2 className="text-xs font-semibold tracking-widest uppercase" style={{ color: 'var(--c-text-3)' }}>Llamadas entrantes</h2>
                    <InfoTooltip text="Ajusta cómo saluda el empleado, cuándo transfiere y cómo trata a los clientes." />
                  </div>
                  <AgentCustomization
                    token={token}
                    initGreeting={(agent as any).first_message ?? ''}
                    initTransferRules={(agent as any).transfer_rules ?? ''}
                  />
                </div>
              </div>
            )}

            {!isCoordinator && hasVoiceJornada && !!(agent as any).phone_number && (
              <div id="desvio" style={SCROLL_STYLE}>
                <div className="rounded-xl p-5" style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)' }}>
                  <div className="flex items-center gap-1.5 mb-4">
                    <h2 className="text-xs font-semibold tracking-widest uppercase" style={{ color: 'var(--c-text-3)' }}>Desvío de llamadas</h2>
                    <InfoTooltip text="Redirige las llamadas de tu número actual al número Centinelia para que tu empleado las atienda automáticamente." />
                  </div>
                  <CallForwardingSection
                    phoneNumber={(agent as any).phone_number as string}
                    agentName={agentName}
                  />
                </div>
              </div>
            )}

            <div id="autonomia" style={SCROLL_STYLE}>
              <div className="rounded-xl p-5" style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)' }}>
                <div className="flex items-center gap-1.5 mb-4">
                  <h2 className="text-xs font-semibold tracking-widest uppercase" style={{ color: 'var(--c-text-3)' }}>Nivel de autonomía</h2>
                  <InfoTooltip text="Controla cuánta independencia tiene tu empleado. Empieza en Supervisado y pásalo a Autónomo cuando le tengas confianza." />
                </div>
                <TrustStageSelector token={token} initStage={(agent as any).trust_stage ?? 3} />
              </div>
            </div>

            <div id="checkin" style={SCROLL_STYLE}>
              <div className="rounded-xl p-5" style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)' }}>
                <div className="flex items-center gap-1.5 mb-4">
                  <h2 className="text-xs font-semibold tracking-widest uppercase" style={{ color: 'var(--c-text-3)' }}>Check-in automático</h2>
                  <InfoTooltip text="Tu empleado ejecuta una tarea proactiva en el horario que configures y te envía el resultado. Sin que tengas que pedírselo." />
                </div>
                <HeartbeatEditor
                  token={token}
                  initConfig={(agent as any).heartbeat_config ?? null}
                  isCoordinator={isCoordinator}
                />
              </div>
            </div>

            <div id="automatizaciones" style={SCROLL_STYLE}>
              <div className="rounded-xl p-5" style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)' }}>
                <div className="flex items-center gap-1.5 mb-4">
                  <h2 className="text-xs font-semibold tracking-widest uppercase" style={{ color: 'var(--c-text-3)' }}>Automatizaciones</h2>
                  <InfoTooltip text="Activa o pausa los reportes y tareas automáticas que tu empleado ejecuta por su cuenta. Cada una consume tareas de tu pool mensual." />
                </div>
                <AutomationsSection token={token} agentId={agent.id} roleColor={roleColor} />
              </div>
            </div>

            {!isCoordinator && (
              <div id="notificaciones" style={SCROLL_STYLE}>
                <div className="rounded-xl p-5" style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)' }}>
                  <div className="flex items-center gap-1.5 mb-4">
                    <h2 className="text-xs font-semibold tracking-widest uppercase" style={{ color: 'var(--c-text-3)' }}>Notificaciones</h2>
                    <InfoTooltip text="Elige cómo quieres recibir la información de cada llamada atendida por este empleado." />
                  </div>
                  <NotificationsToggle
                    token={token}
                    initWhatsApp={(agent as any).notify_whatsapp ?? false}
                    initEmail={(agent as any).notify_email ?? true}
                  />
                </div>
              </div>
            )}

            {!isCoordinator && (
              <div id="equipo" style={SCROLL_STYLE}>
                <div className="rounded-xl p-5" style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)' }}>
                  <div className="flex items-center gap-1.5 mb-4">
                    <h2 className="text-xs font-semibold tracking-widest uppercase" style={{ color: 'var(--c-text-3)' }}>Números del equipo</h2>
                    <InfoTooltip text="Los números que agregues aquí tendrán memoria persistente entre sesiones. El empleado recordará el historial de llamadas de cada miembro del equipo." />
                  </div>
                  <TeamNumbersEditor token={token} initialNumbers={teamNumbers} isOwner={isOwner} />
                </div>
              </div>
            )}

            <div id="correo" style={SCROLL_STYLE}>
              <div className="rounded-xl p-5" style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)' }}>
                <div className="flex items-center gap-1.5 mb-4">
                  <h2 className="text-xs font-semibold tracking-widest uppercase" style={{ color: 'var(--c-text-3)' }}>Correo</h2>
                  <InfoTooltip text="Conecta la cuenta de correo que este empleado usará para enviar y leer mensajes." />
                </div>
                {connectedEmail ? (
                  <div className="flex flex-col gap-4">
                    <div className="flex items-center gap-2.5 rounded-xl px-4 py-3"
                      style={{ background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.18)' }}>
                      {emailIntegration!.provider === 'gmail' ? (
                        <svg width="16" height="16" viewBox="0 0 48 48" fill="none" style={{ flexShrink: 0 }}>
                          <rect x="4" y="8" width="40" height="32" rx="2" fill="#fff" stroke="#ddd" strokeWidth="1.5" />
                          <path d="M4 8l20 14L44 8" stroke="#EA4335" strokeWidth="2.5" fill="none" />
                        </svg>
                      ) : (
                        <svg width="16" height="16" viewBox="0 0 48 48" fill="none" style={{ flexShrink: 0 }}>
                          <rect width="48" height="48" rx="6" fill="#0078D4" />
                          <rect x="8" y="12" width="18" height="24" fill="#fff" opacity=".9" />
                          <circle cx="17" cy="24" r="6" fill="#0078D4" />
                          <path d="M28 16h12v4H28zM28 22h12v4H28zM28 28h12v4H28z" fill="#fff" opacity=".8" />
                        </svg>
                      )}
                      <CheckCircle size={13} style={{ color: '#22c55e', flexShrink: 0 }} />
                      <span className="text-sm font-mono font-medium" style={{ color: 'var(--c-text)' }}>
                        {connectedEmail}
                      </span>
                    </div>
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-widest mb-2"
                        style={{ color: 'var(--c-text-4)' }}>
                        Correo para envíos propios
                      </p>
                      <p className="text-xs mb-2.5 leading-relaxed" style={{ color: 'var(--c-text-3)' }}>
                        Para seguimientos y correos personales, el empleado envía desde esta dirección en lugar del correo del área.
                      </p>
                      <SendAsEmailEditor
                        token={token}
                        provider={emailIntegration!.provider as string}
                        initialValue={(emailIntegration as any).send_as_email ?? ''}
                      />
                    </div>
                    {PILOT_AGENT_IDS.has(agent.id) && (
                      <div>
                        <div className="flex items-center gap-1.5 mb-2">
                          <p className="text-[10px] font-semibold uppercase tracking-widest"
                            style={{ color: 'var(--c-text-4)' }}>
                            Modo de respuesta
                          </p>
                          <InfoTooltip text={'Manual: revisas cada respuesta antes de enviarla.\n\nAuto (recomendado): el empleado envía las respuestas rutinarias sin preguntarte y escala solo los correos con compromisos, quejas graves o datos delicados.\n\nAutomático: envía todo sin verificar (solo si ya validaste el comportamiento del empleado).'} />
                        </div>
                        <AutoModeSelector
                          token={token}
                          provider={emailIntegration!.provider as string}
                          current={((agent as { auto_mode?: AutoMode | null }).auto_mode) ?? ((agent as { auto_reply?: boolean }).auto_reply ? 'auto' : 'off')}
                        />
                      </div>
                    )}
                  </div>
                ) : emailIntegration?.needs_reauth ? (
                  <div className="flex items-center gap-2.5 rounded-xl px-4 py-3"
                    style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.2)' }}>
                    <AlertTriangle size={13} style={{ color: '#f59e0b', flexShrink: 0 }} />
                    <span className="text-xs" style={{ color: 'var(--c-text-2)' }}>
                      La conexión de correo requiere reconexión. Ve a la sección de Integraciones en la Oficina.
                    </span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2.5 rounded-xl px-4 py-3"
                    style={{ background: 'var(--c-surface-2)', border: '1px solid var(--c-border)' }}>
                    <Mail size={13} style={{ color: 'var(--c-text-4)', flexShrink: 0 }} />
                    <span className="text-xs" style={{ color: 'var(--c-text-3)' }}>
                      Sin correo conectado. Configúralo en la sección de Integraciones en la Oficina.
                    </span>
                  </div>
                )}

                <div className="mt-5 pt-5" style={{ borderTop: '1px solid var(--c-border)' }}>
                  <div className="flex items-center gap-1.5 mb-3">
                    <h3 className="text-xs font-semibold tracking-widest uppercase" style={{ color: 'var(--c-text-3)' }}>Aprobador de borradores</h3>
                    <InfoTooltip text={'Cuando el empleado redacta una respuesta de correo que necesita revisión humana (según su Modo de respuesta), esta persona recibirá la notificación para aprobar o descartar el borrador.'} />
                  </div>
                  <ApprovalEmailEditor token={token} initialEmail={(agent as any).approval_email ?? ''} />
                </div>
              </div>
            </div>

            {isOwner && hasVoiceJornada && (
              <div id="passphrase" style={SCROLL_STYLE}>
                <div className="rounded-xl p-5" style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)' }}>
                  <div className="flex items-center gap-1.5 mb-4">
                    <h2 className="text-xs font-semibold tracking-widest uppercase" style={{ color: 'var(--c-text-3)' }}>Frase de verificación interna</h2>
                    <InfoTooltip text="Dila al teléfono desde cualquier número y el empleado sabrá que eres tú o alguien del equipo autorizado." />
                  </div>
                  <PassphraseEditor token={token} initial={ownerPassphrase} />
                </div>
              </div>
            )}

            {!isCoordinator && isOwner && (
              <div id="reportes" style={SCROLL_STYLE}>
                <div className="rounded-xl p-5" style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)' }}>
                  <div className="flex items-center gap-1.5 mb-4">
                    <h2 className="text-xs font-semibold tracking-widest uppercase" style={{ color: 'var(--c-text-3)' }}>Reportes de fallas</h2>
                  </div>
                  <BugReportToggle token={token} initial={!!(agent as any).allow_bug_reports} />
                </div>
              </div>
            )}

            <div id="contrato" style={SCROLL_STYLE}>
              <ContractSection
                token={token}
                businessName={agent.business_name}
                signedAt={(agent as any).contract_accepted_at ?? null}
                contractPreviewUrl={`/portal/${token}/contrato`}
              />
            </div>

            <div className="rounded-xl p-5" style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)' }}>
              <ResyncButton token={token} />
            </div>

          </div>
        </div>

        <PortalFooter noSidebar token={token} />

      </div>
    </ThemeProvider>
  );
}
