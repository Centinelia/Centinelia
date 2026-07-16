export const dynamic = 'force-dynamic';

import { createAdminClient } from '@/lib/supabase/admin';
import { getFolioConfig, getTramiteDocs } from '@/lib/civic/folio';
import CivicReportsSection from './CivicReportsSection';
import FolioConfigEditor from './FolioConfigEditor';
import TramiteDocsEditor from './TramiteDocsEditor';

interface Props { params: Promise<{ token: string }> }

export default async function ReportesCiudadanosPage({ params }: Props) {
  const { token } = await params;
  const supabase = createAdminClient();

  const { data: agent } = await supabase
    .from('voice_agents').select('id, features').eq('portal_token', token).single();

  const isGobierno = ((agent as any)?.features as any)?.vertical === 'gobierno';

  const [folioConfig, tramiteDocs] = agent && isGobierno
    ? await Promise.all([
        getFolioConfig(agent.id as string, supabase),
        getTramiteDocs(agent.id as string, supabase),
      ])
    : [null, null];

  return (
    <div id="of-reportes-ciudadanos" className="flex flex-col gap-4 p-4 md:p-6">
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
