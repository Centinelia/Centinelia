export const dynamic = 'force-dynamic';

/**
 * Media — /portal/[token]/oficina/redes/[naviId]/media
 *
 * Galería de archivos de media del cliente (user_media_uploads).
 * Renderiza <MediaBandeja> client component que maneja upload y galería.
 *
 * Seguridad: verifySession + resolveOrgFromToken + IDOR (R72).
 * Feature gate: social_publishing.enabled (R75).
 */
import { cookies }                      from 'next/headers';
import { redirect, notFound }           from 'next/navigation';
import { Image as ImageIcon }           from 'lucide-react';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';
import { resolveOrgFromToken }          from '@/lib/portal/org-token';
import { socialPublishingEnabled }      from '@/lib/feature-flags/social-publishing';
import { createAdminClient }            from '@/lib/supabase/admin';
import OficinaPageHero                  from '../../../OficinaPageHero';
import MediaBandeja                     from '@/components/portal/redes/MediaBandeja';

interface Props { params: Promise<{ token: string; naviId: string }> }

export default async function MediaPage({ params }: Props) {
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

  return (
    <div className="flex flex-col gap-6 max-w-5xl">
      <OficinaPageHero
        icon={ImageIcon}
        eyebrow="Gestor de redes"
        title="Archivos de media"
        description={`Imágenes y videos disponibles para publicaciones de ${navi.agent_name ?? 'Navi'}.`}
      />
      <MediaBandeja token={token} naviId={naviId} />
    </div>
  );
}
