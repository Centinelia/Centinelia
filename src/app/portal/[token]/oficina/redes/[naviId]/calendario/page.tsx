export const dynamic = 'force-dynamic';

/**
 * Calendario editorial — /portal/[token]/oficina/redes/[naviId]/calendario
 *
 * Server component que lee ?month=YYYY-MM (default: mes actual) y
 * renderiza <CalendarioEditorial> client component.
 *
 * Seguridad: verifySession + resolveOrgFromToken + IDOR.
 * Feature gate: social_publishing.enabled (R75).
 */
import { cookies }                      from 'next/headers';
import { redirect, notFound }           from 'next/navigation';
import { Calendar }                     from 'lucide-react';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';
import { resolveOrgFromToken }          from '@/lib/portal/org-token';
import { socialPublishingEnabled }      from '@/lib/feature-flags/social-publishing';
import { createAdminClient }            from '@/lib/supabase/admin';
import OficinaPageHero                  from '../../../OficinaPageHero';
import CalendarioEditorial              from '@/components/portal/redes/CalendarioEditorial';

interface Props {
  params:      Promise<{ token: string; naviId: string }>;
  searchParams: Promise<{ month?: string }>;
}

export default async function CalendarioPage({ params, searchParams }: Props) {
  const { token, naviId } = await params;
  const { month: monthQ } = await searchParams;

  // Mes por defecto: mes actual YYYY-MM
  const month = monthQ?.match(/^\d{4}-\d{2}$/)
    ? monthQ
    : new Date().toISOString().slice(0, 7);

  // Verificar sesión
  const cookieStore = await cookies();
  const session     = await verifySession(cookieStore.get(PORTAL_COOKIE)?.value ?? '');

  const supabase = createAdminClient();
  const resolved = await resolveOrgFromToken(token);
  if (!resolved) notFound();

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

  // IDOR: verificar que el agente pertenece al org
  const { data: navi } = await supabase
    .from('voice_agents')
    .select('id, agent_name, portal_email')
    .eq('id', naviId)
    .eq('portal_email', resolved.portalEmail)
    .maybeSingle();

  if (!navi) notFound();

  return (
    <div className="flex flex-col gap-6 max-w-3xl">
      <OficinaPageHero
        icon={Calendar}
        eyebrow="Gestor de redes"
        title="Calendario editorial"
        description={`Programación de publicaciones de ${navi.agent_name ?? 'Navi'}.`}
      />
      <CalendarioEditorial
        token={token}
        naviId={naviId}
        month={month}
      />
    </div>
  );
}
