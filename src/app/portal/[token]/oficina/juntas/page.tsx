export const dynamic = 'force-dynamic';

import { cookies }                      from 'next/headers';
import { redirect }                     from 'next/navigation';
import { Mic }                          from 'lucide-react';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';
import OpsMeetingsSection               from '../../OpsMeetingsSection';
import OficinaPageHero                  from '../OficinaPageHero';

interface Props { params: Promise<{ token: string }> }

export default async function JuntasPage({ params }: Props) {
  const { token } = await params;

  const cookieStore = await cookies();
  const session     = await verifySession(cookieStore.get(PORTAL_COOKIE)?.value ?? '');

  // Sub-usuario sin módulo asignado no puede acceder por URL directa.
  if (session?.isSubUser && session.modules && !session.modules.includes('of_juntas'))
    redirect(`/portal/${token}/oficina`);

  return (
    <div id="of-juntas" className="flex flex-col gap-5 max-w-6xl mx-auto w-full p-4 md:p-6">
      <OficinaPageHero
        icon={Mic}
        eyebrow="Juntas"
        title="Reuniones y minutas"
        description="Sube el audio de una reunión y tu equipo la transcribe, genera la minuta con decisiones y convierte los compromisos en tareas automáticamente."
      />
      <OpsMeetingsSection token={token} />
    </div>
  );
}
