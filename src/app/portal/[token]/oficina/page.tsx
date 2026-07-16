export const dynamic = 'force-dynamic';

import AgentRankingSection from '../AgentRankingSection';
import ActividadFeed       from './ActividadFeed';

interface Props { params: Promise<{ token: string }> }

export default async function OficinaOverviewPage({ params }: Props) {
  const { token } = await params;
  return (
    <div id="of-actividad" className="flex flex-col gap-6">
      <AgentRankingSection token={token} />
      <ActividadFeed token={token} />
    </div>
  );
}
