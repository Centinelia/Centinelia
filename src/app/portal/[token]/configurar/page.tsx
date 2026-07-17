export const dynamic = 'force-dynamic';

import { createAdminClient } from '@/lib/supabase/admin';
import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { ChevronLeft, Settings } from 'lucide-react';
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
  const meerkatId    = (features.meerkat_role_id as string | null) ?? null;
  const colorLocked  = !!meerkatId && meerkatId !== 'custom';
  const teamNumbers  = ((agent as any).team_numbers ?? []) as { number: string; name?: string }[];

  const { data: emailIntegration } = await supabase
    .from('email_integrations')
    .select('email, needs_reauth')
    .eq('agent_id', agent.id)
    .maybeSingle();
  const connectedEmail = emailIntegration && !emailIntegration.needs_reauth
    ? (emailIntegration.email as string)
    : null;

  return (
    <ThemeProvider storageKey="centinelia-portal-theme" defaultTheme="dark">
      <div className="min-h-screen" style={{ background: 'var(--c-bg)', color: 'var(--c-text)' }}>

        {/* Header */}
        <div style={{ background: 'var(--c-surface)', borderBottom: '1px solid var(--c-border)' }}>
          <div className="max-w-4xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-3">
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
          <div className="max-w-4xl mx-auto px-4 sm:px-6 py-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
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
          </div>
        </div>

        {/* Config sections */}
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 flex flex-col gap-5">

          {agent.plan === 'pro' && (!meerkatId || meerkatId === 'custom') && (
            <div className="rounded-xl p-5" style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)' }}>
              <div className="flex items-center gap-1.5 mb-4">
                <h2 className="text-xs font-semibold tracking-widest uppercase" style={{ color: 'var(--c-text-3)' }}>
                  Voz del empleado
                </h2>
                <InfoTooltip text="Elige la voz con la que este empleado atenderá las llamadas. Usa el botón ▶ para escuchar una muestra." />
              </div>
              <PortalVoiceSelector token={token} currentVoiceId={(agent as any).elevenlabs_voice_id ?? null} />
            </div>
          )}

          <div className="rounded-xl p-5" style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)' }}>
            <div className="flex items-center gap-1.5 mb-4">
              <h2 className="text-xs font-semibold tracking-widest uppercase" style={{ color: 'var(--c-text-3)' }}>
                Responsabilidades, objetivos y conducta
              </h2>
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

          <div className="rounded-xl p-5" style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)' }}>
            <div className="flex items-center gap-1.5 mb-4">
              <h2 className="text-xs font-semibold tracking-widest uppercase" style={{ color: 'var(--c-text-3)' }}>
                Definición de listo
              </h2>
              <InfoTooltip text="Tu empleado usará esto como brújula: sabe que hizo bien su trabajo cuando cumple exactamente esta condición. Sin esto, trabaja sin un target claro." />
            </div>
            <DefinitionOfDoneEditor
              token={token}
              initDod={(agent as any).definition_of_done ?? ''}
            />
          </div>

          <div className="rounded-xl p-5" style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)' }}>
            <div className="flex items-center gap-1.5 mb-4">
              <h2 className="text-xs font-semibold tracking-widest uppercase" style={{ color: 'var(--c-text-3)' }}>
                Metas
              </h2>
              <InfoTooltip text="Define objetivos medibles para este empleado. El empleado conoce su avance en cada llamada y puede usarlo para priorizar y motivar sus acciones." />
            </div>
            <GoalsSection token={token} roleColor={roleColor} />
          </div>

          <div className="rounded-xl p-5" style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)' }}>
            <div className="flex items-center gap-1.5 mb-4">
              <h2 className="text-xs font-semibold tracking-widest uppercase" style={{ color: 'var(--c-text-3)' }}>
                Límites de autoridad
              </h2>
              <InfoTooltip text="Define qué puede hacer este empleado por su cuenta y qué debe escalar antes de actuar. Sin límites claros, el empleado adivina — y eso genera errores." />
            </div>
            <GuardrailsEditor
              token={token}
              initialValue={(agent as any).agent_guardrails ?? ''}
            />
          </div>

          <div className="rounded-xl p-5" style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)' }}>
            <div className="flex items-center gap-1.5 mb-4">
              <h2 className="text-xs font-semibold tracking-widest uppercase" style={{ color: 'var(--c-text-3)' }}>
                Nivel de autonomía
              </h2>
              <InfoTooltip text="Controla cuánta independencia tiene tu empleado. Empieza en Supervisado y pásalo a Autónomo cuando le tengas confianza." />
            </div>
            <TrustStageSelector
              token={token}
              initStage={(agent as any).trust_stage ?? 3}
            />
          </div>

          <div className="rounded-xl p-5" style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)' }}>
            <div className="flex items-center gap-1.5 mb-4">
              <h2 className="text-xs font-semibold tracking-widest uppercase" style={{ color: 'var(--c-text-3)' }}>
                Check-in automático
              </h2>
              <InfoTooltip text="Tu empleado ejecuta una tarea proactiva en el horario que configures y te envía el resultado. Sin que tengas que pedírselo." />
            </div>
            <HeartbeatEditor
              token={token}
              initConfig={(agent as any).heartbeat_config ?? null}
            />
          </div>

          <div className="rounded-xl p-5" style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)' }}>
            <div className="flex items-center gap-1.5 mb-4">
              <h2 className="text-xs font-semibold tracking-widest uppercase" style={{ color: 'var(--c-text-3)' }}>
                Llamadas entrantes
              </h2>
              <InfoTooltip text="Ajusta cómo saluda el empleado, cuándo transfiere y cómo trata a los clientes." />
            </div>
            <AgentCustomization
              token={token}
              initGreeting={(agent as any).first_message ?? ''}
              initTransferRules={(agent as any).transfer_rules ?? ''}
            />
          </div>

          <div className="rounded-xl p-5" style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)' }}>
            <div className="flex items-center gap-1.5 mb-4">
              <h2 className="text-xs font-semibold tracking-widest uppercase" style={{ color: 'var(--c-text-3)' }}>
                Notificaciones
              </h2>
              <InfoTooltip text="Elige cómo quieres recibir la información de cada llamada atendida por este empleado." />
            </div>
            <NotificationsToggle
              token={token}
              initWhatsApp={(agent as any).notify_whatsapp ?? true}
              initEmail={(agent as any).notify_email ?? true}
            />
          </div>

          <div className="rounded-xl p-5" style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)' }}>
            <div className="flex items-center gap-1.5 mb-4">
              <h2 className="text-xs font-semibold tracking-widest uppercase" style={{ color: 'var(--c-text-3)' }}>
                Números del equipo
              </h2>
              <InfoTooltip text="Los números que agregues aquí tendrán memoria persistente entre sesiones. El empleado recordará el historial de llamadas de cada miembro del equipo." />
            </div>
            <TeamNumbersEditor token={token} initialNumbers={teamNumbers} isOwner={isOwner} />
          </div>

          {isOwner && (
            <div className="rounded-xl p-5" style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)' }}>
              <div className="flex items-center gap-1.5 mb-4">
                <h2 className="text-xs font-semibold tracking-widest uppercase" style={{ color: 'var(--c-text-3)' }}>
                  Reportes de fallas
                </h2>
              </div>
              <BugReportToggle token={token} initial={!!(agent as any).allow_bug_reports} />
            </div>
          )}

          {isOwner && (
            <div className="rounded-xl p-5" style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)' }}>
              <div className="flex items-center gap-1.5 mb-4">
                <h2 className="text-xs font-semibold tracking-widest uppercase" style={{ color: 'var(--c-text-3)' }}>
                  Frase de verificación interna
                </h2>
                <InfoTooltip text="Dila al teléfono desde cualquier número y el empleado sabrá que eres tú o alguien del equipo autorizado." />
              </div>
              <PassphraseEditor token={token} initial={(agent as any).owner_passphrase ?? ''} />
            </div>
          )}

          <div className="rounded-xl p-5" style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)' }}>
            <div className="flex items-center gap-1.5 mb-4">
              <h2 className="text-xs font-semibold tracking-widest uppercase" style={{ color: 'var(--c-text-3)' }}>
                Aprendizaje de plataformas
              </h2>
              <InfoTooltip text="Tu empleado lee los correos del negocio, filtra los de su área y aprende cómo se toman decisiones reales. No almacena correos, solo las reglas que extrae." />
            </div>
            <RoleEmailLearningSection
              token={token}
              connectedEmail={connectedEmail}
              agentRole={agentRole || agentName}
            />
          </div>

          <div className="rounded-xl p-5" style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)' }}>
            <ResyncButton token={token} />
          </div>

        </div>

        <PortalFooter noSidebar />

      </div>
    </ThemeProvider>
  );
}
