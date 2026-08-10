export const dynamic = 'force-dynamic';

import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';
import CampanasClient, { type CampanasTab } from './CampanasClient';
import { loadCampanasData } from './loadCampanasData';

interface Props {
  params:        Promise<{ token: string }>;
  searchParams?: Promise<{ tab?: string }>;
}

function parseTab(value: string | undefined): CampanasTab {
  if (value === 'encuestas') return 'encuestas';
  if (value === 'emails')    return 'emails';
  return 'llamadas';
}

export default async function OficinaCampanasPage({ params, searchParams }: Props) {
  const { token } = await params;
  const sp        = searchParams ? await searchParams : {};

  const data = await loadCampanasData(token);
  if (!data) notFound();

  // Sub-user permissions: qué tabs puede ver este usuario.
  // Owners tienen todos los módulos, ven todo. Sub-users solo lo que les
  // dieron. `emails` no tiene módulo aún (feature futura), lo mostramos a
  // todos pero disabled.
  const cookieStore = await cookies();
  const session     = await verifySession(cookieStore.get(PORTAL_COOKIE)?.value ?? '');

  const canLlamadas  = !session?.isSubUser || !!(session.modules?.includes('campanas'));
  const canEncuestas = !session?.isSubUser || !!(session.modules?.includes('of_encuestas'));

  const visibleTabs: CampanasTab[] = [];
  if (canLlamadas)  visibleTabs.push('llamadas');
  if (canEncuestas) visibleTabs.push('encuestas');
  visibleTabs.push('emails'); // placeholder futura

  return (
    <div id="of-campanas">
      <CampanasClient
        token={token}
        initialTab={parseTab(sp.tab)}
        visibleTabs={visibleTabs}
        outbound={data.outbound}
        surveys={data.surveys}
        counters={data.counters}
      />
    </div>
  );
}
