export const dynamic = 'force-dynamic';

import { createAdminClient }            from '@/lib/supabase/admin';
import { cookies }                      from 'next/headers';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';
import { redirect, notFound }           from 'next/navigation';
import { ThemeProvider }                from '@/components/ThemeProvider';
import BusinessSwitcher                 from '../BusinessSwitcher';
import PortalLogout                     from '../PortalLogout';
import NotificationBell                 from '../NotificationBell';
import PortalFooter                     from '../PortalFooter';
import PortalSidebar                    from '../PortalSidebar';
import PortalShell                      from '../PortalShell';
import SubUserManager                   from './SubUserManager';
import AccountSerialBadge               from '../AccountSerialBadge';
import { getOrCreateSerial }            from '@/lib/portal/serial';
import { isPortalV2Enabled }            from '@/lib/portal/portal-v2-flag';
import { PageContainer, Card } from '@/components/portal-ui';

interface Props { params: Promise<{ token: string }> }

function KpiTile({ label, value, hint, accent }: { label: string; value: number; hint?: string; accent?: boolean }) {
  return (
    <div
      className="rounded-xl p-4"
      style={{
        background: accent ? 'rgba(108,59,255,0.06)' : 'var(--c-surface)',
        border:     `1px solid ${accent ? 'rgba(108,59,255,0.22)' : 'var(--c-border-2)'}`,
      }}
    >
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em]" style={{ color: 'var(--c-text-3)' }}>
        {label}
      </p>
      <div className="mt-2 flex items-baseline gap-2">
        <span
          className="text-2xl font-semibold leading-none"
          style={{ color: accent ? '#6C3BFF' : 'var(--c-text)', letterSpacing: '-0.01em', fontVariantNumeric: 'tabular-nums' }}
        >
          {value}
        </span>
        {hint && <span className="text-[11px]" style={{ color: 'var(--c-text-4)' }}>{hint}</span>}
      </div>
    </div>
  );
}

export default async function UsuariosPage({ params }: Props) {
  const { token }   = await params;
  const cookieStore = await cookies();
  const session     = await verifySession(cookieStore.get(PORTAL_COOKIE)?.value ?? '');

  const supabase = createAdminClient();
  const { data: agent } = await supabase
    .from('voice_agents')
    .select('portal_email, business_name, logo_url, active, billing_status, plan, stripe_customer_id, features, giro_template, minutes_included, minutes_used, ai_ops_used, ai_ops_limit')
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

  const hasStripe    = !!(agent as any).stripe_customer_id;
  const showOutbound = !!(agent as any).features?.outbound_calls;

  // Business switcher — also used to determine hasOpsAgent (any agent with a role)
  const { data: clientAgents } = agent.portal_email
    ? await supabase.from('voice_agents').select('business_name, logo_url, portal_token, role').eq('portal_email', agent.portal_email)
    : { data: [] };

  const hasOpsAgent = (clientAgents ?? []).some((a: any) => !!(a.role as string | null));
  const businessGroups = [...new Map(
    (clientAgents ?? []).map((a: any) => [a.business_name, {
      business_name: a.business_name, logo_url: a.logo_url ?? null, first_token: a.portal_token,
    }])
  ).values()];

  const accountSerial = agent.portal_email
    ? await getOrCreateSerial(agent.portal_email).catch(() => null)
    : null;

  // V2 flag
  const v2Enabled = agent.portal_email
    ? await isPortalV2Enabled(agent.portal_email)
    : false;

  const users        = (existingUsers ?? []) as { is_owner: boolean; modules: string[] }[];
  const totalUsers   = users.length;
  const ownersCount  = users.filter(u => u.is_owner).length;
  const subUsersCount = totalUsers - ownersCount;
  const uniqueModules = new Set<string>();
  for (const u of users) if (!u.is_owner) for (const m of (u.modules ?? [])) uniqueModules.add(m);

  const subUserManager = (
    <SubUserManager
      token={token}
      initialUsers={(existingUsers ?? []) as any[]}
      accountGiro={(agent as any).features?.vertical ?? undefined}
      accountSerial={accountSerial ?? undefined}
    />
  );

  // V1 body — legacy inline styling with --c-* tokens
  const pageBodyV1 = (
    <div className="flex-1 min-w-0 flex flex-col">
      <div className="px-4 sm:px-6 py-6 flex-1">
        <div className="mb-6">
          <h1 className="text-xl font-bold mb-1" style={{ color: 'var(--c-text)', fontFamily: 'var(--font-sora)' }}>
            Usuarios del portal
          </h1>
          <p className="text-sm" style={{ color: 'var(--c-text-3)' }}>
            Crea accesos para colaboradores con permisos específicos a secciones del portal.
          </p>
        </div>

        <div className="rounded-xl p-5" style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border-2)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }}>
          {subUserManager}
        </div>
      </div>
      <PortalFooter token={token} />
    </div>
  );

  // V2 body — design system (PageContainer + PageSection + SectionHeader + Card)
  const pageBodyV2 = (
    <div className="flex-1 min-w-0 flex flex-col">
      <PageContainer>

        {/* Hero: título + KPI strip */}
        <section className="mb-6">
          <div className="mb-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: 'var(--c-text-3)' }}>
              Acceso
            </p>
            <h1 className="mt-1 text-2xl font-semibold leading-tight" style={{ color: 'var(--c-text)', letterSpacing: '-0.01em' }}>
              Usuarios y permisos
            </h1>
            <p className="mt-1.5 text-sm max-w-xl" style={{ color: 'var(--c-text-3)' }}>
              Crea accesos para colaboradores, asigna secciones específicas y monitorea quién ve qué del portal.
            </p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KpiTile label="Usuarios totales"   value={totalUsers}     accent />
            <KpiTile label="Con acceso completo" value={ownersCount}   hint="Propietarios" />
            <KpiTile label="Con acceso parcial"  value={subUsersCount} hint="Colaboradores" />
            <KpiTile label="Secciones asignadas" value={uniqueModules.size} hint="Módulos únicos" />
          </div>
        </section>

        <Card padding="lg">{subUserManager}</Card>
      </PageContainer>
      <PortalFooter token={token} />
    </div>
  );

  // V2 layout
  if (v2Enabled) {
    return (
      <ThemeProvider storageKey="centinelia-portal-theme" defaultTheme="light">
        <div className="min-h-screen flex flex-col" style={{ background: 'var(--c-bg)', color: 'var(--c-text)' }}>
          <PortalShell
            orgId={agent.portal_email ?? ''}
            token={token}
            businessName={agent.business_name}
            logoUrl={(agent as any).logo_url ?? null}
            hasOpsAgent={hasOpsAgent}
            showOutbound={showOutbound}
            isOwner={true}
            minutesRemain={minutesRemain}
            minutesIncluded={minutesIncluded}
            aiOpsUsed={aiOpsUsed}
            aiOpsLimit={aiOpsLimit}
            hasStripe={hasStripe}
            headerActions={
              <>
                {accountSerial && <AccountSerialBadge serial={accountSerial} variant="header" onDark />}
                <NotificationBell token={token} onDark />
                <PortalLogout onDark />
              </>
            }
            main={pageBodyV2}
          />
        </div>
      </ThemeProvider>
    );
  }

  // V1 layout
  return (
    <ThemeProvider storageKey="centinelia-portal-theme" defaultTheme="light">
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
              {accountSerial && <AccountSerialBadge serial={accountSerial} variant="header" />}
              <NotificationBell token={token} />
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
          {pageBodyV1}
        </div>

      </div>
    </ThemeProvider>
  );
}
