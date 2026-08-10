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
  return 'llamadas';
}

export default async function OficinaCampanasPage({ params, searchParams }: Props) {
  const { token } = await params;
  const sp        = searchParams ? await searchParams : {};

  const data = await loadCampanasData(token);
  if (!data) notFound();

  // Sub-user permissions: qué tabs puede ver este usuario.
  // Owners tienen todos los módulos, ven todo. Sub-users solo lo que les dieron.
  const cookieStore = await cookies();
  const session     = await verifySession(cookieStore.get(PORTAL_COOKIE)?.value ?? '');

  // 2026-08-10: Calidad se unificó en Campañas. Módulo `campanas` otorga
  // ambos tabs. `of_encuestas` se mantiene como fallback para sub-users
  // viejos que solo tengan ese permiso.
  const hasCampanas  = !!(session?.modules?.includes('campanas'));
  const hasEncuestas = !!(session?.modules?.includes('of_encuestas'));
  const canLlamadas  = !session?.isSubUser || hasCampanas;
  const canEncuestas = !session?.isSubUser || hasCampanas || hasEncuestas;

  const visibleTabs: CampanasTab[] = [];
  if (canLlamadas)  visibleTabs.push('llamadas');
  if (canEncuestas) visibleTabs.push('encuestas');

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
