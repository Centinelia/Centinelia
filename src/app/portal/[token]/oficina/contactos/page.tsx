export const dynamic = 'force-dynamic';

import { notFound } from 'next/navigation';
import { Users, PhoneOutgoing } from 'lucide-react';
import { Card } from '@/components/portal-ui';
import { EmptyState } from '@/components/ui/empty-state';
import OficinaPageHero from '../OficinaPageHero';
import OutboundSection from '../../OutboundSection';
import { loadCampanasData } from '../campanas/loadCampanasData';

interface Props { params: Promise<{ token: string }> }

export default async function OficinaContactosPage({ params }: Props) {
  const { token } = await params;

  // Reutilizamos el loader de Campañas — contactos + outbound state salen
  // del mismo query (agentes, peers, features, minutos disponibles).
  const data = await loadCampanasData(token);
  if (!data) notFound();

  const { outbound } = data;
  const total = outbound.contacts.length;

  const heroDescription = outbound.show && outbound.initialized
    ? (total > 0
        ? `${total.toLocaleString('es-MX')} contacto${total === 1 ? '' : 's'}. Impórtalos por CSV, Notion o Sheets y etiquétalos con tags para segmentar.`
        : 'Impórtalos por CSV, Notion o Sheets y etiquétalos con tags. Se usan en campañas de llamadas, encuestas y respuestas.')
    : 'Los contactos se activan cuando enciendes las llamadas salientes en algún empleado.';

  return (
    <div className="flex flex-col gap-5 max-w-6xl mx-auto w-full p-4 md:p-6">

      <OficinaPageHero
        icon={Users}
        eyebrow="Contactos"
        title="Directorio de contactos"
        description={heroDescription}
      />

      {!outbound.show ? (
        <Card padding="md">
          <EmptyState
            icon={Users}
            title="Los contactos requieren llamadas salientes"
            description="Enciende las llamadas salientes de algún empleado en Configurar > tu empleado > Llamadas salientes."
            size="sm"
          />
        </Card>
      ) : !outbound.initialized ? (
        <Card padding="md">
          <EmptyState
            icon={PhoneOutgoing}
            title="Ningún empleado tiene activadas las llamadas salientes"
            description="Ve a Configurar, elige un empleado y enciende Llamadas salientes en Herramientas."
            size="sm"
          />
        </Card>
      ) : (
        <OutboundSection
          token={token}
          initialContacts={outbound.contacts as never[]}
          initialCampaigns={outbound.campaigns as never[]}
          agents={outbound.agents}
          initialTab="contactos"
          show="contactos"
          minutesRemaining={outbound.minutesRemaining}
        />
      )}
    </div>
  );
}
