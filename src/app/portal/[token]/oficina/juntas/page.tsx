export const dynamic = 'force-dynamic';

import OpsMeetingsSection from '../../OpsMeetingsSection';

interface Props { params: Promise<{ token: string }> }

export default async function JuntasPage({ params }: Props) {
  const { token } = await params;
  return <OpsMeetingsSection token={token} />;
}
