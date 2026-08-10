export const dynamic = 'force-dynamic';

import { ClipboardList } from 'lucide-react';
import { createAdminClient }        from '@/lib/supabase/admin';
import { getPrimaryAgentFromToken } from '@/lib/portal/org-token';
import { getFolioConfig, getTramiteDocs } from '@/lib/civic/folio';
import CivicReportsSection from './CivicReportsSection';
import FolioConfigEditor from './FolioConfigEditor';
import TramiteDocsEditor from './TramiteDocsEditor';
import OficinaPageHero from '../OficinaPageHero';

interface Props { params: Promise<{ token: string }> }

export default async function ReportesCiudadanosPage({ params }: Props) {
  const { token } = await params;
  const supabase = createAdminClient();

  const agent = await getPrimaryAgentFromToken<{ id: string; features: Record<string, unknown> | null }>(
    token,
    'id, features',
    supabase,
  );

  const isGobierno = ((agent as any)?.features as any)?.vertical === 'gobierno';

  const [folioConfig, tramiteDocs] = agent && isGobierno
    ? await Promise.all([
        getFolioConfig(agent.id as string, supabase),
        getTramiteDocs(agent.id as string, supabase),
      ])
    : [null, null];

  return (
    <div id="of-reportes-ciudadanos" className="flex flex-col gap-5 max-w-6xl mx-auto w-full p-4 md:p-6">
      <OficinaPageHero
        icon={ClipboardList}
        eyebrow="Ciudadanía"
        title="Reportes ciudadanos"
        description="Baches, alumbrado, agua, basura y demás. Tu equipo los recibe por teléfono, chat o correo, los clasifica y les asigna folio para dar seguimiento."
      />
      {folioConfig && (
        <FolioConfigEditor token={token} initial={folioConfig} />
      )}
      {tramiteDocs !== null && (
        <TramiteDocsEditor token={token} initial={tramiteDocs} />
      )}
      <CivicReportsSection token={token} tramiteDocs={tramiteDocs ?? {}} />
    </div>
  );
}
