export const dynamic = 'force-dynamic';

import { cookies }                      from 'next/headers';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';
import LearningsSection                 from '../../LearningsSection';
import ActividadFeed                    from '../ActividadFeed';
import InsightsSection                  from '../../InsightsSection';
import { PageSection, SectionHeader }   from '@/components/portal-ui';

interface Props { params: Promise<{ token: string }> }

export default async function AprendizajesPage({ params }: Props) {
  const { token } = await params;

  const cookieStore = await cookies();
  const session     = await verifySession(cookieStore.get(PORTAL_COOKIE)?.value ?? '');

  const canApprove = !session?.isSubUser || !!(session.modules?.includes('of_aprendizajes'));

  return (
    <div id="of-aprendizajes" className="flex flex-col gap-8">
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

      <PageSection
        heading={
          <SectionHeader
            eyebrow="ACTIVIDAD"
            title="Últimas 24 horas"
          />
        }
      >
        <ActividadFeed token={token} />
      </PageSection>
    </div>
  );
}
