/**
 * Graph engineering — reglas declarativas de recovery para stuck-states.
 *
 * Cada regla define: qué state machine, qué estado stuck, cuánto tiempo,
 * qué acción tomar. El cron /api/cron/recovery las evalúa periódicamente.
 *
 * Diseño: DECLARATIVO no imperativo. Agregar una nueva regla = 1 objeto
 * aquí, no un endpoint nuevo. El cron itera sobre RECOVERY_RULES.
 */
import type { createAdminClient } from '@/lib/supabase/admin';

type SupabaseClient = ReturnType<typeof createAdminClient>;

export interface RecoveryRule {
  /** Identificador único (aparece en logs y admin UI). */
  id:               string;
  /** Tabla origen a query. */
  sourceTable:      string;
  /** Columna de estado a filtrar. */
  statusColumn:     string;
  /** Valor de estado considerado "stuck". */
  stuckStatus:      string;
  /** Columna de timestamp para calcular antigüedad (created_at, started_at, updated_at). */
  ageColumn:        string;
  /** Minutos que debe llevar en stuckStatus antes de aplicar recovery. */
  stuckAfterMinutes: number;
  /** Descripción humano-legible. */
  description:      string;
  /** Acción a ejecutar. Recibe la row stuck y el supabase client. */
  action:           (row: Record<string, unknown>, supabase: SupabaseClient) => Promise<{ recovered: boolean; note?: string }>;
  /** Query WHERE extras (opcional): campos adicionales para acotar. */
  extraFilters?:    Array<{ column: string; op: 'eq' | 'is'; value: unknown }>;
}

// ─────────────────────────────────────────────────────────────────────────────
// REGLAS
// ─────────────────────────────────────────────────────────────────────────────

export const RECOVERY_RULES: RecoveryRule[] = [
  {
    id:                'agent_task_awaiting_approval_expired',
    sourceTable:       'agent_tasks',
    statusColumn:      'status',
    stuckStatus:       'awaiting_plan_approval',
    ageColumn:         'created_at',
    stuckAfterMinutes: 24 * 60,  // 24h
    description:       'Plan approval sin respuesta del dueño en 24h — cancela automáticamente.',
    action: async (row, supabase) => {
      const { transitionAgentTask } = await import('@/lib/state-machines/agent-task');
      const res = await transitionAgentTask({
        supabase, taskId: row.id as string,
        toStatus: 'cancelled',
        actor:    'system_recovery',
        reason:   'plan_approval_expired_24h',
        metadata: { recovered_from: 'awaiting_plan_approval', created_at: row.created_at },
      });
      return { recovered: res.ok, note: res.error };
    },
  },
  {
    id:                'agent_task_in_progress_stuck',
    sourceTable:       'agent_tasks',
    statusColumn:      'status',
    stuckStatus:       'in_progress',
    ageColumn:         'started_at',
    stuckAfterMinutes: 30,  // 30min → executor colgado
    description:       'Tarea en progreso por más de 30min — executor probablemente colgado, marca failed.',
    action: async (row, supabase) => {
      const { transitionAgentTask } = await import('@/lib/state-machines/agent-task');
      const res = await transitionAgentTask({
        supabase, taskId: row.id as string,
        toStatus: 'failed',
        actor:    'system_recovery',
        reason:   'executor_stuck_30min',
        metadata: { started_at: row.started_at },
        extraFields: { result: 'Recovery automático: executor no terminó en 30min. Reintenta manualmente si es necesario.' },
      });
      return { recovered: res.ok, note: res.error };
    },
  },
  {
    id:                'inbox_pending_expired',
    sourceTable:       'ops_inbox',
    statusColumn:      'status',
    stuckStatus:       'pending',
    ageColumn:         'created_at',
    stuckAfterMinutes: 7 * 24 * 60,  // 7 días
    description:       'Correo pending sin acción en 7 días — archiva automáticamente.',
    action: async (row, supabase) => {
      const { transitionInboxItem } = await import('@/lib/state-machines/inbox-item');
      const res = await transitionInboxItem({
        supabase, inboxId: row.id as string,
        toStatus: 'archived',
        actor:    'system_recovery',
        reason:   'pending_7d_no_action',
        metadata: { created_at: row.created_at },
      });
      return { recovered: res.ok, note: res.error };
    },
  },
  {
    id:                'inbox_info_requested_expired',
    sourceTable:       'ops_inbox',
    statusColumn:      'status',
    stuckStatus:       'info_requested',
    ageColumn:         'created_at',
    stuckAfterMinutes: 14 * 24 * 60,  // 14 días
    description:       'info_requested sin respuesta cliente en 14 días — archiva.',
    action: async (row, supabase) => {
      const { transitionInboxItem } = await import('@/lib/state-machines/inbox-item');
      const res = await transitionInboxItem({
        supabase, inboxId: row.id as string,
        toStatus: 'archived',
        actor:    'system_recovery',
        reason:   'info_requested_14d_no_reply',
      });
      return { recovered: res.ok, note: res.error };
    },
  },
  {
    id:                'outbound_calling_stuck',
    sourceTable:       'outbound_contacts',
    statusColumn:      'status',
    stuckStatus:       'calling',
    ageColumn:         'updated_at',
    stuckAfterMinutes: 10,  // 10min → Vapi debió responder
    description:       'Contact en calling >10min sin webhook — Vapi no respondió, regresa a pending para retry.',
    action: async (row, supabase) => {
      const { transitionOutboundContact } = await import('@/lib/state-machines/outbound-contact');
      const res = await transitionOutboundContact({
        supabase, contactId: row.id as string,
        toStatus: 'pending',
        actor:    'system_recovery',
        reason:   'vapi_webhook_timeout_10min',
        soft:     true,
      });
      return { recovered: res.ok, note: res.error };
    },
  },
  {
    id:                'onboarding_pendiente_reminder',
    sourceTable:       'onboarding_instances',
    statusColumn:      'status',
    stuckStatus:       'pendiente',
    ageColumn:         'created_at',
    stuckAfterMinutes: 14 * 24 * 60,  // 14 días
    description:       'Onboarding pendiente sin respuesta cliente en 14 días — cancela.',
    action: async (row, supabase) => {
      const { transitionOnboarding } = await import('@/lib/state-machines/onboarding-instance');
      const res = await transitionOnboarding({
        supabase, instanceId: row.id as string,
        toStatus: 'cancelado',
        actor:    'system_recovery',
        reason:   'no_client_response_14d',
      });
      return { recovered: res.ok, note: res.error };
    },
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// EJECUTOR
// ─────────────────────────────────────────────────────────────────────────────

export interface RuleExecutionResult {
  ruleId:     string;
  scanned:    number;
  recovered:  number;
  failed:     number;
  errors:     string[];
}

/** Ejecuta UNA regla. Devuelve resumen. */
export async function executeRecoveryRule(rule: RecoveryRule, supabase: SupabaseClient): Promise<RuleExecutionResult> {
  const cutoff = new Date(Date.now() - rule.stuckAfterMinutes * 60_000).toISOString();

  let q = supabase
    .from(rule.sourceTable)
    .select('*')
    .eq(rule.statusColumn, rule.stuckStatus)
    .lt(rule.ageColumn, cutoff)
    .limit(50);

  for (const f of rule.extraFilters ?? []) {
    if (f.op === 'eq') q = q.eq(f.column, f.value);
    else if (f.op === 'is') q = q.is(f.column, f.value as null);
  }

  const { data: rows, error: readErr } = await q;
  if (readErr) {
    return { ruleId: rule.id, scanned: 0, recovered: 0, failed: 0, errors: [readErr.message] };
  }

  const items = (rows ?? []) as Record<string, unknown>[];
  let recovered = 0;
  let failed    = 0;
  const errors: string[] = [];

  for (const row of items) {
    try {
      const res = await rule.action(row, supabase);
      if (res.recovered) recovered++;
      else { failed++; if (res.note) errors.push(`${row.id as string}: ${res.note}`); }
    } catch (err) {
      failed++;
      errors.push(`${row.id as string}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return { ruleId: rule.id, scanned: items.length, recovered, failed, errors: errors.slice(0, 5) };
}

/** Ejecuta TODAS las reglas. Devuelve resumen agregado. */
export async function executeAllRecoveryRules(supabase: SupabaseClient): Promise<{
  totalScanned:   number;
  totalRecovered: number;
  totalFailed:    number;
  results:        RuleExecutionResult[];
}> {
  const results: RuleExecutionResult[] = [];
  for (const rule of RECOVERY_RULES) {
    const r = await executeRecoveryRule(rule, supabase);
    results.push(r);
  }
  return {
    totalScanned:   results.reduce((s, r) => s + r.scanned, 0),
    totalRecovered: results.reduce((s, r) => s + r.recovered, 0),
    totalFailed:    results.reduce((s, r) => s + r.failed, 0),
    results,
  };
}
