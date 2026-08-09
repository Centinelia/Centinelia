export const dynamic = 'force-dynamic';

import { cookies }                      from 'next/headers';
import { Brain }                        from 'lucide-react';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';
import LearningsSection                 from '../../LearningsSection';
import InsightsSection                  from '../../InsightsSection';
import { PageSection, SectionHeader }   from '@/components/portal-ui';
import OficinaPageHero                  from '../OficinaPageHero';

interface Props { params: Promise<{ token: string }> }

export default async function AprendizajesPage({ params }: Props) {
  const { token } = await params;

  const cookieStore = await cookies();
  const session     = await verifySession(cookieStore.get(PORTAL_COOKIE)?.value ?? '');

  const canApprove = !session?.isSubUser || !!(session.modules?.includes('of_aprendizajes'));

  return (
    <div id="of-aprendizajes" className="flex flex-col gap-6 max-w-6xl mx-auto w-full p-4 md:p-6">
      <OficinaPageHero
        icon={Brain}
        eyebrow="Aprendizajes"
        title="Aprendizajes del equipo"
        description="Lo que el equipo aprende con certeza se aplica automáticamente. Aquí solo aparecen los aprendizajes inciertos que quieren tu confirmación antes de incorporarse a la memoria del equipo."
      />

      <LearningsSection token={token} canApprove={canApprove} />

      <PageSection
        heading={
          <SectionHeader
            eyebrow="INSIGHTS"
            title="Insights de la semana"
          />
        }
      >
        <InsightsSection token={token} />
      </PageSection>
    </div>
  );
}
