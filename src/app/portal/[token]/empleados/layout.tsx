export const dynamic = 'force-dynamic';

import { createAdminClient }            from '@/lib/supabase/admin';
import { getPrimaryAgentFromToken }     from '@/lib/portal/org-token';
import { notFound, redirect }           from 'next/navigation';
import { cookies }                      from 'next/headers';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';
import { ThemeProvider }                from '@/components/ThemeProvider';
import PortalLogout                     from '../PortalLogout';
import PortalShell                      from '../PortalShell';
import NotificationBell                 from '../NotificationBell';
import PortalFooter                     from '../PortalFooter';
import { getOrCreateSerial }            from '@/lib/portal/serial';
import { loadPoolStatus }               from '@/lib/portal/pool-status';

export default async function AgentesLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<any>; // eslint-disable-line @typescript-eslint/no-explicit-any
}) {
  const { token } = (await params) as { token: string };

  const cookieStore = await cookies();
  const session     = await verifySession(cookieStore.get(PORTAL_COOKIE)?.value ?? '');

  const isOwner = !session?.isSubUser;
  const modules = session?.isSubUser ? (session.modules ?? []) : undefined;

  const supabase = createAdminClient();
  const agent = await getPrimaryAgentFromToken<{ business_name: string; logo_url: string | null; portal_email: string | null; features: Record<string, unknown> | null; stripe_customer_id: string | null; minutes_included: number | null; minutes_used: number | null; ai_ops_used: number | null; ai_ops_limit: number | null }>(
    token,
    'business_name, logo_url, portal_email, features, stripe_customer_id, minutes_included, minutes_used, ai_ops_used, ai_ops_limit',
    supabase,
  );
  if (!agent) notFound();

  if (session?.portalEmail && agent.portal_email && agent.portal_email !== session.portalEmail)
    redirect('/portal/login');

  // || (no ??): en dev verifySession puede devolver portalEmail: '' — ver
  // agentes/page.tsx para el detalle del bug.
  const lookupEmail = session?.portalEmail || agent.portal_email || null;

  const { data: clientAgents } = lookupEmail
    ? await supabase
        .from('voice_agents')
        .select('business_name, logo_url, portal_token, role, features')
        .eq('portal_email', lookupEmail)
    : { data: [] };

  const allClientAgents = clientAgents ?? [];

  const hasOpsAgent  = allClientAgents.some((a: any) => !!(a.role as string | null)); // eslint-disable-line @typescript-eslint/no-explicit-any
  // Fix 2026-08-09: showOutbound antes solo checkeaba el agente primario
  // (dueño del portal_token). Ahora acepta si CUALQUIER peer del equipo
  // tiene outbound_calls activado. Mismo patrón corregido en varios lugares.
  const showOutbound = !!(agent.features as any)?.outbound_calls // eslint-disable-line @typescript-eslint/no-explicit-any
    || allClientAgents.some((a: any) => !!((a.features as any)?.outbound_calls)); // eslint-disable-line @typescript-eslint/no-explicit-any
  const hasStripe    = !!(agent as any).stripe_customer_id;
  const accountSerial = lookupEmail ? await getOrCreateSerial(lookupEmail).catch(() => null) : null;

  // Pool status via helper — ver src/lib/portal/pool-status.ts. Cubre el
  // bug de fallback ladder (`??` sobre 0) + falta de check ops_ledger_enabled
  // que este layout tenía antes (mostraba `monthly_ops_used` legacy congelado
  // post-flip).
  const { minutesIncluded, minutesUsed, minutesRemain, aiOpsUsed, aiOpsLimit } =
    await loadPoolStatus(supabase, lookupEmail, agent as any);

  const mainColumn = (
    <div className="flex-1 min-w-0 flex flex-col">
      <div className="px-4 sm:px-6 py-6 flex-1">
        {children}
      </div>
      <PortalFooter token={token} />
    </div>
  );

  return (
    <ThemeProvider storageKey="centinelia-portal-theme" defaultTheme="light">
      <div className="min-h-screen flex flex-col" style={{ background: '#FAFAFB', color: '#1A0A3B' }}>
        <PortalShell
          token={token}
          businessName={agent.business_name}
          logoUrl={(agent as any).logo_url ?? null}
          hasOpsAgent={hasOpsAgent}
          showOutbound={showOutbound}
          minutesRemain={minutesRemain}
          minutesIncluded={minutesIncluded}
          aiOpsUsed={aiOpsUsed}
          aiOpsLimit={aiOpsLimit}
          hasStripe={hasStripe}
          accountSerial={accountSerial}
          isOwner={isOwner}
          modules={modules}
          headerActions={
            <>
              <NotificationBell token={token} onDark />
              <PortalLogout onDark />
            </>
          }
          main={mainColumn}
        />
      </div>
    </ThemeProvider>
  );
}
