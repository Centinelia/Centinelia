export const dynamic = 'force-dynamic';

import TeamFeed        from '../TeamFeed';
import LearningsSection from '../LearningsSection';

interface Props { params: Promise<{ token: string }> }

export default async function OficinaOverviewPage({ params }: Props) {
  const { token } = await params;
  return (
    <div className="flex flex-col gap-6">
      <TeamFeed token={token} />
      <LearningsSection token={token} />
    </div>
  );
}
