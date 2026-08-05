export const dynamic = 'force-dynamic';

import { createAdminClient } from '@/lib/supabase/admin';
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
import { COORDINATOR_ROLE_IDS }  from '@/lib/portal/meerkat-roles';

import AgentKnowledgeBaseEditor      from '../AgentKnowledgeBaseEditor';
import TeamNumbersEditor             from '../TeamNumbersEditor';
import PassphraseEditor              from '../PassphraseEditor';
import BugReportToggle               from '../BugReportToggle';
import DefinitionOfDoneEditor        from '../DefinitionOfDoneEditor';
import BrandVoiceEditor              from '../BrandVoiceEditor';
import GoalsSection                  from '../GoalsSection';
import GuardrailsEditor              from '../GuardrailsEditor';
import HeartbeatEditor               from '../HeartbeatEditor';
import TrustStageSelector           from '../TrustStageSelector';
import RoleEmailLearningSection     from '../RoleEmailLearningSection';
import JornadaSection               from '../JornadaSection';
import ApprovalEmailEditor          from '../ApprovalEmailEditor';
import InvoicingEmailEditor         from '../InvoicingEmailEditor';
import CallForwardingSection from '../CallForwardingSection';
import SendAsEmailEditor     from '../SendAsEmailEditor';
import SpamFolderToggle      from '../SpamFolderToggle';
import MultilingualToggle    from '../MultilingualToggle';
import AutomationsSection    from './AutomationsSection';
import { BriefDelDiaSection } from './BriefDelDiaSection';
import { BrandTemplateSection } from './BrandTemplateSection';
import ApprovalSettingsSection from './ApprovalSettingsSection';
import SheetsMappingsSection from './SheetsMappingsSection';
import ConfigurarTabs from './ConfigurarTabs';
import OutboundToggles from '../OutboundToggles';
import { Card, SectionHeader } from '@/components/portal-ui';

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
  const initOutbound   = !!(features.outbound_calls);
  const initMissedCall = !!((agent as any).missed_call_recovery);
  const showOutbound   = initOutbound || agent.plan === 'pro';

  const { data: emailIntegration } = await supabase
    .from('email_integrations')
    .select('email, needs_reauth, provider, send_as_email')
    .eq('agent_id', agent.id)
    .maybeSingle();
  const connectedEmail = emailIntegration && !emailIntegration.needs_reauth
    ? (emailIntegration.email as string)
    : null;

  const { data: orgRow } = agent.portal_email
    ? await supabase.from('organizations').select('owner_passphrase, brand_voice_guide, multilingual').eq('portal_email', agent.portal_email).maybeSingle()
    : { data: null };
  const ownerPassphrase = orgRow?.owner_passphrase ?? '';
  const brandVoiceGuide = (orgRow as { brand_voice_guide?: string | null } | null)?.brand_voice_guide ?? '';
  const orgMultilingual = (orgRow as { multilingual?: boolean | null } | null)?.multilingual ?? false;

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
  const syncLeadsToSheets    = !!(agent as any).sync_leads_to_sheets;
  const spamStats = {
    revisados: spamRevisados,
    rescatados: spamRescatados,
    ops_consumidas: Math.round(spamRevisados * 0.3),
  };

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
              <PortalLogout />
            </div>
          </div>
        </div>

        {/* Agent identity header */}
        {(() => {
          const avatarSrc = (features.avatar as string | null) || null;
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
                    <AgentNameEditor token={token} initialName={agentName} />
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
                    <JornadaSection token={token} jornadaType={jornadaType} />
                  </div>
                )}
              </div>
            </div>
          );
        })()}

        {/* Full-width content with 5-tab layout */}
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
          <ConfigurarTabs roleColor={roleColor}>

            {/* ── Tab 0: Personalidad y voz ─────────────────────────────── */}
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
                    <PortalVoiceSelector token={token} currentVoiceId={(agent as any).elevenlabs_voice_id ?? null} />
                  </Card>
                </div>
              )}

              {isOwner && !isCoordinator && (
                <div id="idioma" style={SCROLL_STYLE}>
                  <Card border elevated={false} padding="sm">
                    <SectionHeader
                      as="h2"
                      title="Idioma"
                      tooltip="Ajuste a nivel cuenta: aplica a todos tus empleados."
                      className="mb-4"
                    />
                    <MultilingualToggle token={token} initial={orgMultilingual} />
                  </Card>
                </div>
              )}

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
                    initialRole={(agent as any).role ?? ''}
                    initialRoleColor={((agent as any).features as any)?.role_color ?? ''}
                    initialRoleKb={(agent as any).role_knowledge_base ?? ''}
                    initialLearnings={(agent as any).role_learnings ?? ''}
                    websiteSynced={!!((agent as any).website_knowledge)}
                    hasBusinessKb={!!((agent as any).knowledge_base?.trim())}
                    colorLocked={colorLocked}
                  />
                </Card>
              </div>

              <div id="dod" style={SCROLL_STYLE}>
                <Card border elevated={false} padding="sm">
                  <SectionHeader
                    as="h2"
                    title="Definición de listo"
                    tooltip="Tu empleado usará esto como brújula: sabe que hizo bien su trabajo cuando cumple exactamente esta condición. Sin esto, trabaja sin un target claro."
                    className="mb-4"
                  />
                  <DefinitionOfDoneEditor token={token} initDod={(agent as any).definition_of_done ?? ''} />
                </Card>
              </div>

              {!isCoordinator && (
                <div id="tono-de-marca" style={SCROLL_STYLE}>
                  <Card border elevated={false} padding="sm">
                    <SectionHeader
                      as="h2"
                      title="Tono de marca"
                      tooltip="Extrae el tono real de tu negocio a partir de muestras (correos previos, copy del sitio, pitch). Tus empleados hablarán como tu marca, no con un tono genérico."
                      className="mb-4"
                    />
                    <BrandVoiceEditor token={token} initGuide={brandVoiceGuide} roleColor={roleColor} />
                  </Card>
                </div>
              )}

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
                      agentId={agent.id}
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

            {/* ── Tab 1: Conocimiento y guardrails ──────────────────────── */}
            <div className="flex flex-col gap-5">

              {/* Accordion: Aprendizaje */}
              <details open>
                <summary className="cursor-pointer font-medium text-sm mb-3 flex items-center gap-2" style={{ color: 'var(--c-text)' }}>
                  <span>▶</span> Aprendizaje
                </summary>
                <div id="aprendizaje" style={SCROLL_STYLE}>
                  <Card border elevated={false} padding="sm">
                    <SectionHeader
                      as="h3"
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
              </details>

              {/* Accordion: Correo */}
              <details open>
                <summary className="cursor-pointer font-medium text-sm mb-3 flex items-center gap-2" style={{ color: 'var(--c-text)' }}>
                  <span>▶</span> Correo (email)
                </summary>
                <div id="correo" style={SCROLL_STYLE}>
                  <Card border elevated={false} padding="sm">
                    <SectionHeader
                      as="h2"
                      title="Correo"
                      tooltip="Conecta la cuenta de correo que este empleado usará para enviar y leer mensajes."
                      className="mb-4"
                    />
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

                    {connectedEmail && (
                      <div className="mt-5 pt-5" style={{ borderTop: '1px solid var(--c-border)' }}>
                        <SpamFolderToggle
                          token={token}
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
                      <ApprovalEmailEditor token={token} initialEmail={(agent as any).approval_email ?? ''} />
                    </div>

                    <div className="mt-5 pt-5" style={{ borderTop: '1px solid var(--c-border)' }}>
                      <SectionHeader
                        as="h3"
                        title="Responsable de facturación"
                        tooltip="Cuando el empleado recolecte una solicitud de factura de un cliente, esta persona recibirá el correo con todos los datos para timbrar el CFDI en su sistema fiscal (Solución Factible, CONTPAQ, Aspel, etc.)."
                        className="mb-3"
                      />
                      <InvoicingEmailEditor token={token} initialEmail={((agent as any).features?.invoicing_email as string | undefined) ?? ''} />
                    </div>
                  </Card>
                </div>
              </details>

              {/* Accordion: Integraciones externas */}
              <details open>
                <summary className="cursor-pointer font-medium text-sm mb-3 flex items-center gap-2" style={{ color: 'var(--c-text)' }}>
                  <span>▶</span> Integraciones externas
                </summary>
                <div id="sheets-del-negocio" style={SCROLL_STYLE}>
                  <Card border elevated={false} padding="sm">
                    <SheetsMappingsSection
                      token={token}
                      agentId={agent.id}
                      initialSyncLeads={syncLeadsToSheets}
                    />
                  </Card>
                </div>
              </details>

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
                  </Card>
                </div>
              )}

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
                      initWhatsApp={(agent as any).notify_whatsapp ?? false}
                      initEmail={(agent as any).notify_email ?? true}
                    />
                  </Card>
                </div>
              )}

            </div>

            {/* ── Tab 2: Herramientas e integraciones ───────────────────── */}
            <div className="flex flex-col gap-5">

              {/* Accordion: Llamadas */}
              {!isCoordinator && (
                <details open>
                  <summary className="cursor-pointer font-medium text-sm mb-3 flex items-center gap-2" style={{ color: 'var(--c-text)' }}>
                    <span>▶</span> Llamadas
                  </summary>
                  <div className="flex flex-col gap-5">
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
                          initGreeting={(agent as any).first_message ?? ''}
                          initTransferRules={(agent as any).transfer_rules ?? ''}
                        />
                      </Card>
                    </div>

                    {hasVoiceJornada && !!(agent as any).phone_number && (
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

                    <div id="equipo" style={SCROLL_STYLE}>
                      <Card border elevated={false} padding="sm">
                        <SectionHeader
                          as="h2"
                          title="Números del equipo"
                          tooltip="Los números que agregues aquí tendrán memoria persistente entre sesiones. El empleado recordará el historial de llamadas de cada miembro del equipo."
                          className="mb-4"
                        />
                        <TeamNumbersEditor token={token} initialNumbers={teamNumbers} isOwner={isOwner} />
                      </Card>
                    </div>
                  </div>
                </details>
              )}

              {/* Accordion: Autonomía y aprobaciones */}
              <details open>
                <summary className="cursor-pointer font-medium text-sm mb-3 flex items-center gap-2" style={{ color: 'var(--c-text)' }}>
                  <span>▶</span> Autonomía y aprobaciones
                </summary>
                <div className="flex flex-col gap-5">
                  <div id="autonomia" style={SCROLL_STYLE}>
                    <Card border elevated={false} padding="sm">
                      <SectionHeader
                        as="h2"
                        title="Nivel de autonomía"
                        tooltip="Controla cuánta independencia tiene tu empleado. Empieza en Supervisado y pásalo a Autónomo cuando le tengas confianza."
                        className="mb-4"
                      />
                      <TrustStageSelector token={token} initStage={(agent as any).trust_stage ?? 3} />
                    </Card>
                  </div>

                  {isOwner && (
                    <div id="aprobaciones" style={SCROLL_STYLE}>
                      <Card border elevated={false} padding="sm">
                        <ApprovalSettingsSection token={token} roleColor={roleColor} />
                      </Card>
                    </div>
                  )}
                </div>
              </details>

              {/* Accordion: Iniciativa proactiva */}
              <details open>
                <summary className="cursor-pointer font-medium text-sm mb-3 flex items-center gap-2" style={{ color: 'var(--c-text)' }}>
                  <span>▶</span> Iniciativa proactiva
                </summary>
                <div className="flex flex-col gap-5">
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
                </div>
              </details>

              {/* Accordion: Diagnóstico */}
              {!isCoordinator && isOwner && (
                <details open>
                  <summary className="cursor-pointer font-medium text-sm mb-3 flex items-center gap-2" style={{ color: 'var(--c-text)' }}>
                    <span>▶</span> Diagnóstico
                  </summary>
                  <div className="flex flex-col gap-5">
                    <div id="reportes" style={SCROLL_STYLE}>
                      <Card border elevated={false} padding="sm">
                        <SectionHeader
                          as="h2"
                          title="Reportes de fallas"
                          className="mb-4"
                        />
                        <BugReportToggle token={token} initial={!!(agent as any).allow_bug_reports} />
                      </Card>
                    </div>
                  </div>
                </details>
              )}

            </div>

            {/* ── Tab 3: Horarios y automatizaciones ────────────────────── */}
            <div className="flex flex-col gap-5">

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
                    initialValue={(agent as any).agent_guardrails ?? ''}
                    initialGuardrailsLearnings={(agent as any).guardrails_learnings ?? ''}
                  />
                </Card>
              </div>

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

              {/* Llamadas salientes + Missed call recovery (moved from /llamadas tabs) */}
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
                      initOutbound={initOutbound}
                      initMissedCallRecovery={initMissedCall}
                    />
                  </Card>
                </div>
              )}

            </div>

            {/* ── Tab 4: Marca y ajustes ────────────────────────────────── */}
            {/* El contrato de servicios ya no vive aqui: es per-cliente y se
                gestiona en /portal/[token]?tab=cuenta#contrato. Ver
                [[contract-at-organization-level]]. */}
            <div className="flex flex-col gap-5">

              <Card border elevated={false} padding="sm">
                <ResyncButton token={token} />
              </Card>

            </div>

          </ConfigurarTabs>
        </div>

        <PortalFooter noSidebar token={token} />

      </div>
    </ThemeProvider>
  );
}
