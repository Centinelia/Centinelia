export const dynamic = 'force-dynamic';

/**
 * Interacciones — /portal/[token]/oficina/redes/[naviId]/interacciones
 *
 * Lista social_interactions donde:
 *   - portal_email = org
 *   - agent_id = naviId
 *   - response_status IN ('pending_approval', 'escalated_to_human')
 *
 * Agrupado por tipo (comment vs dm).
 * Muestra incoming_text, sentiment badge, y botones de acción.
 *
 * Las acciones (aprobar respuesta de Navi / editar / marcar como atendido)
 * son operaciones client-side que llaman a PATCH del draft o a endpoints
 * de interacciones si existen. En esta primera versión se implementan como
 * acciones optimistas con fetch.
 *
 * Seguridad: verifySession + resolveOrgFromToken + IDOR (R72).
 * Feature gate: social_publishing.enabled (R75).
 */
import { cookies }                      from 'next/headers';
import { redirect, notFound }           from 'next/navigation';
import { MessageSquare }                from 'lucide-react';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';
import { resolveOrgFromToken }          from '@/lib/portal/org-token';
import { socialPublishingEnabled }      from '@/lib/feature-flags/social-publishing';
import { createAdminClient }            from '@/lib/supabase/admin';
import OficinaPageHero                  from '../../../OficinaPageHero';
import InteraccionesClient              from './InteraccionesClient';

interface Props { params: Promise<{ token: string; naviId: string }> }

export interface SocialInteraction {
  id:              string;
  interaction_type: 'comment' | 'dm';
  incoming_text:   string | null;
  sentiment:       string | null;
  response_status: string;
  navi_response?:  string | null;
  external_id:     string;
  created_at:      string;
}

export default async function InteraccionesPage({ params }: Props) {
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

  // IDOR check
  const { data: navi } = await supabase
    .from('voice_agents')
    .select('id, agent_name, portal_email')
    .eq('id', naviId)
    .eq('portal_email', resolved.portalEmail)
    .maybeSingle();

  if (!navi) notFound();

  // Cargar interacciones pendientes
  const { data: interactions } = await supabase
    .from('social_interactions')
    .select('id, interaction_type, incoming_text, sentiment, response_status, navi_response, external_id, created_at')
    .eq('agent_id', naviId)
    .eq('portal_email', resolved.portalEmail)
    .in('response_status', ['pending_approval', 'escalated_to_human'])
    .order('created_at', { ascending: false })
    .limit(50);

  return (
    <div className="flex flex-col gap-6 max-w-3xl">
      <OficinaPageHero
        icon={MessageSquare}
        eyebrow="Gestor de redes"
        title="Interacciones"
        description={`Comentarios y mensajes directos pendientes de ${navi.agent_name ?? 'Navi'}.`}
        right={
          <span
            className="text-[11px] font-bold px-3 py-1 rounded-full"
            style={{ background: 'rgba(108,59,255,0.1)', color: '#6C3BFF', border: '1px solid rgba(108,59,255,0.25)' }}
          >
            {(interactions ?? []).length} pendientes
          </span>
        }
      />
      <InteraccionesClient
        token={token}
        naviId={naviId}
        initialInteractions={(interactions ?? []) as SocialInteraction[]}
      />
    </div>
  );
}
