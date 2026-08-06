import { createAdminClient } from '@/lib/supabase/admin';
import HistorialConsumoClient, {
  type LedgerSource,
  type MinutesEntry,
  type TaskEntry,
} from './HistorialConsumoClient';

/**
 * Server component: fetch minutes ledger + agent_tasks and pass to
 * HistorialConsumoClient which handles the toggle Minutos/Tareas + filter.
 */
export default async function HistorialConsumoSection({
  portalEmail,
  agentIds,
  minutesIncluded,
  callerNames = {},
}: {
  portalEmail:     string;
  agentIds:        string[];
  minutesIncluded: number;
  callerNames?:    Record<string, string>;
}) {
  const supabase = createAdminClient();

  const [ledgerRes, callsRes, tasksRes, agentsRes] = await Promise.all([
    // Minutes ledger — todos los agentes de la cuenta
    supabase
      .from('minutes_ledger')
      .select('id, agent_id, created_at, amount, description, source')
      .in('agent_id', agentIds)
      .order('created_at', { ascending: false })
      .limit(500),
    // Calls (debits) — todos los agentes de la cuenta
    supabase
      .from('voice_calls')
      .select('id, agent_id, created_at, duration_seconds, caller_number')
      .in('agent_id', agentIds)
      .order('created_at', { ascending: false })
      .limit(500),
    // Tareas ejecutadas — por portal_email
    supabase
      .from('agent_tasks')
      .select('id, title, description, status, trigger_type, source_context, goal_met, completed_at, created_at, assigned_to')
      .eq('portal_email', portalEmail)
      .order('created_at', { ascending: false })
      .limit(500),
    // Mapa agent_id → agent_name para las tareas
    supabase
      .from('voice_agents')
      .select('id, agent_name, business_name')
      .eq('portal_email', portalEmail),
  ]);

  const agentNameMap: Record<string, string> = {};
  for (const a of (agentsRes.data ?? [])) {
    agentNameMap[(a as any).id as string] = ((a as any).agent_name as string | null)?.trim() || ((a as any).business_name as string) || 'Empleado';
  }

  // Build minutes entries (credits + debits) with running balance
  const credits: Omit<MinutesEntry, 'balance'>[] = (ledgerRes.data ?? []).map((r: any) => ({
    id:          r.id as string,
    date:        r.created_at as string,
    amount:      r.amount as number,
    description: r.description as string,
    source:      ((r.source as LedgerSource) ?? 'ajuste'),
  }));

  const debits: Omit<MinutesEntry, 'balance'>[] = (callsRes.data ?? []).map((c: any) => {
    const mins   = Math.max(1, Math.ceil((c.duration_seconds as number) / 60));
    const caller = ((c.caller_number as string | null)?.trim()) || 'Número privado';
    return {
      id:          c.id as string,
      date:        c.created_at as string,
      amount:      -mins,
      description: `${caller} · ${mins} min`,
      source:      'llamada' as LedgerSource,
    };
  });

  // Seed activation entry if empty
  if (credits.length === 0 && minutesIncluded > 0) {
    const firstDate = debits.length > 0 ? debits[debits.length - 1].date : new Date().toISOString();
    credits.push({
      id:          'initial-plan',
      date:        firstDate,
      amount:      minutesIncluded,
      description: `Plan incluido, ${minutesIncluded} minutos`,
      source:      'activacion' as LedgerSource,
    });
  }

  const chronological = [...credits, ...debits].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );
  let running = 0;
  const withBalance: MinutesEntry[] = chronological.map(e => {
    running += e.amount;
    return { ...e, balance: running };
  });
  const minutes = withBalance.reverse();

  // Build task entries
  const tasks: TaskEntry[] = ((tasksRes.data ?? []) as any[]).map(t => ({
    id:            t.id as string,
    date:          (t.completed_at ?? t.created_at) as string,
    title:         (t.title as string) ?? 'Sin título',
    description:   (t.description as string | null) ?? null,
    agentName:     (t.assigned_to as string | null) ? (agentNameMap[t.assigned_to as string] ?? null) : null,
    triggerType:   (t.trigger_type as string | null) ?? null,
    status:        (t.status as string) ?? 'pending',
    goalMet:       (t.goal_met as boolean | null) ?? null,
    sourceContext: (t.source_context as string | null) ?? null,
  }));

  if (minutes.length === 0 && tasks.length === 0) {
    return (
      <p className="text-xs text-center py-4" style={{ color: 'var(--c-text-3)' }}>
        Sin movimientos ni tareas registrados
      </p>
    );
  }

  return <HistorialConsumoClient minutes={minutes} tasks={tasks} callerNames={callerNames} />;
}
