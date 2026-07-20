export const dynamic = 'force-dynamic';

import { cookies }                      from 'next/headers';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';
import LearningsSection                 from '../../LearningsSection';

interface Props { params: Promise<{ token: string }> }

export default async function AprendizajesPage({ params }: Props) {
  const { token } = await params;

  const cookieStore = await cookies();
  const session     = await verifySession(cookieStore.get(PORTAL_COOKIE)?.value ?? '');

  const canApprove = !session?.isSubUser || !!(session.modules?.includes('of_aprendizajes'));

  return (
    <div id="of-aprendizajes">
      <LearningsSection token={token} canApprove={canApprove} />
    </div>
  );
}
