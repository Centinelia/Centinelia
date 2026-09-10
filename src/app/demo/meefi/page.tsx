import { SCENARIOS } from './scenarios';
import { MeefiChatWidget } from './MeefiChatWidget';

export const dynamic = 'force-dynamic';

interface Props {
  searchParams: Promise<{ scenario?: string }>;
}

export default async function Page({ searchParams }: Props) {
  const params = await searchParams;
  const scenarioId = Number(params.scenario ?? 2);
  const scenario = SCENARIOS[scenarioId] ?? SCENARIOS[2];

  return (
    <div className="relative min-h-screen bg-neutral-50">
      <img
        src="/demo/meefi/dashboard-placeholder.svg"
        alt=""
        className="fixed inset-0 w-full h-full object-cover object-top opacity-95 pointer-events-none"
      />
      <div className="fixed inset-0 bg-gradient-to-b from-transparent to-black/5 pointer-events-none" />
      <MeefiChatWidget scenario={scenario} />
    </div>
  );
}
