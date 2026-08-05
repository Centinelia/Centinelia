/**
 * Graph engineering — state machine formal para agent_tasks.
 *
 * Reemplaza los .update({ status: 'X' }) esparcidos por 4+ archivos con
 * una función central que:
 *   1. Valida que la transición sea legal (desde estado actual real, no asumido).
 *   2. Escribe la nueva fila en agent_tasks + fila append-only en task_state_transitions.
 *   3. Emite trace unificado para observabilidad.
 *
 * Prohibe estados imposibles: pasar de 'completed' a 'in_progress',
 * saltar 'awaiting_plan_approval' → 'completed' sin cron, etc.
 */
import type { createAdminClient } from '@/lib/supabase/admin';

type SupabaseClient = ReturnType<typeof createAdminClient>;

export type AgentTaskStatus =
  | 'awaiting_plan_approval'
  | 'pending'
  | 'in_progress'
  | 'completed'
  | 'partial'
  | 'failed'
  | 'cancelled';

/**
 * Nodos del grafo. Ver docs/graph-agent-task.md para diagrama.
 *
 * Grafo:
 *   [start]
 *     ├─→ awaiting_plan_approval ──(user_approves)──→ pending
 *     │                          ──(user_rejects)───→ cancelled
 *     └─→ pending  (auto-approved o sin threshold)
 *   pending ──(cron pickup)──→ in_progress
 *   in_progress ──(executor)──→ completed | partial | failed
 *   * ──(admin/user cancel)──→ cancelled  (excepto desde estados terminales)
 *
 * Terminales: completed, partial, failed, cancelled.
 */
export const VALID_TRANSITIONS: Record<AgentTaskStatus | 'null', AgentTaskStatus[]> = {
  null:                     ['awaiting_plan_approval', 'pending'], // creación
  awaiting_plan_approval:   ['pending', 'cancelled'],
  pending:                  ['in_progress', 'cancelled'],
  in_progress:              ['completed', 'partial', 'failed', 'cancelled'],
  completed:                [],
  partial:                  [],
  failed:                   [],
  cancelled:                [],
};

const TERMINAL_STATES: readonly AgentTaskStatus[] = ['completed', 'partial', 'failed', 'cancelled'];

export function isTerminal(s: AgentTaskStatus): boolean {
  return TERMINAL_STATES.includes(s);
}

export function canTransition(from: AgentTaskStatus | null, to: AgentTaskStatus): boolean {
  const key = (from ?? 'null') as AgentTaskStatus | 'null';
  return VALID_TRANSITIONS[key]?.includes(to) ?? false;
}

export interface TransitionOptions {
  supabase:  SupabaseClient;
  taskId:    string;
  toStatus:  AgentTaskStatus;
  actor:     string;              // 'user', 'cron', 'executor', 'system', 'agent:<uuid>'
  reason:    string;              // human-readable slug
  metadata?: Record<string, unknown>;
  /** Campos extra a escribir en agent_tasks en la misma UPDATE. */
  extraFields?: Record<string, unknown>;
  /** Si true, no falla si la transición no es válida — solo loguea warning. Default false. */
  soft?: boolean;
}

export interface TransitionResult {
  ok:        boolean;
  from:      AgentTaskStatus | null;
  to:        AgentTaskStatus;
  transitionId?: string;
  error?:    string;
}

/**
 * Ejecuta una transición con validación de estado actual (read-then-write).
 * Falla silenciosa (return ok:false) si la transición es inválida — la
 * decisión de qué hacer con el error queda al caller.
 */
export async function transitionAgentTask(opts: TransitionOptions): Promise<TransitionResult> {
  const { supabase, taskId, toStatus, actor, reason, metadata, extraFields, soft } = opts;

  // 1. Leer estado actual — sin esto no podemos validar.
  const { data: current, error: readErr } = await supabase
    .from('agent_tasks')
    .select('status')
    .eq('id', taskId)
    .single();

  if (readErr || !current) {
    return { ok: false, from: null, to: toStatus, error: readErr?.message ?? 'task not found' };
  }

  const fromStatus = current.status as AgentTaskStatus | null;

  // 2. Validar transición legal
  if (!canTransition(fromStatus, toStatus)) {
    const msg = `Transición inválida: ${fromStatus ?? 'null'} → ${toStatus}`;
    if (!soft) {
      console.warn('[state-machine/agent-task]', msg, { taskId, actor, reason });
      return { ok: false, from: fromStatus, to: toStatus, error: msg };
    }
    console.warn('[state-machine/agent-task] SOFT transition (proceeding anyway):', msg, { taskId, actor, reason });
  }

  // 3. UPDATE agent_tasks con status + extraFields
  const updates: Record<string, unknown> = { status: toStatus, ...(extraFields ?? {}) };
  const { error: updErr } = await supabase.from('agent_tasks').update(updates).eq('id', taskId);
  if (updErr) return { ok: false, from: fromStatus, to: toStatus, error: updErr.message };

  // 4. INSERT append-only en task_state_transitions (fire-and-forget para trace)
  const { data: transitionRow, error: transErr } = await supabase
    .from('task_state_transitions')
    .insert({
      task_id:      taskId,
      from_status:  fromStatus,
      to_status:    toStatus,
      actor,
      reason,
      metadata:     metadata ?? null,
    })
    .select('id')
    .single();

  if (transErr) {
    console.warn('[state-machine/agent-task] transition log insert failed (status actualizado igualmente):', transErr.message);
  }

  return { ok: true, from: fromStatus, to: toStatus, transitionId: transitionRow?.id as string | undefined };
}

/**
 * Helper para INSERT inicial de una tarea con transición registrada.
 * Uso desde delegar-tarea/route.ts.
 */
export async function createAgentTask(opts: {
  supabase:      SupabaseClient;
  portalEmail:   string;
  createdBy:     string | null;
  assignedTo:    string | null;
  title:         string;
  description:   string | null;
  triggerType:   string;
  sourceContext: string | null;
  initialStatus: 'awaiting_plan_approval' | 'pending' | 'in_progress';
  successCriteria?: string | null;
  maxIterations?:   number | null;
  plan?:            unknown;
  planApprovalToken?: string | null;
  actor:            string;
  reason:           string;
  extraFields?:     Record<string, unknown>;
}): Promise<{ ok: boolean; taskId?: string; error?: string }> {
  const { supabase, portalEmail, createdBy, assignedTo, title, description, triggerType, sourceContext,
          initialStatus, successCriteria, maxIterations, plan, planApprovalToken, actor, reason, extraFields } = opts;

  const insertRow: Record<string, unknown> = {
    portal_email:        portalEmail,
    created_by:          createdBy,
    assigned_to:         assignedTo,
    title:               title.slice(0, 200),
    description,
    status:              initialStatus,
    trigger_type:        triggerType,
    source_context:      sourceContext,
    success_criteria:    successCriteria ?? null,
    max_iterations:      maxIterations ?? null,
    ...(plan !== undefined ? { plan } : {}),
    ...(planApprovalToken ? { plan_approval_token: planApprovalToken } : {}),
    ...(initialStatus === 'in_progress' ? { started_at: new Date().toISOString() } : {}),
    ...(extraFields ?? {}),
  };

  const { data, error } = await supabase.from('agent_tasks').insert(insertRow).select('id').single();
  if (error || !data) return { ok: false, error: error?.message ?? 'insert failed' };

  const taskId = data.id as string;

  await supabase.from('task_state_transitions').insert({
    task_id:      taskId,
    from_status:  null,
    to_status:    initialStatus,
    actor,
    reason,
    metadata:     { title: title.slice(0, 200), trigger_type: triggerType, assigned_to: assignedTo },
  });

  return { ok: true, taskId };
}
