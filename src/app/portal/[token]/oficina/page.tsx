export const dynamic = 'force-dynamic';

import TeamFeed             from '../TeamFeed';
import LearningsSection      from '../LearningsSection';
import AgentRankingSection   from '../AgentRankingSection';

interface Props { params: Promise<{ token: string }> }

export default async function OficinaOverviewPage({ params }: Props) {
  const { token } = await params;
  return (
    <div id="of-actividad" className="flex flex-col gap-6">
      <AgentRankingSection token={token} />
      <TeamFeed token={token} />
      <LearningsSection token={token} />
    </div>
  );
}
