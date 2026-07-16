export const dynamic = 'force-dynamic';

import { createAdminClient }            from '@/lib/supabase/admin';
import { cookies }                      from 'next/headers';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';
import { redirect, notFound }           from 'next/navigation';
import { ThemeProvider }                from '@/components/ThemeProvider';
import ThemeToggle                      from '@/components/ThemeToggle';
import BusinessSwitcher                 from '../BusinessSwitcher';
import PortalLogout                     from '../PortalLogout';
import NotificationBell                 from '../NotificationBell';
import PortalFooter                     from '../PortalFooter';
import PortalSidebar                    from '../PortalSidebar';
import SubUserManager                   from './SubUserManager';

interface Props { params: Promise<{ token: string }> }

export default async function UsuariosPage({ params }: Props) {
  const { token }   = await params;
  const cookieStore = await cookies();
  const session     = await verifySession(cookieStore.get(PORTAL_COOKIE)?.value ?? '');

  const supabase = createAdminClient();
  const { data: agent } = await supabase
    .from('voice_agents')
    .select('portal_email, business_name, logo_url, active, billing_status, plan, stripe_customer_id, features, minutes_included, minutes_used, ai_ops_used, ai_ops_limit')
    .eq('portal_token', token)
    .single();
  if (!agent) notFound();

  if (session?.portalEmail && agent.portal_email && agent.portal_email !== session.portalEmail)
    redirect('/portal/login');

  // Only owners can access this page
  if (session?.isSubUser) redirect(`/portal/${token}?tab=inicio`);

  const { data: acctMins } = agent.portal_email
    ? await supabase.from('account_minutes').select('minutes_used, minutes_included').eq('portal_email', agent.portal_email).single()
    : { data: null };
  const minutesIncluded = (acctMins?.minutes_included ?? (agent as any).minutes_included ?? 0) as number;
  const minutesUsed     = (acctMins?.minutes_used ?? (agent as any).minutes_used ?? 0) as number;
  const minutesRemain   = Math.max(0, minutesIncluded - minutesUsed);

  const { data: opsAgents } = agent.portal_email
    ? await supabase.from('voice_agents').select('ai_ops_used, ai_ops_limit').eq('portal_email', agent.portal_email)
    : { data: null };
  const aiOpsUsed  = ((opsAgents ?? []) as any[]).reduce((s, a) => s + ((a.ai_ops_used  as number) ?? 0), 0);
  const aiOpsLimit = ((opsAgents ?? []) as any[]).reduce((s, a) => s + ((a.ai_ops_limit as number) ?? 0), 0);

  const { data: existingUsers } = agent.portal_email
    ? await supabase
        .from('portal_users')
        .select('id, email, name, modules, is_owner, created_at')
        .eq('account_id', agent.portal_email)
        .order('created_at', { ascending: true })
    : { data: [] };

  const hasOpsAgent = !!(agent as any).features?.outbound_calls;
  const hasStripe   = !!(agent as any).stripe_customer_id;
  const showOutbound = !!(agent as any).features?.outbound_calls;

  // Business switcher
  const { data: clientAgents } = agent.portal_email
    ? await supabase.from('voice_agents').select('business_name, logo_url, portal_token').eq('portal_email', agent.portal_email)
    : { data: [] };
  const businessGroups = [...new Map(
    (clientAgents ?? []).map((a: any) => [a.business_name, {
      business_name: a.business_name, logo_url: a.logo_url ?? null, first_token: a.portal_token,
    }])
  ).values()];

  return (
    <ThemeProvider storageKey="centinelia-portal-theme" defaultTheme="dark">
      <div className="min-h-screen flex flex-col" style={{ background: 'var(--c-bg)', color: 'var(--c-text)' }}>

        {/* Header */}
        <div style={{ background: 'var(--c-modal)', borderBottom: '1px solid rgba(108,59,255,0.18)', boxShadow: '0 2px 24px rgba(0,0,0,0.18)', position: 'sticky', top: 0, zIndex: 10 }}>
          <div className="px-4 sm:px-6 py-3 flex items-center justify-between gap-3">
            <BusinessSwitcher
              current={{ business_name: agent.business_name, logo_url: (agent as any).logo_url ?? null, first_token: token }}
              options={businessGroups}
              currentBusinessName={agent.business_name}
            />
            <div className="flex items-center gap-1.5 shrink-0">
              <NotificationBell token={token} />
              <ThemeToggle className="!text-[var(--c-text-2)] !bg-[var(--c-surface-2)]" />
              <PortalLogout />
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="flex flex-1">
          <PortalSidebar
            token={token}
            currentTab="usuarios"
            hasOpsAgent={hasOpsAgent}
            showOutbound={showOutbound}
            hasStripe={hasStripe}
            minutesRemain={minutesRemain}
            minutesIncluded={minutesIncluded}
            aiOpsUsed={aiOpsUsed}
            aiOpsLimit={aiOpsLimit}
            isOwner={true}
          />

          <div className="flex-1 min-w-0 flex flex-col">
            <div className="px-4 sm:px-6 py-6 max-w-3xl flex-1">

              <div className="mb-6">
                <h1 className="text-xl font-bold mb-1" style={{ color: 'var(--c-text)', fontFamily: 'var(--font-sora)' }}>
                  Usuarios del portal
                </h1>
                <p className="text-sm" style={{ color: 'var(--c-text-3)' }}>
                  Crea accesos para colaboradores con permisos específicos a secciones del portal.
                </p>
              </div>

              <div className="rounded-xl p-5" style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border-2)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }}>
                <SubUserManager
                  token={token}
                  initialUsers={(existingUsers ?? []) as any[]}
                />
              </div>

              {/* Info box */}
              <div className="mt-4 px-4 py-3 rounded-xl text-xs flex flex-col gap-1"
                style={{ background: 'rgba(108,59,255,0.06)', border: '1px solid rgba(108,59,255,0.15)', color: 'var(--c-text-3)' }}>
                <p className="font-semibold" style={{ color: 'var(--c-text-2)' }}>Acerca de los usuarios</p>
                <p>Cada usuario tiene su propio correo y contraseña. Al iniciar sesión, solo ven las secciones que tú les asignas.</p>
                <p>El propietario (tú) siempre tiene acceso completo.</p>
              </div>

            </div>
            <PortalFooter />
          </div>
        </div>

      </div>
    </ThemeProvider>
  );
}
