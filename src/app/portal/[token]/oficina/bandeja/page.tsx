export const dynamic = 'force-dynamic';

import OpsInboxSection from '../../OpsInboxSection';

interface Props { params: Promise<{ token: string }> }

export default async function BandejaPage({ params }: Props) {
  const { token } = await params;
  return <div id="of-bandeja"><OpsInboxSection token={token} /></div>;
}
