export const dynamic = 'force-dynamic';

import { notFound } from 'next/navigation';
import { PhoneOutgoing, CalendarClock } from 'lucide-react';
import { Card } from '@/components/portal-ui';
import { EmptyState } from '@/components/ui/empty-state';
import OficinaPageHero from '../OficinaPageHero';
import { loadSeguimientosData } from './loadSeguimientosData';
import SeguimientosClient from './SeguimientosClient';

interface Props { params: Promise<{ token: string }> }

export default async function SeguimientosPage({ params }: Props) {
  const { token } = await params;
  const data = await loadSeguimientosData(token);
  if (!data) notFound();

  const { showOutbound, initialized, pending, historial, agents } = data;

  const description = initialized
    ? (pending.length > 0
        ? `${pending.length} seguimiento${pending.length === 1 ? '' : 's'} agendado${pending.length === 1 ? '' : 's'}. Tus empleados los llamarán en la fecha programada.`
        : 'Sin seguimientos agendados. Aquí aparecen las llamadas de vuelta que tus empleados programan tras un pedido, una cotización, una consulta u otra conversación que necesita seguimiento.')
    : 'Los seguimientos se activan cuando algún empleado tiene llamadas salientes encendidas.';

  return (
    <div className="flex flex-col gap-5 max-w-6xl mx-auto w-full p-4 md:p-6">
      <OficinaPageHero
        icon={CalendarClock}
        eyebrow="Seguimientos"
        title="Llamadas de vuelta programadas"
        description={description}
      />

      {!showOutbound ? (
        <Card padding="md">
          <EmptyState
            icon={PhoneOutgoing}
            title="Los seguimientos requieren llamadas salientes"
            description="Enciende las llamadas salientes en algún empleado desde Configurar > Empleado > Llamadas salientes."
            size="sm"
          />
        </Card>
      ) : !initialized ? (
        <Card padding="md">
          <EmptyState
            icon={PhoneOutgoing}
            title="Ningún empleado tiene llamadas salientes activas"
            description="Ve a Configurar, elige un empleado y activa Llamadas salientes."
            size="sm"
          />
        </Card>
      ) : (
        <SeguimientosClient
          token={token}
          initialPending={pending}
          initialHistorial={historial}
          agents={agents}
        />
      )}
    </div>
  );
}
