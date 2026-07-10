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
import SupportChat               from '../SupportChat';
import OutboundInstructionsEditor    from '../OutboundInstructionsEditor';
import OutboundRoleSelector          from '../OutboundRoleSelector';
import AgentKnowledgeBaseEditor      from '../AgentKnowledgeBaseEditor';

const PLAN_LABELS: Record<string, string> = { basico: 'Básico', estandar: 'Estándar', pro: 'Pro' };
const PLAN_COLORS: Record<string, string> = { basico: '#6b7280', estandar: '#3b82f6', pro: '#a855f7' };

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

  const agentName    = agent.agent_name?.trim() || 'Centinelia';
  const planColor    = PLAN_COLORS[agent.plan] ?? '#6b7280';
  const planLabel    = PLAN_LABELS[agent.plan] ?? agent.plan;
  const features     = (agent.features ?? {}) as Record<string, boolean>;
  const showOutbound = process.env.NODE_ENV === 'development' ? true : !!features.outbound_calls;

  return (
    <ThemeProvider storageKey="centinelia-portal-theme" defaultTheme="dark">
      <div className="min-h-screen" style={{ background: 'var(--c-bg)', color: 'var(--c-text)' }}>

        {/* Header */}
        <div style={{ background: 'var(--c-surface)', borderBottom: '1px solid var(--c-border)' }}>
          <div className="max-w-4xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-3">
            <Link
              href={`/portal/${token}?tab=cuenta`}
              className="flex items-center gap-1.5 text-sm font-medium transition-opacity hover:opacity-70"
              style={{ color: 'var(--c-text-2)' }}
            >
              <ChevronLeft size={16} />
              Cuenta
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
              style={{ background: 'rgba(108,59,255,0.1)', border: '1px solid rgba(108,59,255,0.2)' }}>
              <Settings size={16} color="#6C3BFF" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <AgentNameEditor token={token} initialName={agentName} />
                <span className="text-xs px-1.5 py-0.5 rounded-full font-medium"
                  style={{ background: `${planColor}18`, color: planColor, border: `1px solid ${planColor}30` }}>
                  {planLabel}
                </span>
              </div>
              <p className="text-xs mt-0.5" style={{ color: 'var(--c-text-3)' }}>
                {agent.business_name}
              </p>
            </div>
          </div>
        </div>

        {/* Config sections */}
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 flex flex-col gap-5">

          {agent.plan === 'pro' && (
            <div className="rounded-xl p-5" style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }}>
              <h2 className="text-xs font-semibold mb-1 tracking-widest uppercase" style={{ color: 'var(--c-text-3)' }}>
                Voz del agente
              </h2>
              <p className="text-xs mb-4" style={{ color: 'var(--c-text-2)' }}>
                Elige la voz con la que tu agente atenderá las llamadas. Usa el botón ▶ para escuchar una muestra.
              </p>
              <PortalVoiceSelector token={token} currentVoiceId={(agent as any).elevenlabs_voice_id ?? null} />
            </div>
          )}

          <div className="rounded-xl p-5" style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }}>
            <h2 className="text-xs font-semibold mb-1 tracking-widest uppercase" style={{ color: 'var(--c-text-3)' }}>
              Llamadas entrantes
            </h2>
            <p className="text-xs mb-4" style={{ color: 'var(--c-text-2)' }}>
              Ajusta cómo saluda el agente, cuándo transfiere y cómo trata a los clientes.
            </p>
            <AgentCustomization
              token={token}
              initGreeting={(agent as any).first_message ?? ''}
              initTransferRules={(agent as any).transfer_rules ?? ''}
              initSpeechStyle={(agent as any).speech_style ?? 'usted'}
            />
          </div>

          {showOutbound && (
            <div className="rounded-xl p-5" style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }}>
              <h2 className="text-xs font-semibold mb-1 tracking-widest uppercase" style={{ color: 'var(--c-text-3)' }}>
                Llamadas salientes
              </h2>
              <div className="mb-5 pb-5" style={{ borderBottom: '1px solid var(--c-border)' }}>
                <p className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: 'var(--c-text-3)' }}>
                  Rol del agente
                </p>
                <p className="text-xs mb-3" style={{ color: 'var(--c-text-3)' }}>
                  Etiqueta este agente según el tipo de llamadas que hace. Aparece en el selector al programar salientes.
                </p>
                <OutboundRoleSelector
                  token={token}
                  initialRole={(agent as any).outbound_role ?? null}
                />
              </div>

              <OutboundInstructionsEditor
                token={token}
                initialValue={(agent as any).outbound_knowledge_base ?? ''}
              />
            </div>
          )}

          <div className="rounded-xl p-5" style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }}>
            <h2 className="text-xs font-semibold mb-1 tracking-widest uppercase" style={{ color: 'var(--c-text-3)' }}>
              Notificaciones
            </h2>
            <p className="text-xs mb-4" style={{ color: 'var(--c-text-2)' }}>
              Elige cómo quieres recibir la información de cada llamada.
            </p>
            <NotificationsToggle
              token={token}
              initWhatsApp={(agent as any).notify_whatsapp ?? true}
              initEmail={(agent as any).notify_email ?? true}
            />
          </div>

          <div className="rounded-xl p-5" style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }}>
            <h2 className="text-xs font-semibold mb-1 tracking-widest uppercase" style={{ color: 'var(--c-text-3)' }}>
              Base de conocimiento del agente
            </h2>
            <p className="text-xs mb-5" style={{ color: 'var(--c-text-2)' }}>
              Define el rol de este agente y las instrucciones específicas que usará en campo.
            </p>
            <AgentKnowledgeBaseEditor
              token={token}
              initialRole={(agent as any).role ?? ''}
              initialRoleKb={(agent as any).role_knowledge_base ?? ''}
              initialLearnings={(agent as any).role_learnings ?? ''}
            />
          </div>

          <div className="rounded-xl p-5" style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }}>
            <ResyncButton token={token} />
          </div>

        </div>

        {/* Footer */}
        <div className="mt-6 px-4 sm:px-6 py-4" style={{ borderTop: '1px solid var(--c-border)' }}>
          <div className="max-w-4xl mx-auto">
            <span className="text-xs" style={{ color: 'var(--c-text-4)' }}>
              Powered by{' '}
              <a
                href="https://pneumastudio.mx"
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: 'var(--c-text-4)' }}
                className="hover:opacity-80 transition-opacity"
              >
                Pneuma Studio
              </a>
            </span>
          </div>
        </div>

        <SupportChat />
      </div>
    </ThemeProvider>
  );
}
