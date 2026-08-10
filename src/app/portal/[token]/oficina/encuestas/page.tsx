export const dynamic = 'force-dynamic';

import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';
import CampanasClient, { type CampanasTab } from '../campanas/CampanasClient';
import { loadCampanasData } from '../campanas/loadCampanasData';

interface Props { params: Promise<{ token: string }> }

// /oficina/encuestas ahora es un entry point al UI unificado de Campañas
// con la tab de Encuestas pre-seleccionada. Mantiene el módulo `of_encuestas`
// como gate (via middleware). Sub-users con permiso solo de encuestas caen
// aquí y ven solo la tab de encuestas.
export default async function EncuestasPage({ params }: Props) {
  const { token } = await params;

  const data = await loadCampanasData(token);
  if (!data) notFound();

  const cookieStore = await cookies();
  const session     = await verifySession(cookieStore.get(PORTAL_COOKIE)?.value ?? '');

  const canLlamadas  = !session?.isSubUser || !!(session.modules?.includes('campanas'));
  const canEncuestas = !session?.isSubUser || !!(session.modules?.includes('of_encuestas'));

  const visibleTabs: CampanasTab[] = [];
  if (canLlamadas)  visibleTabs.push('llamadas');
  if (canEncuestas) visibleTabs.push('encuestas');

  return (
    <div id="of-encuestas">
      <CampanasClient
        token={token}
        initialTab="encuestas"
        visibleTabs={visibleTabs}
        outbound={data.outbound}
        surveys={data.surveys}
        counters={data.counters}
      />
    </div>
  );
}
