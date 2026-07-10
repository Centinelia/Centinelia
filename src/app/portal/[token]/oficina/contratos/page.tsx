export const dynamic = 'force-dynamic';

import OpsContractsSection from '../../OpsContractsSection';

interface Props { params: Promise<{ token: string }> }

export default async function ContratosPage({ params }: Props) {
  const { token } = await params;
  return <OpsContractsSection token={token} />;
}
