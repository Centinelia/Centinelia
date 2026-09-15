export const dynamic = 'force-dynamic';

/**
 * Hub multi-Navi — /portal/[token]/oficina/redes
 *
 * Lista todos los voice_agents con role IN ('navi','navi_agencia') activos del org.
 * Si solo hay 1, redirige inmediatamente a su dashboard.
 * Si hay 0, redirige al portal con tab=redes-disabled.
 * Protegido por feature flag social_publishing.enabled (R75).
 * IDOR: verifySession + resolveOrgFromToken + agent.portal_email check (R72).
 */
import { cookies }                     from 'next/headers';
import { redirect, notFound }          from 'next/navigation';
import Link                            from 'next/link';
import { Share2, AtSign, Users }       from 'lucide-react';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';
import { resolveOrgFromToken }          from '@/lib/portal/org-token';
import { socialPublishingEnabled }      from '@/lib/feature-flags/social-publishing';
import { createAdminClient }            from '@/lib/supabase/admin';
import OficinaPageHero                  from '../OficinaPageHero';

interface Props { params: Promise<{ token: string }> }

interface NaviAgent {
  id:            string;
  agent_name:    string | null;
  role:          string;
  portal_email:  string | null;
}

interface SocialAccount {
  agent_id:          string;
  external_username: string | null;
}

/** Color de avatar determinístico por agent_id (4 colores de la paleta Centinelia). */
function avatarColor(id: string): string {
  const colors = ['#6C3BFF', '#14B8A6', '#F59E0B', '#3B82F6'];
  const sum     = id.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return colors[sum % colors.length];
}

/** Primera letra del nombre del agente. */
function agentInitial(name: string | null): string {
  return (name ?? 'N').charAt(0).toUpperCase();
}

export default async function RedesHubPage({ params }: Props) {
  const { token } = await params;

  // Verificar sesión
  const cookieStore = await cookies();
  const session     = await verifySession(cookieStore.get(PORTAL_COOKIE)?.value ?? '');

  // Resolver org desde token
  const supabase = createAdminClient();
  const resolved = await resolveOrgFromToken(token);
  if (!resolved) notFound();

  // IDOR: sesión vs org
  if (session?.portalEmail && session.portalEmail !== resolved.portalEmail) {
    redirect('/portal/login');
  }

  // Buscar org en organizations para obtener features
  const { data: org } = await supabase
    .from('organizations')
    .select('features')
    .eq('portal_email', resolved.portalEmail)
    .maybeSingle();

  // Feature gate (R75)
  if (!socialPublishingEnabled(org?.features)) {
    redirect(`/portal/${token}/oficina?tab=redes-disabled`);
  }

  // Obtener agentes Navi activos del org
  const { data: naviAgents } = await supabase
    .from('voice_agents')
    .select('id, agent_name, role, portal_email')
    .eq('portal_email', resolved.portalEmail)
    .in('role', ['navi', 'navi_agencia'])
    .eq('active', true)
    .order('created_at', { ascending: true });

  const navi = (naviAgents ?? []) as NaviAgent[];

  // Si solo hay 1 Navi → redirect inmediato a su dashboard (R76)
  if (navi.length === 1) {
    redirect(`/portal/${token}/oficina/redes/${navi[0].id}`);
  }

  // Si no hay ninguno → redirect al portal
  if (navi.length === 0) {
    redirect(`/portal/${token}/oficina?tab=redes-disabled`);
  }

  // Para Navi estándar: obtener el handle de IG (primer social_account por agente)
  const naviIds  = navi.filter(n => n.role === 'navi').map(n => n.id);
  let accountsByAgent: Record<string, string | null> = {};

  if (naviIds.length > 0) {
    const { data: accounts } = await supabase
      .from('social_accounts')
      .select('agent_id, external_username')
      .in('agent_id', naviIds)
      .eq('provider', 'meta_instagram')
      .eq('status', 'active')
      .order('created_at', { ascending: true });

    // Solo el primero por agente
    for (const acc of (accounts ?? []) as SocialAccount[]) {
      if (!accountsByAgent[acc.agent_id]) {
        accountsByAgent[acc.agent_id] = acc.external_username;
      }
    }
  }

  return (
    <div className="flex flex-col gap-8 max-w-4xl">
      <OficinaPageHero
        icon={Share2}
        eyebrow="Gestor de redes"
        title="Navi"
        description="Selecciona el gestor de redes que quieres revisar."
      />

      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {navi.map(agent => {
          const isEstandar = agent.role === 'navi';
          const color      = avatarColor(agent.id);
          const handle     = isEstandar ? (accountsByAgent[agent.id] ?? null) : null;

          return (
            <Link
              key={agent.id}
              href={`/portal/${token}/oficina/redes/${agent.id}`}
              className="flex flex-col gap-4 rounded-2xl p-5 transition-all group"
              style={{
                background:  '#fff',
                border:      '1px solid #E8E3F5',
                boxShadow:   '0 1px 2px rgba(26,10,59,0.04)',
              }}
              onMouseEnter={undefined}
            >
              {/* Avatar + Chip variante */}
              <div className="flex items-start justify-between">
                <div
                  className="w-11 h-11 rounded-2xl flex items-center justify-center text-[18px] font-bold text-white flex-shrink-0"
                  style={{ background: color }}
                >
                  {agentInitial(agent.agent_name)}
                </div>
                <span
                  className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full"
                  style={{
                    background: isEstandar ? 'rgba(108,59,255,0.1)' : 'rgba(20,184,166,0.1)',
                    color:      isEstandar ? '#6C3BFF'              : '#14B8A6',
                    border:     isEstandar ? '1px solid rgba(108,59,255,0.25)' : '1px solid rgba(20,184,166,0.25)',
                  }}
                >
                  {isEstandar ? 'Estándar' : 'Agencia'}
                </span>
              </div>

              {/* Nombre y handle */}
              <div className="flex flex-col gap-1">
                <p className="text-[15px] font-semibold" style={{ color: '#1A0A3B' }}>
                  {agent.agent_name ?? 'Navi'}
                </p>
                {isEstandar && (
                  <div className="flex items-center gap-1.5">
                    <AtSign size={12} style={{ color: '#6B6480' }} strokeWidth={1.75} />
                    <span className="text-[12px]" style={{ color: '#6B6480' }}>
                      {handle ? `@${handle}` : 'Sin cuenta conectada'}
                    </span>
                  </div>
                )}
                {!isEstandar && (
                  <div className="flex items-center gap-1.5">
                    <Users size={12} style={{ color: '#6B6480' }} strokeWidth={1.75} />
                    <span className="text-[12px]" style={{ color: '#6B6480' }}>
                      Gestiona múltiples cuentas
                    </span>
                  </div>
                )}
              </div>

              {/* Call to action */}
              <span className="text-[12px] font-medium" style={{ color: '#6C3BFF' }}>
                Ver dashboard
              </span>
            </Link>
          );
        })}
      </section>
    </div>
  );
}
