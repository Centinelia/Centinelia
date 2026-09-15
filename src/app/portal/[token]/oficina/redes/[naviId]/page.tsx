export const dynamic = 'force-dynamic';

/**
 * Dashboard del Navi — /portal/[token]/oficina/redes/[naviId]
 *
 * Router que detecta la variante del agente:
 *   - role='navi'         → <NaviDashboard> (estándar, 1 cuenta IG)
 *   - role='navi_agencia' → placeholder con link al dashboard de agencia (Task 13)
 *
 * Seguridad: verifySession + resolveOrgFromToken + IDOR (agent.portal_email === org) (R72).
 * Feature gate: social_publishing.enabled en organizations.features (R75).
 */
import { cookies }                      from 'next/headers';
import { redirect, notFound }           from 'next/navigation';
import Link                             from 'next/link';
import { Share2, ArrowRight }           from 'lucide-react';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';
import { resolveOrgFromToken }          from '@/lib/portal/org-token';
import { socialPublishingEnabled }      from '@/lib/feature-flags/social-publishing';
import { createAdminClient }            from '@/lib/supabase/admin';
import OficinaPageHero                  from '../../OficinaPageHero';
import NaviDashboard                    from '@/components/portal/redes/NaviDashboard';

interface Props { params: Promise<{ token: string; naviId: string }> }

interface NaviRow {
  id:            string;
  agent_name:    string | null;
  role:          string;
  portal_email:  string | null;
}

interface SocialAccountRow {
  id:                string;
  external_username: string | null;
  paused:            boolean;
  paused_reason?:    string | null;
  status:            string;
}

/** Placeholder visible cuando el agente es navi_agencia (Task 13 lo shippea completo). */
function AgenciaPlaceholder({ token, naviId, name }: { token: string; naviId: string; name: string | null }) {
  return (
    <div className="flex flex-col gap-6 max-w-lg">
      <OficinaPageHero
        icon={Share2}
        eyebrow="Gestor de redes Agencia"
        title={name ?? 'Navi Agencia'}
        description="Este Navi gestiona múltiples cuentas de Instagram."
      />
      <div
        className="rounded-2xl p-6 flex flex-col gap-4"
        style={{ background: '#F8F7FF', border: '1px solid rgba(108,59,255,0.2)' }}
      >
        <p className="text-[14px]" style={{ color: '#1A0A3B' }}>
          El dashboard de Navi Agencia te permite ver y gestionar todas las cuentas
          de Instagram que este gestor administra en un solo lugar.
        </p>
        <Link
          href={`/portal/${token}/oficina/redes/${naviId}/agencia`}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-[13px] font-semibold self-start transition-opacity"
          style={{ background: '#6C3BFF', color: '#fff' }}
        >
          Ir al dashboard de agencia
          <ArrowRight size={14} />
        </Link>
      </div>
    </div>
  );
}

export default async function NaviDashboardPage({ params }: Props) {
  const { token, naviId } = await params;

  // Verificar sesión
  const cookieStore = await cookies();
  const session     = await verifySession(cookieStore.get(PORTAL_COOKIE)?.value ?? '');

  // Resolver org
  const supabase = createAdminClient();
  const resolved = await resolveOrgFromToken(token);
  if (!resolved) notFound();

  // IDOR: sesión vs org
  if (session?.portalEmail && session.portalEmail !== resolved.portalEmail) {
    redirect('/portal/login');
  }

  // Feature gate
  const { data: org } = await supabase
    .from('organizations')
    .select('features')
    .eq('portal_email', resolved.portalEmail)
    .maybeSingle();

  if (!socialPublishingEnabled(org?.features)) {
    redirect(`/portal/${token}/oficina?tab=redes-disabled`);
  }

  // Obtener el agente Navi (IDOR: portal_email debe pertenecer a este org)
  const { data: navi } = await supabase
    .from('voice_agents')
    .select('id, agent_name, role, portal_email')
    .eq('id', naviId)
    .maybeSingle() as { data: NaviRow | null };

  if (!navi) notFound();

  // Verificar que el agente pertenece a este org (IDOR a nivel de agente)
  if (navi.portal_email !== resolved.portalEmail) {
    // Agente de otra org — tratar como not found por seguridad
    notFound();
  }

  // Para Navi estándar: obtener la cuenta de IG conectada
  let socialAccount: SocialAccountRow | null = null;
  if (navi.role === 'navi') {
    const { data: acc } = await supabase
      .from('social_accounts')
      .select('id, external_username, paused, paused_reason, status')
      .eq('agent_id', naviId)
      .eq('portal_email', resolved.portalEmail)
      .eq('provider', 'meta_instagram')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle() as { data: SocialAccountRow | null };
    socialAccount = acc;
  }

  // Variante agencia
  if (navi.role === 'navi_agencia') {
    return <AgenciaPlaceholder token={token} naviId={naviId} name={navi.agent_name} />;
  }

  // Variante estándar
  return (
    <div className="flex flex-col gap-6">
      <OficinaPageHero
        icon={Share2}
        eyebrow="Gestor de redes"
        title={navi.agent_name ?? 'Navi'}
        description={
          socialAccount?.external_username
            ? `Instagram: @${socialAccount.external_username}`
            : 'Sin cuenta de Instagram conectada aún.'
        }
      />
      <NaviDashboard
        token={token}
        naviId={naviId}
        navi={{
          id:             navi.id,
          agent_name:     navi.agent_name,
          social_account: socialAccount,
        }}
      />
    </div>
  );
}
