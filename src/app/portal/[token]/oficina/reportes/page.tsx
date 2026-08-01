export const dynamic = 'force-dynamic';

import { createAdminClient }            from '@/lib/supabase/admin';
import { cookies }                      from 'next/headers';
import { redirect }                     from 'next/navigation';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';
import OpsReportsSection                from '../../OpsReportsSection';

interface Props { params: Promise<{ token: string }> }

export default async function ReportesPage({ params }: Props) {
  const { token } = await params;

  const cookieStore = await cookies();
  const session     = await verifySession(cookieStore.get(PORTAL_COOKIE)?.value ?? '');

  // Sub-usuario sin módulo asignado no puede acceder por URL directa.
  if (session?.isSubUser && session.modules && !session.modules.includes('of_reportes'))
    redirect(`/portal/${token}/oficina`);

  const supabase    = createAdminClient();
  const { data: ag } = await supabase.from('voice_agents').select('portal_email').eq('portal_token', token).single();
  const { data: all } = ag?.portal_email
    ? await supabase.from('voice_agents').select('id, business_name, role, features').eq('portal_email', ag.portal_email)
    : { data: [] };

  const agents = (all ?? []).map((a: any) => ({
    id:            a.id,
    business_name: a.business_name,
    role:          a.role ?? null,
  }));

  const checkinsAgents = (all ?? []).map((a: any) => ({
    id:              a.id,
    business_name:   a.business_name,
    meerkat_role_id: (a.features as any)?.meerkat_role_id ?? null,
  }));
  const hasCoordinator = checkinsAgents.some(a =>
    a.meerkat_role_id === 'nox' || a.meerkat_role_id === 'niva'
  );

  // Prefer coordinator (handles reporting/dispatch); fallback to any with role
  const reporter = (all ?? []).find(
    (a: any) => (a.features as any)?.is_coordinator
  ) ?? (all ?? []).find((a: any) => a.role) ?? all?.[0];

  const meerkatRoleId = ((reporter as any)?.features as any)?.meerkat_role_id ?? null;
  const reportAgentId = (reporter as any)?.id ?? agents[0]?.id ?? '';

  return (
    <div id="of-reportes">
      <OpsReportsSection
        token={token}
        agents={agents}
        meerkatRoleId={meerkatRoleId}
        reportAgentId={reportAgentId}
        hasCoordinator={hasCoordinator}
        checkinsAgents={checkinsAgents}
      />
    </div>
  );
}
