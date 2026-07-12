export const dynamic = 'force-dynamic';

import InvestigacionSection from './InvestigacionSection';

interface Props { params: Promise<{ token: string }> }

export default async function InvestigacionPage({ params }: Props) {
  const { token } = await params;
  return <InvestigacionSection token={token} />;
}
