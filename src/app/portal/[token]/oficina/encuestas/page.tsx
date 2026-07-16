export const dynamic = 'force-dynamic';

import EncuestasSection from './EncuestasSection';

interface Props { params: Promise<{ token: string }> }

export default async function EncuestasPage({ params }: Props) {
  const { token } = await params;
  return (
    <div id="of-encuestas" className="flex flex-col gap-6 p-4 md:p-6">
      <EncuestasSection token={token} />
    </div>
  );
}
