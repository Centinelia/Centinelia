export const dynamic = 'force-dynamic';

import { createAdminClient }            from '@/lib/supabase/admin';
import { cookies }                      from 'next/headers';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';
import { redirect, notFound }           from 'next/navigation';
import { ThemeProvider }                from '@/components/ThemeProvider';
import PortalLogout                     from '../PortalLogout';
import NotificationBell                 from '../NotificationBell';
import PortalFooter                     from '../PortalFooter';
import PortalShell                      from '../PortalShell';
import SubUserManager                   from './SubUserManager';
import AccountSerialBadge               from '../AccountSerialBadge';
import { getOrCreateSerial }            from '@/lib/portal/serial';
import { PageContainer } from '@/components/portal-ui';

interface Props { params: Promise<{ token: string }> }

function KpiTile({ label, value, hint, accent }: { label: string; value: number; hint?: string; accent?: boolean }) {
  return (
    <div
      className="rounded-2xl p-4"
      style={{
        background: '#ffffff',
        border:     `1px solid ${accent ? 'rgba(108,59,255,0.28)' : '#E8E3F5'}`,
        boxShadow:  accent
          ? '0 4px 12px rgba(108,59,255,0.08)'
          : '0 1px 2px rgba(26,10,59,0.04)',
      }}
    >
      <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: '#9B8FB5' }}>
        {label}
      </p>
      <div className="mt-2 flex items-baseline gap-1.5">
        <span
          className="text-[28px] font-bold leading-none tabular-nums tracking-tight"
          style={{ color: accent ? '#6C3BFF' : '#1A0A3B' }}
        >
          {value}
        </span>
        {hint && <span className="text-[11px] font-medium" style={{ color: '#6B6480' }}>{hint}</span>}
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

  // Acceso: owner siempre; sub-usuario solo si tiene el módulo 'usuarios'
  const canManageUsers = !session?.isSubUser || (session.modules ?? []).includes('usuarios');
  if (!canManageUsers) redirect(`/portal/${token}?tab=inicio`);
  const isOwnerSession = !session?.isSubUser;

  const { data: acctMins } = agent.portal_email
    ? await supabase.from('account_minutes').select('minutes_used, minutes_included').eq('portal_email', agent.portal_email).single()
    : { data: null };
  const minutesIncluded = (acctMins?.minutes_included ?? (agent as any).minutes_included ?? 0) as number;
  const minutesUsed     = (acctMins?.minutes_used ?? (agent as any).minutes_used ?? 0) as number;
  const minutesRemain   = Math.max(0, minutesIncluded - minutesUsed);

  // Pool compartido: prefiere org-level, cae a SUM per-agente si no está migrada.
  const { data: orgPool } = agent.portal_email
    ? await supabase.from('organizations')
        .select('monthly_ops_pool, monthly_ops_used')
        .eq('portal_email', agent.portal_email)
        .maybeSingle()
    : { data: null };
  let aiOpsUsed  = (orgPool?.monthly_ops_used as number | null) ?? 0;
  let aiOpsLimit = (orgPool?.monthly_ops_pool as number | null) ?? 0;
  if (!orgPool?.monthly_ops_pool) {
    const { data: opsAgents } = agent.portal_email
      ? await supabase.from('voice_agents').select('ai_ops_used, ai_ops_limit').eq('portal_email', agent.portal_email)
      : { data: null };
    aiOpsUsed  = ((opsAgents ?? []) as any[]).reduce((s, a) => s + ((a.ai_ops_used  as number) ?? 0), 0);
    aiOpsLimit = ((opsAgents ?? []) as any[]).reduce((s, a) => s + ((a.ai_ops_limit as number) ?? 0), 0);
  }

  const { data: existingUsers } = agent.portal_email
    ? await supabase
        .from('portal_users')
        .select('id, email, name, modules, is_owner, created_at')
        .eq('account_id', agent.portal_email)
        .order('created_at', { ascending: true })
    : { data: [] };

  const hasStripe    = !!(agent as any).stripe_customer_id;
  const showOutbound = !!(agent as any).features?.outbound_calls;

  const { data: clientAgents } = agent.portal_email
    ? await supabase.from('voice_agents').select('role').eq('portal_email', agent.portal_email)
    : { data: [] };

  const hasOpsAgent = (clientAgents ?? []).some((a: any) => !!(a.role as string | null));

  const accountSerial = agent.portal_email
    ? await getOrCreateSerial(agent.portal_email).catch(() => null)
    : null;

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
      currentUserId={session?.isSubUser ? session.userId : undefined}
    />
  );

  const pageBody = (
    <div className="flex-1 min-w-0 flex flex-col">
      <PageContainer>

        {/* Hero: título + KPI strip */}
        <section className="mb-6">
          <div className="mb-5">
            <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: '#9B8FB5' }}>
              Acceso
            </p>
            <h1 className="mt-1 text-xl font-bold" style={{ color: '#1A0A3B' }}>
              Usuarios y permisos
            </h1>
            <p className="text-xs mt-1" style={{ color: '#6B6480' }}>
              Crea accesos para colaboradores, asigna secciones específicas y monitorea quién ve qué del portal.
            </p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KpiTile label="Usuarios totales"    value={totalUsers}     accent />
            <KpiTile label="Con acceso completo" value={ownersCount}    hint="Propietarios" />
            <KpiTile label="Con acceso parcial"  value={subUsersCount}  hint="Colaboradores" />
            <KpiTile label="Secciones asignadas" value={uniqueModules.size} hint="Módulos únicos" />
          </div>
        </section>

        <div
          className="flex flex-col rounded-2xl overflow-hidden"
          style={{
            background: '#ffffff',
            border:     '1px solid #E8E3F5',
            boxShadow:  '0 1px 2px rgba(26,10,59,0.04)',
          }}
        >
          <div className="px-5 py-5">
            {subUserManager}
          </div>
        </div>
      </PageContainer>
      <PortalFooter token={token} />
    </div>
  );

  return (
    <ThemeProvider storageKey="centinelia-portal-theme" defaultTheme="light">
      <div className="min-h-screen flex flex-col" style={{ background: 'var(--c-bg)', color: 'var(--c-text)' }}>
        <PortalShell
          token={token}
          businessName={agent.business_name}
          logoUrl={(agent as any).logo_url ?? null}
          hasOpsAgent={hasOpsAgent}
          showOutbound={showOutbound}
          isOwner={isOwnerSession}
          modules={session?.isSubUser ? (session.modules ?? []) : undefined}
          minutesRemain={minutesRemain}
          minutesIncluded={minutesIncluded}
          aiOpsUsed={aiOpsUsed}
          aiOpsLimit={aiOpsLimit}
          hasStripe={hasStripe}
          accountSerial={accountSerial}
          headerActions={
            <>
              {accountSerial && (
                <div className="hidden sm:flex">
                  <AccountSerialBadge serial={accountSerial} variant="header" onDark />
                </div>
              )}
              <NotificationBell token={token} onDark />
              <PortalLogout onDark />
            </>
          }
          main={pageBody}
        />
      </div>
    </ThemeProvider>
  );
}
