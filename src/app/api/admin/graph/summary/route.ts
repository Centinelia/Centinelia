import { NextRequest, NextResponse } from 'next/server';
import { isAdmin } from '@/lib/admin/auth';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

/** Aggregation cross-state-machines para /admin/graph. */

interface StateMachineSummary {
  name:               string;                                // 'agent_tasks', 'ops_inbox', etc.
  label:              string;                                // human-readable
  source_table:       string;                                // 'agent_tasks'
  transitions_table:  string;                                // 'task_state_transitions'
  fk_column:          string;                                // 'task_id'
  status_distribution: Record<string, number>;               // { pending: 5, completed: 12, ... }
  transitions_24h:    number;                                // total transitions last 24h
  transitions_by_actor: Record<string, number>;              // { user: 3, cron: 8, ... }
  top_reasons:        Array<{ reason: string; count: number }>;
  terminal_ratio:     number | null;                         // % en estados terminales
}

const MACHINES = [
  { name: 'agent_tasks',         label: 'Tareas delegadas',  source_table: 'agent_tasks',        transitions_table: 'task_state_transitions',      fk_column: 'task_id',     terminals: ['completed', 'partial', 'failed', 'cancelled'] },
  { name: 'ops_inbox',           label: 'Bandeja',            source_table: 'ops_inbox',          transitions_table: 'inbox_state_transitions',     fk_column: 'inbox_id',    terminals: ['skipped', 'approved', 'rejected', 'archived'] },
  { name: 'contract_drafts',     label: 'Contratos',          source_table: 'contract_drafts',    transitions_table: 'contract_state_transitions',  fk_column: 'contract_id', terminals: ['firmado', 'cancelado', 'rechazado'] },
  { name: 'outbound_contacts',   label: 'Campañas salientes', source_table: 'outbound_contacts',  transitions_table: 'outbound_state_transitions',  fk_column: 'contact_id',  terminals: ['completed', 'failed', 'dnc'] },
  { name: 'onboarding_instances',label: 'Onboarding',         source_table: 'onboarding_instances', transitions_table: 'onboarding_state_transitions', fk_column: 'instance_id', terminals: ['completado', 'cancelado'] },
];

export async function GET(_req: NextRequest) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = createAdminClient();
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const summaries: StateMachineSummary[] = [];

  for (const m of MACHINES) {
    // 1. Distribution de estados actuales
    const { data: items } = await supabase
      .from(m.source_table)
      .select('status')
      .limit(10_000);

    const dist: Record<string, number> = {};
    let terminalCount = 0;
    for (const row of items ?? []) {
      const st = (row as { status?: string }).status ?? 'unknown';
      dist[st] = (dist[st] ?? 0) + 1;
      if (m.terminals.includes(st)) terminalCount++;
    }
    const total = items?.length ?? 0;

    // 2. Transitions últimas 24h
    const { data: trans } = await supabase
      .from(m.transitions_table)
      .select('actor, reason')
      .gte('transitioned_at', since24h)
      .limit(10_000);

    const byActor:  Record<string, number> = {};
    const byReason: Record<string, number> = {};
    for (const t of trans ?? []) {
      const a = (t as { actor?: string }).actor ?? 'unknown';
      const r = (t as { reason?: string }).reason ?? 'unknown';
      byActor[a]  = (byActor[a]  ?? 0) + 1;
      byReason[r] = (byReason[r] ?? 0) + 1;
    }

    const topReasons = Object.entries(byReason)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([reason, count]) => ({ reason, count }));

    summaries.push({
      name:                 m.name,
      label:                m.label,
      source_table:         m.source_table,
      transitions_table:    m.transitions_table,
      fk_column:            m.fk_column,
      status_distribution:  dist,
      transitions_24h:      trans?.length ?? 0,
      transitions_by_actor: byActor,
      top_reasons:          topReasons,
      terminal_ratio:       total ? terminalCount / total : null,
    });
  }

  // 3. Feed cronológico de las últimas 30 transiciones cross-machine
  const feedQueries = await Promise.all(MACHINES.map(async m => {
    const { data } = await supabase
      .from(m.transitions_table)
      .select('*')
      .order('transitioned_at', { ascending: false })
      .limit(10);
    return ((data ?? []) as unknown as Record<string, unknown>[]).map(r => ({
      machine:       m.name,
      machine_label: m.label,
      entity_id:     r[m.fk_column] as string,
      from_status:   r.from_status as string | null,
      to_status:     r.to_status as string,
      actor:         r.actor as string,
      reason:        r.reason as string | null,
      at:            r.transitioned_at as string,
    }));
  }));

  const feed = feedQueries.flat()
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 40);

  return NextResponse.json({ summaries, feed });
}
