export const dynamic = 'force-dynamic';

import { Search } from 'lucide-react';
import { createAdminClient } from '@/lib/supabase/admin';
import InvestigacionSection  from './InvestigacionSection';
import OficinaPageHero       from '../OficinaPageHero';
import { MEERKAT_VOICE_DISTRIBUTION } from '@/lib/vapi/sync';
import { MEERKAT_ROLES } from '@/lib/portal/meerkat-roles';

const WEB_TOOL = 'buscar_en_web';

// Meerkats que traen la tool buscar_en_web por default (según distribución).
// Se calcula una sola vez al cargar el módulo.
const RESEARCH_MEERKATS = MEERKAT_ROLES
  .filter(m => (MEERKAT_VOICE_DISTRIBUTION[m.id] ?? []).includes(WEB_TOOL))
  .map(m => ({
    id:     m.id,
    nombre: m.nombre,
    color:  m.color,
    imagen: m.imagen,
  }));

interface Props { params: Promise<{ token: string }> }

export default async function InvestigacionPage({ params }: Props) {
  const { token } = await params;
  const supabase  = createAdminClient();

  const { data: primary } = await supabase
    .from('voice_agents')
    .select('portal_email, business_name, plan, minutes_plan')
    .eq('portal_token', token)
    .single();

  interface Researcher {
    id:              string;
    agent_name:      string | null;
    business_name:   string;
    meerkat_role_id: string | null;
  }
  let researchers: Researcher[] = [];

  if (primary?.portal_email) {
    const { data: all } = await supabase
      .from('voice_agents')
      .select('id, agent_name, business_name, features')
      .eq('portal_email', primary.portal_email)
      .eq('active', true);

    // La tool buscar_en_web no se guarda per-agent — viene incluida en la
    // distribución por meerkat_role_id (ver MEERKAT_VOICE_DISTRIBUTION en
    // src/lib/vapi/sync.ts). Filtramos por rol, no por features.tools.
    researchers = (all ?? [])
      .map((a: Record<string, unknown>) => {
        const features = (a.features as Record<string, unknown> | null) ?? null;
        return {
          id:              a.id as string,
          agent_name:      (a.agent_name as string | null) ?? null,
          business_name:   (a.business_name as string) ?? '',
          meerkat_role_id: (features?.meerkat_role_id as string | null) ?? null,
        };
      })
      .filter(r => r.meerkat_role_id && (MEERKAT_VOICE_DISTRIBUTION[r.meerkat_role_id] ?? []).includes(WEB_TOOL));
  }

  // Default: primer researcher con nombre reconocible.
  const defaultResearcher = researchers.find(r => r.agent_name) ?? researchers[0] ?? null;

  const plan        = (primary as unknown as { plan?: string })?.plan         ?? 'pro';
  const defaultTier = (primary as unknown as { minutes_plan?: string })?.minutes_plan ?? 'starter';

  return (
    <div id="of-investigacion" className="flex flex-col gap-5 max-w-6xl mx-auto w-full p-4 md:p-6">
      <OficinaPageHero
        icon={Search}
        eyebrow="Investigación"
        title="Búsquedas y research"
        description={researchers.length > 0
          ? 'Investiga en web, redes y competencia. Escoge qué empleado la lleva a cabo y aquí ves cada búsqueda con su hallazgo.'
          : 'Búsquedas realizadas en web, redes y competencia por tu equipo.'}
      />
      <InvestigacionSection
        token={token}
        researchers={researchers}
        defaultResearcherId={defaultResearcher?.id ?? null}
        researchMeerkats={RESEARCH_MEERKATS}
        plan={plan}
        defaultTier={defaultTier}
      />
    </div>
  );
}
