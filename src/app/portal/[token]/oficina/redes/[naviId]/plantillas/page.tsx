export const dynamic = 'force-dynamic';

/**
 * Plantillas — /portal/[token]/oficina/redes/[naviId]/plantillas
 *
 * Muestra las plantillas de Canva disponibles (brand_templates) y
 * ofrece un botón "Sincronizar desde Canva" que dispara
 * POST /api/portal/[token]/social/templates/sync con { agent_id }.
 *
 * La grilla inicial se carga en servidor para SSR. La sincronización
 * es client-side (botón con fetch).
 *
 * Seguridad: verifySession + resolveOrgFromToken + IDOR (R72).
 * Feature gate: social_publishing.enabled (R75).
 */
import { cookies }                      from 'next/headers';
import { redirect, notFound }           from 'next/navigation';
import { LayoutTemplate }               from 'lucide-react';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';
import { resolveOrgFromToken }          from '@/lib/portal/org-token';
import { socialPublishingEnabled }      from '@/lib/feature-flags/social-publishing';
import { createAdminClient }            from '@/lib/supabase/admin';
import OficinaPageHero                  from '../../../OficinaPageHero';
import PlantillasGrid                   from './PlantillasGrid';

interface Props { params: Promise<{ token: string; naviId: string }> }

interface BrandTemplate {
  id:           string;
  name:         string;
  category:     string;
  thumbnail_url: string | null;
  created_at:   string;
}

export default async function PlantillasPage({ params }: Props) {
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

  // Cargar plantillas del agente
  const { data: templates } = await supabase
    .from('brand_templates')
    .select('id, name, category, thumbnail_url, created_at')
    .eq('portal_email', resolved.portalEmail)
    .eq('agent_id', naviId)
    .order('created_at', { ascending: false });

  return (
    <div className="flex flex-col gap-6 max-w-5xl">
      <OficinaPageHero
        icon={LayoutTemplate}
        eyebrow="Gestor de redes"
        title="Plantillas de Canva"
        description={`Diseños disponibles para ${navi.agent_name ?? 'Navi'}.`}
      />
      <PlantillasGrid
        token={token}
        naviId={naviId}
        initialTemplates={(templates ?? []) as BrandTemplate[]}
      />
    </div>
  );
}
