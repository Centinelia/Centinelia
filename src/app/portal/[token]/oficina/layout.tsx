export const dynamic = 'force-dynamic';

import { createAdminClient }            from '@/lib/supabase/admin';
import { getPrimaryAgentFromToken }     from '@/lib/portal/org-token';
import { notFound, redirect }           from 'next/navigation';
import { cookies }                      from 'next/headers';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';
import { ThemeProvider }                from '@/components/ThemeProvider';

import OficinaSidebarV2                 from './OficinaSidebarV2';
import OficinaHeaderDark                from './OficinaHeaderDark';
import OficinaMobileNav                 from './OficinaMobileNav';
import PortalFooter                     from '../PortalFooter';
import { loadPoolStatus }               from '@/lib/portal/pool-status';

// Next.js 15 generates Promise<unknown> for nested layout params;
// use Promise<any> so the type is compatible at the call site.
export default async function OficinaLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  params: Promise<any>;
}) {
  const { token } = (await params) as { token: string };

  const cookieStore = await cookies();
  const session     = await verifySession(cookieStore.get(PORTAL_COOKIE)?.value ?? '');

  const supabase = createAdminClient();
  const agent = await getPrimaryAgentFromToken<{ business_name: string; logo_url: string | null; portal_email: string | null; minutes_included: number | null; minutes_used: number | null; ai_ops_used: number | null; ai_ops_limit: number | null; stripe_customer_id: string | null; features: Record<string, unknown> | null; agent_name: string | null }>(
    token,
    'business_name, logo_url, portal_email, minutes_included, minutes_used, ai_ops_used, ai_ops_limit, stripe_customer_id, features, agent_name',
    supabase,
  );
  if (!agent) notFound();

  if (session?.portalEmail && agent.portal_email && agent.portal_email !== session.portalEmail)
    redirect('/portal/login');

  // || (no ??): dev bypass puede devolver portalEmail: '' — ver
  // agentes/page.tsx para el detalle del bug.
  const lookupEmail = session?.portalEmail || agent.portal_email || null;

  // Pool status (minutos + tareas) — fuente única de verdad. Ver
  // [[feedback-audit-read-path-fidelity]] y src/lib/portal/pool-status.ts:
  // este helper centraliza el fallback ladder para que TODAS las vistas del
  // portal muestren los mismos números. También necesitamos logo_url org-level
  // aparte, así que lo pedimos con un query dedicado.
  const [poolStatus, { data: orgMeta }] = await Promise.all([
    loadPoolStatus(supabase, lookupEmail, agent as any),
    lookupEmail
      ? supabase.from('organizations').select('logo_url, invoicing_provider').eq('portal_email', lookupEmail).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const { minutesIncluded, minutesUsed, minutesRemain, aiOpsUsed, aiOpsLimit } = poolStatus;
  const orgLogoUrl   = (orgMeta?.logo_url as string | null) ?? null;
  const hasStripe    = !!(agent as any).stripe_customer_id;
  const hasInvoicing = !!(orgMeta as any)?.invoicing_provider;
  const vertical     = ((agent as any).features as any)?.vertical as string | undefined;
  const modules      = session?.isSubUser ? (session.modules ?? []) : undefined;

  // Business switcher options
  const { data: clientAgents } = lookupEmail
    ? await supabase.from('voice_agents').select('business_name, logo_url, portal_token').eq('portal_email', lookupEmail)
    : { data: [] };

  // Dedup por business_name PREFIRIENDO el peer que sí tiene logo. Antes:
  // si Niva era el primero del map (sin logo) su null ganaba y todo el
  // business quedaba sin logo aunque otros peers sí lo tuvieran.
  const businessGroups = [...(clientAgents ?? []).reduce((map: Map<string, { business_name: string; logo_url: string | null; first_token: string }>, a: any) => {
    const existing = map.get(a.business_name);
    if (!existing) {
      map.set(a.business_name, { business_name: a.business_name, logo_url: a.logo_url ?? null, first_token: a.portal_token });
    } else if (!existing.logo_url && a.logo_url) {
      map.set(a.business_name, { ...existing, logo_url: a.logo_url });
    }
    return map;
  }, new Map()).values()];

  // ── Unread badge counts ──────────────────────────────────────────────────
  const badges: Record<string, number> = { bandeja: 0, contratos: 0, juntas: 0, reportes: 0 };

  if (lookupEmail) {
    try {
      const { data: aIds } = await supabase
        .from('voice_agents').select('id').eq('portal_email', lookupEmail);
      const agentIds = (aIds ?? []).map((a: any) => a.id as string);

      if (agentIds.length > 0) {
        const cutoff = new Date(Date.now() - 30 * 86400000).toISOString();

        const [inboxR, contractR, meetingR] = await Promise.all([
          supabase.from('portal_read_receipts').select('item_id').eq('portal_email', lookupEmail).eq('item_type', 'inbox'),
          supabase.from('portal_read_receipts').select('item_id').eq('portal_email', lookupEmail).eq('item_type', 'contract'),
          supabase.from('portal_read_receipts').select('item_id').eq('portal_email', lookupEmail).eq('item_type', 'meeting'),
        ]);

        const readInbox    = (inboxR.data    ?? []).map((r: any) => r.item_id as string);
        const readContract = (contractR.data ?? []).map((r: any) => r.item_id as string);
        const readMeeting  = (meetingR.data  ?? []).map((r: any) => r.item_id as string);

        let inboxQ = supabase.from('ops_inbox')
          .select('id', { count: 'exact', head: true })
          .in('agent_id', agentIds)
          .in('status', ['pending', 'escalated', 'info_requested'])
          .gte('created_at', cutoff);
        if (readInbox.length > 0)
          inboxQ = inboxQ.not('id', 'in', `(${readInbox.join(',')})`);
        const { count: ic } = await inboxQ;

        const { count: hrc } = await supabase
          .from('human_requests')
          .select('id', { count: 'exact', head: true })
          .in('agent_id', agentIds)
          .in('status', ['pending', 'escalated'])
          .gte('created_at', cutoff);

        badges.bandeja = (ic ?? 0) + (hrc ?? 0);

        let contractQ = supabase.from('ops_contracts')
          .select('id', { count: 'exact', head: true })
          .in('agent_id', agentIds).gte('created_at', cutoff);
        if (readContract.length > 0)
          contractQ = contractQ.not('id', 'in', `(${readContract.join(',')})`);
        const { count: cc } = await contractQ;
        badges.contratos = cc ?? 0;

        let meetingQ = supabase.from('ops_meetings')
          .select('id', { count: 'exact', head: true })
          .in('agent_id', agentIds).eq('status', 'done').gte('created_at', cutoff);
        if (readMeeting.length > 0)
          meetingQ = meetingQ.not('id', 'in', `(${readMeeting.join(',')})`);
        const { count: mc } = await meetingQ;
        badges.juntas = mc ?? 0;

        const { count: hrc2 } = await supabase
          .from('heartbeat_runs')
          .select('id', { count: 'exact', head: true })
          .eq('portal_email', lookupEmail)
          .is('read_at', null)
          .gte('ran_at', cutoff);
        badges.reportes = hrc2 ?? 0;
      }
    } catch {
      // portal_read_receipts table may not exist yet; badges default to 0
    }
  }

  return (
    <ThemeProvider storageKey="centinelia-portal-theme" defaultTheme="light">
      <div className="min-h-screen flex flex-col" style={{ background: '#FAFAFB', color: '#1A0A3B' }}>
        <OficinaHeaderDark
          token={token}
          businessName={agent.business_name}
          logoUrl={
            // org-level primero (fuente de verdad después de la migración
            // 20260809_organizations_logo_url). Fallback a voice_agents por
            // si algún cliente subió logo después de la migration snapshot y
            // aún no se ha sync'd al org (edge case, safety net).
            orgLogoUrl
              ?? (agent as any).logo_url
              ?? (clientAgents ?? []).find((a: any) => a.business_name === agent.business_name && a.logo_url)?.logo_url
              ?? null
          }
          businessOptions={businessGroups}
          mobileNav={
            <OficinaMobileNav
              token={token}
              badges={badges}
              minutesRemain={minutesRemain}
              minutesIncluded={minutesIncluded}
              aiOpsUsed={aiOpsUsed}
              aiOpsLimit={aiOpsLimit}
              hasStripe={hasStripe}
              vertical={vertical}
              modules={modules}
              hasInvoicing={hasInvoicing}
            />
          }
        />

        <div className="flex flex-1 min-h-0">
          <OficinaSidebarV2
            token={token}
            badges={badges}
            minutesRemain={minutesRemain}
            minutesIncluded={minutesIncluded}
            aiOpsUsed={aiOpsUsed}
            aiOpsLimit={aiOpsLimit}
            hasStripe={hasStripe}
            vertical={vertical}
            modules={modules}
            hasInvoicing={hasInvoicing}
          />
          <main className="flex-1 min-w-0 flex flex-col">
            <div className="px-4 sm:px-6 py-6 flex-1">
              {children}
            </div>
            <PortalFooter token={token} />
          </main>
        </div>
      </div>
    </ThemeProvider>
  );
}
