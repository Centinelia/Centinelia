export const dynamic = 'force-dynamic';

import { createAdminClient } from '@/lib/supabase/admin';
import { getAgentAccess } from '@/lib/portal/agent-access';
import type { GuardiaSchedule, DirectorioContacto } from '@/lib/helpdesk/folio';
import HelpdeskSection  from './HelpdeskSection';
import IncidentesSection from './IncidentesSection';
import DirectorioEditor from './DirectorioEditor';
import GuardiaEditor    from './GuardiaEditor';

interface Props { params: Promise<{ token: string }> }

export default async function HelpdeskPage({ params }: Props) {
  const { token } = await params;
  const supabase  = createAdminClient();

  const [{ data: agent }, access] = await Promise.all([
    supabase.from('voice_agents').select('id, guardia_schedule, directorio_interno').eq('portal_token', token).single(),
    getAgentAccess(token),
  ]);

  const { data: incidents } = access
    ? await supabase.from('it_incidents').select('*').in('agent_id', access.ids).order('created_at', { ascending: false })
    : { data: [] };

  const guardia:   GuardiaSchedule      = (agent?.guardia_schedule as GuardiaSchedule)   ?? { areas: [] };
  const directorio: DirectorioContacto[] = (agent?.directorio_interno as DirectorioContacto[]) ?? [];

  return (
    <div id="of-helpdesk" className="flex flex-col gap-6 p-4 md:p-6">
      <IncidentesSection token={token} initialIncidents={incidents ?? []} />

      <HelpdeskSection token={token} />

      <div className="flex flex-col gap-3">
        <p className="text-xs font-semibold uppercase tracking-widest"
          style={{ color: 'var(--c-text-4)' }}>
          Configuración del empleado
        </p>
        <DirectorioEditor token={token} initial={directorio} />
        <GuardiaEditor    token={token} initial={guardia} />
      </div>
    </div>
  );
}
