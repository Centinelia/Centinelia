export const dynamic = 'force-dynamic';

import { createAdminClient } from '@/lib/supabase/admin';
import { getAgentAccess } from '@/lib/portal/agent-access';
import type { GuardiaSchedule, DirectorioContacto } from '@/lib/helpdesk/folio';
import HelpdeskSection   from './HelpdeskSection';
import IncidentesSection from './IncidentesSection';
import DirectorioEditor  from './DirectorioEditor';
import GuardiaEditor     from './GuardiaEditor';

interface Props { params: Promise<{ token: string }> }

export default async function HelpdeskPage({ params }: Props) {
  const { token } = await params;
  const supabase  = createAdminClient();

  const [{ data: agent }, access] = await Promise.all([
    supabase.from('voice_agents').select('id, agent_name, features, guardia_schedule, directorio_interno').eq('portal_token', token).single(),
    getAgentAccess(token),
  ]);

  const { data: incidents } = access
    ? await supabase.from('it_incidents').select('*').in('agent_id', access.ids).order('created_at', { ascending: false })
    : { data: [] };

  const guardia:    GuardiaSchedule       = (agent?.guardia_schedule as GuardiaSchedule)    ?? { areas: [] };
  const directorio: DirectorioContacto[]  = (agent?.directorio_interno as DirectorioContacto[]) ?? [];

  const employeeName    = ((agent as any)?.agent_name as string | null)?.trim() || 'Tu empleado';
  const totalTurnos     = guardia.areas.reduce((n, a) => n + a.turnos.length, 0);
  const scheduleLabel   = guardia.areas.length === 0
    ? '24/7'
    : `${guardia.areas.length} área${guardia.areas.length !== 1 ? 's' : ''}, ${totalTurnos} turno${totalTurnos !== 1 ? 's' : ''}`;
  const lastActivityRaw = (incidents ?? [])[0]?.created_at ?? null;
  const lastActivity    = lastActivityRaw
    ? new Date(lastActivityRaw).toLocaleString('es-MX', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
    : null;

  return (
    <div id="of-helpdesk" className="flex flex-col gap-6 p-4 md:p-6">

      {/* Employee presence header */}
      <div className="flex items-center gap-3 rounded-xl px-4 py-3"
        style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border-2)' }}>
        <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 text-sm font-bold"
          style={{ background: 'rgba(108,59,255,0.12)', color: '#9B6DFF', border: '1px solid rgba(108,59,255,0.2)' }}>
          {employeeName.charAt(0).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-widest mb-0.5" style={{ color: 'var(--c-text-4)' }}>
            Mesa de ayuda
          </p>
          <p className="text-sm font-medium leading-snug" style={{ color: 'var(--c-text)' }}>
            {employeeName} está monitoreando solicitudes, incidentes y pendientes.
          </p>
          <div className="flex items-center gap-3 mt-1.5 flex-wrap">
            <span className="flex items-center gap-1.5 text-xs" style={{ color: '#22c55e' }}>
              <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: '#22c55e' }} />
              Disponible
            </span>
            <span className="text-xs" style={{ color: 'var(--c-text-4)' }}>Guardia: {scheduleLabel}</span>
            {lastActivity && (
              <span className="text-xs" style={{ color: 'var(--c-text-4)' }}>Última actividad: {lastActivity}</span>
            )}
          </div>
        </div>
      </div>

      <IncidentesSection token={token} initialIncidents={incidents ?? []} />

      <HelpdeskSection token={token} />

      {/* Configuration — visually separated from operations */}
      <div className="flex flex-col gap-3 pt-4" style={{ borderTop: '1px solid var(--c-border)' }}>
        <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--c-text-4)' }}>
          Configuración del empleado
        </p>
        <DirectorioEditor token={token} initial={directorio} />
        <GuardiaEditor    token={token} initial={guardia} />
      </div>

    </div>
  );
}
