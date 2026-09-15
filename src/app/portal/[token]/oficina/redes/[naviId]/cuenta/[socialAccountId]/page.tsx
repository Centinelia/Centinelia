export const dynamic = 'force-dynamic';

/**
 * Detalle de cuenta — /portal/[token]/oficina/redes/[naviId]/cuenta/[socialAccountId]
 *
 * Vista de detalle de UNA cuenta gestionada por el Navi Agencia.
 * Mismo layout que NaviDashboard pero filtrado por social_account_id:
 *   - BandejaAprobacion filtrada por cuenta
 *   - KillSwitchToggle scope='account'
 *   - Links de navegacion a la cuenta seleccionada
 *
 * Seguridad: verifySession + resolveOrgFromToken + IDOR en agente + IDOR en cuenta.
 */
import { cookies }                      from 'next/headers';
import { redirect, notFound }           from 'next/navigation';
import Link                             from 'next/link';
import { AtSign, Share2, ChevronLeft }  from 'lucide-react';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';
import { resolveOrgFromToken }          from '@/lib/portal/org-token';
import { socialPublishingEnabled }      from '@/lib/feature-flags/social-publishing';
import { createAdminClient }            from '@/lib/supabase/admin';
import OficinaPageHero                  from '../../../../OficinaPageHero';
import NaviDashboard                    from '@/components/portal/redes/NaviDashboard';

interface Props {
  params: Promise<{ token: string; naviId: string; socialAccountId: string }>;
}

interface SocialAccountRow {
  id:                string;
  external_username: string | null;
  paused:            boolean;
  paused_reason?:    string | null;
  status:            string;
}

interface NaviRow {
  id:           string;
  agent_name:   string | null;
  role:         string;
  portal_email: string | null;
}

export default async function SocialAccountDetailPage({ params }: Props) {
  const { token, naviId, socialAccountId } = await params;

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
    .select('id, agent_name, role, portal_email')
    .eq('id', naviId)
    .eq('portal_email', resolved.portalEmail)
    .maybeSingle() as { data: NaviRow | null };

  if (!navi) notFound();

  // IDOR: la cuenta social pertenece a este agente y org
  const { data: account } = await supabase
    .from('social_accounts')
    .select('id, external_username, paused, paused_reason, status')
    .eq('id', socialAccountId)
    .eq('agent_id', naviId)
    .eq('portal_email', resolved.portalEmail)
    .maybeSingle() as { data: SocialAccountRow | null };

  if (!account) notFound();

  return (
    <div className="flex flex-col gap-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2">
        <Link
          href={`/portal/${token}/oficina/redes/${naviId}`}
          className="flex items-center gap-1 text-[12px] font-medium transition-opacity"
          style={{ color: '#6C3BFF' }}
        >
          <ChevronLeft size={13} />
          {navi.agent_name ?? 'Navi Agencia'}
        </Link>
        <span style={{ color: '#CBD5E1' }}>/</span>
        <span className="text-[12px]" style={{ color: '#6B6480' }}>
          {account.external_username ? `@${account.external_username}` : 'Cuenta'}
        </span>
      </div>

      <OficinaPageHero
        icon={Share2}
        eyebrow="Navi Agencia"
        title={account.external_username ? `@${account.external_username}` : 'Cuenta de Instagram'}
        description={`Gestionada por ${navi.agent_name ?? 'Navi Agencia'}`}
        right={
          <Link
            href={`/portal/${token}/oficina/redes/${naviId}/cuentas`}
            className="flex items-center gap-1.5 text-[12px] font-medium"
            style={{ color: '#6C3BFF' }}
          >
            <AtSign size={13} />
            Ver todas las cuentas
          </Link>
        }
      />

      {/* Reutiliza NaviDashboard con socialAccountId para filtrar */}
      <NaviDashboard
        token={token}
        naviId={naviId}
        navi={{
          id:             navi.id,
          agent_name:     navi.agent_name,
          social_account: account,
        }}
        socialAccountId={socialAccountId}
      />
    </div>
  );
}
