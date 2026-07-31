export const dynamic = 'force-dynamic';

import { cookies }                      from 'next/headers';
import { redirect }                     from 'next/navigation';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';
import OpsMeetingsSection               from '../../OpsMeetingsSection';

interface Props { params: Promise<{ token: string }> }

export default async function JuntasPage({ params }: Props) {
  const { token } = await params;

  const cookieStore = await cookies();
  const session     = await verifySession(cookieStore.get(PORTAL_COOKIE)?.value ?? '');

  // Sub-usuario sin módulo asignado no puede acceder por URL directa.
  if (session?.isSubUser && session.modules && !session.modules.includes('of_juntas'))
    redirect(`/portal/${token}/oficina`);

  return <div id="of-juntas"><OpsMeetingsSection token={token} /></div>;
}
