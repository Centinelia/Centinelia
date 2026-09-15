export const dynamic = 'force-dynamic';

/**
 * Cross-account — /portal/[token]/oficina/redes/[naviId]/cross-account
 *
 * Calendario cruzado (grid mensual con posts de todas las cuentas del portfolio)
 * y widget CrossAccountReplicator para replicar contenido entre cuentas.
 *
 * Seguridad: verifySession + resolveOrgFromToken + IDOR (R72).
 * Feature gate: social_publishing.enabled (R75).
 */
import { cookies }                      from 'next/headers';
import { redirect, notFound }           from 'next/navigation';
import Link                             from 'next/link';
import { GitMerge, ChevronLeft }        from 'lucide-react';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';
import { resolveOrgFromToken }          from '@/lib/portal/org-token';
import { socialPublishingEnabled }      from '@/lib/feature-flags/social-publishing';
import { createAdminClient }            from '@/lib/supabase/admin';
import OficinaPageHero                  from '../../../OficinaPageHero';
import CrossAccountView                 from './CrossAccountView';
import CrossAccountReplicator           from '@/components/portal/redes/CrossAccountReplicator';

interface Props { params: Promise<{ token: string; naviId: string }> }

interface SocialAccountRow {
  id:                string;
  external_username: string | null;
  status:            string;
  paused:            boolean;
}

export default async function CrossAccountPage({ params }: Props) {
  const { token, naviId } = await params;

  const cookieStore = await cookies();
  const session     = await verifySession(cookieStore.get(PORTAL_COOKIE)?.value ?? '');

  const supabase = createAdminClient();
  const resolved = await resolveOrgFromToken(token);
  if (!resolved) notFound();

  if (session?.portalEmail && session.portalEmail !== resolved.portalEmail) {
    redirect('/portal/login');
  }

  const { data: org } = await supabase
    .from('organizations')
    .select('features')
    .eq('portal_email', resolved.portalEmail)
    .maybeSingle();

  if (!socialPublishingEnabled(org?.features)) {
    redirect(`/portal/${token}/oficina?tab=redes-disabled`);
  }

  // IDOR: agente pertenece a esta org
  const { data: navi } = await supabase
    .from('voice_agents')
    .select('id, agent_name, portal_email')
    .eq('id', naviId)
    .eq('portal_email', resolved.portalEmail)
    .maybeSingle() as { data: { id: string; agent_name: string | null; portal_email: string } | null };

  if (!navi) notFound();

  // Cargar todas las cuentas activas
  const { data: accounts } = await supabase
    .from('social_accounts')
    .select('id, external_username, status, paused')
    .eq('agent_id', naviId)
    .eq('portal_email', resolved.portalEmail)
    .neq('status', 'disconnected')
    .order('created_at', { ascending: true }) as { data: SocialAccountRow[] | null };

  // Cargar borradores del mes actual para el calendario cross-account
  const now        = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  const { data: drafts } = await supabase
    .from('content_drafts')
    .select('id, scheduled_for, caption, status, social_account_id')
    .eq('agent_id', naviId)
    .eq('portal_email', resolved.portalEmail)
    .gte('scheduled_for', `${currentMonth}-01`)
    .lte('scheduled_for', `${currentMonth}-31`)
    .in('status', ['approved', 'scheduled'])
    .order('scheduled_for', { ascending: true }) as {
      data: Array<{
        id: string;
        scheduled_for: string | null;
        caption: string | null;
        status: string;
        social_account_id: string | null;
      }> | null;
    };

  const accountList = accounts ?? [];

  return (
    <div className="flex flex-col gap-6 max-w-5xl">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2">
        <Link
          href={`/portal/${token}/oficina/redes/${naviId}`}
          className="flex items-center gap-1 text-[12px] font-medium"
          style={{ color: '#6C3BFF' }}
        >
          <ChevronLeft size={13} />
          {navi.agent_name ?? 'Navi Agencia'}
        </Link>
        <span style={{ color: '#CBD5E1' }}>/</span>
        <span className="text-[12px]" style={{ color: '#6B6480' }}>Cross-account</span>
      </div>

      <OficinaPageHero
        icon={GitMerge}
        eyebrow="Navi Agencia"
        title="Cross-account"
        description="Calendario consolidado y replicador de contenido entre cuentas del portfolio."
      />

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6">
        {/* Calendario cruzado */}
        <CrossAccountView
          accounts={accountList}
          drafts={drafts ?? []}
          currentMonth={currentMonth}
        />

        {/* Replicador */}
        <CrossAccountReplicator
          token={token}
          naviId={naviId}
          accounts={accountList}
        />
      </div>
    </div>
  );
}
