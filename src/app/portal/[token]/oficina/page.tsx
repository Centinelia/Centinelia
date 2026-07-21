export const dynamic = 'force-dynamic';

import AgentRankingSection from '../AgentRankingSection';
import ActividadFeed       from './ActividadFeed';
import EquipoHoySection    from './EquipoHoySection';
import AttentionPanel      from './AttentionPanel';

interface Props { params: Promise<{ token: string }> }

export default async function OficinaOverviewPage({ params }: Props) {
  const { token } = await params;
  return (
    <div id="of-actividad" className="grid grid-cols-1 xl:grid-cols-[1fr_240px] gap-6 items-start">

      {/* Main column */}
      <div className="flex flex-col gap-6">
        <EquipoHoySection token={token} />
        <AgentRankingSection token={token} />
        <ActividadFeed token={token} />
      </div>

      {/* Right panel — attention items + quick links */}
      <AttentionPanel token={token} />

    </div>
  );
}
