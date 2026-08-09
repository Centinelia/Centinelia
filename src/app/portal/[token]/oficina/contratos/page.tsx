export const dynamic = 'force-dynamic';

import { FileSignature } from 'lucide-react';
import OpsContractsSection from '../../OpsContractsSection';
import OficinaPageHero     from '../OficinaPageHero';

interface Props { params: Promise<{ token: string }> }

export default async function ContratosPage({ params }: Props) {
  const { token } = await params;
  return (
    <div id="of-contratos" className="flex flex-col gap-5 max-w-6xl mx-auto w-full p-4 md:p-6">
      <OficinaPageHero
        icon={FileSignature}
        eyebrow="Contratos"
        title="Contratos y borradores"
        description="Genera, revisa y firma contratos con tu equipo. Los borradores generados por tus empleados aparecen aquí para tu aprobación."
      />
      <OpsContractsSection token={token} />
    </div>
  );
}
