export const dynamic = 'force-dynamic';

import { createAdminClient }            from '@/lib/supabase/admin';
import { notFound, redirect }           from 'next/navigation';
import { cookies }                      from 'next/headers';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';
import IntegrationsHub from '../../IntegrationsHub';
import type { Plan }   from '@/types/agent';
import { SectionHeader } from '@/components/portal-ui';

interface Props { params: Promise<{ token: string }> }

export default async function IntegracionesPage({ params }: Props) {
  const { token } = await params;

  const cookieStore = await cookies();
  const session     = await verifySession(cookieStore.get(PORTAL_COOKIE)?.value ?? '');

  // Sub-usuario sin módulo asignado no puede acceder por URL directa.
  // El sidebar ya filtra por modules, este guard cierra el bypass.
  if (session?.isSubUser && session.modules && !session.modules.includes('integraciones'))
    redirect(`/portal/${token}/oficina`);

  const supabase = createAdminClient();
  const { data: agent } = await supabase
    .from('voice_agents')
    .select('id, portal_email, plan, notion_access_token, features')
    .eq('portal_token', token)
    .single();
  if (!agent) notFound();

  if (session?.portalEmail && agent.portal_email && agent.portal_email !== session.portalEmail)
    redirect('/portal/login');

  const { data: allAgents } = agent.portal_email
    ? await supabase.from('voice_agents').select('role, features, notion_access_token').eq('portal_email', agent.portal_email)
    : { data: [] };

  const hasOpsAgent = (allAgents ?? []).some((a: any) => a.role) || !!(agent as any).features?.role;
  const hasNotion   = !!(agent as any).notion_access_token ||
    (allAgents ?? []).some((a: any) => !!a.notion_access_token);

  return (
    <div id="of-integraciones" className="flex flex-col gap-8">

      <div>
        <SectionHeader
          as="h2"
          eyebrow="Integraciones"
          title="Conecta las herramientas con las que trabajará tu equipo."
          className="mb-5"
        />
        <IntegrationsHub
          token={token}
          plan={agent.plan as Plan}
          hasOpsAgent={hasOpsAgent}
          hasNotion={hasNotion}
        />
      </div>

    </div>
  );
}
