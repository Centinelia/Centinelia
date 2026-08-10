import { createAdminClient } from '@/lib/supabase/admin';
import { resolveOrgFromToken } from '@/lib/portal/org-token';
import PortalChatDock    from './PortalChatDock';
import { type AgentOption } from './OpsAgentChatFab';
import { MEERKAT_MAP } from '@/lib/portal/meerkat-roles';

export default async function TokenLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params:   Promise<{ token: string }>;
}) {
  const { token } = await params;

  const supabase = createAdminClient();
  const resolved = await resolveOrgFromToken(token);
  const portalEmail = resolved?.portalEmail ?? null;
  const account = portalEmail ? { portal_email: portalEmail } : null;

  const { data: org } = portalEmail
    ? await supabase
        .from('organizations')
        .select('account_status, warning_reason, suspension_reason, suspended_until')
        .eq('portal_email', portalEmail)
        .single()
    : { data: null };

  const isWarned    = org?.account_status === 'warned';
  const isSuspended = org?.account_status === 'suspended';
  const isTerminated = org?.account_status === 'terminated';

  let opsAgents: AgentOption[] = [];
  if (account?.portal_email) {
    const { data } = await supabase
      .from('voice_agents')
      .select('id, agent_name, role, business_name, features')
      .eq('portal_email', account.portal_email)
      .eq('active', true)
      .not('role', 'is', null)
      .order('created_at', { ascending: true });
    opsAgents = (data ?? []).map((a: any) => {
      const mid     = (a.features?.meerkat_role_id as string | undefined) ?? 'custom';
      const meerkat = (MEERKAT_MAP as Record<string, { genero?: 'M' | 'F' }>)[mid];
      return {
        id:            a.id,
        agent_name:    a.agent_name,
        role:          a.role,
        business_name: a.business_name,
        avatar_url:    (a.features?.avatar     as string | null) ?? null,
        role_color:    (a.features?.role_color as string | null) ?? null,
        genero:        meerkat?.genero ?? 'M',
      } satisfies AgentOption;
    });
  }

  const untilLabel = org?.suspended_until
    ? new Date(org.suspended_until).toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' })
    : null;

  return (
    <>
      {isWarned && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, zIndex: 9999,
          background: 'rgba(217,119,6,0.95)', backdropFilter: 'blur(8px)',
          padding: '10px 20px', display: 'flex', alignItems: 'center', gap: 12,
          boxShadow: '0 2px 16px rgba(0,0,0,0.3)',
        }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: '#fff', flexShrink: 0 }}>Aviso de cumplimiento</span>
          <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.85)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {org?.warning_reason ?? 'Se detectó actividad que podría infringir la Política de Uso Aceptable.'}
          </span>
          <a href="mailto:hola@centinelia.mx" style={{ fontSize: 12, fontWeight: 700, color: '#fff', textDecoration: 'underline', flexShrink: 0 }}>
            Contactar soporte
          </a>
        </div>
      )}
      {(isSuspended || isTerminated) && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, zIndex: 9999,
          background: isSuspended ? 'rgba(220,38,38,0.95)' : 'rgba(127,29,29,0.97)',
          backdropFilter: 'blur(8px)',
          padding: '10px 20px', display: 'flex', alignItems: 'center', gap: 12,
          boxShadow: '0 2px 16px rgba(0,0,0,0.4)',
        }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: '#fff', flexShrink: 0 }}>
            {isTerminated ? 'Servicio terminado' : 'Cuenta suspendida'}
          </span>
          <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.85)', flex: 1 }}>
            {isTerminated
              ? (org?.suspension_reason ?? 'Tu servicio ha sido terminado por infracciones a la Política de Uso Aceptable.')
              : untilLabel
                ? `Suspendida hasta el ${untilLabel}. ${org?.suspension_reason ?? ''}`
                : (org?.suspension_reason ?? 'Tu cuenta está suspendida temporalmente.')}
          </span>
          <a href="mailto:hola@centinelia.mx" style={{ fontSize: 12, fontWeight: 700, color: '#fff', textDecoration: 'underline', flexShrink: 0 }}>
            Contactar soporte
          </a>
        </div>
      )}
      {children}
      <PortalChatDock token={token} opsAgents={opsAgents} />
    </>
  );
}
