/**
 * Admin gate (C3 iniciativa Company OS).
 *
 * Principio del artículo: "Power flows through gates. Anything that spends,
 * hires, ships, or fires queues for an explicit yes. No gate, no company,
 * just a leak with a UI."
 *
 * Y también: "A failed policy check makes approval an explicit override,
 * never the default."
 *
 * Este módulo modela solicitudes de acción destructiva (grants grandes,
 * refunds, cancelaciones) que quedan en cola hasta que un admin las
 * apruebe explícitamente. La decisión queda en el log con timestamp y
 * quien decidió. Rechazar es tan explícito como aprobar.
 */

import { createAdminClient } from '@/lib/supabase/admin';

export type ApprovalType =
  | 'grant_ops'
  | 'refund'
  | 'cancel_agent'
  | 'plan_change'
  | 'modify_learnings';

export type ApprovalStatus = 'pending' | 'approved' | 'rejected';

export interface PolicyCheck {
  name:    string;
  passed:  boolean;
  detail:  string;
}

export interface ApprovalMetadata {
  [k: string]: unknown;
}

export interface CreateApprovalInput {
  type:          ApprovalType;
  title:         string;
  rationale?:    string;
  requestedBy?:  string;
  amount?:       number;
  targetId?:     string;
  targetEmail?:  string;
  metadata?:     ApprovalMetadata;
  checks?:       PolicyCheck[];
}

export interface Approval {
  id:            string;
  type:          ApprovalType;
  title:         string;
  rationale:     string | null;
  requested_by:  string;
  amount:        number | null;
  target_id:     string | null;
  target_email:  string | null;
  metadata:      ApprovalMetadata;
  checks:        PolicyCheck[];
  status:        ApprovalStatus;
  created_at:    string;
  decided_at:    string | null;
  decided_by:    string | null;
  decision_note: string | null;
  executed_at:   string | null;
  execution_result: Record<string, unknown> | null;
}

// ── Policy checks ────────────────────────────────────────────────────────────

/**
 * Grant de ops — checks disponibles al momento del request.
 * Los checks se guardan en el approval y se muestran al aprobador. Si algún
 * check falla, el botón por default lee "Override and approve" en vez de
 * "Approve" — la aprobación no es la ruta fácil.
 */
export async function grantOpsChecks(portalEmail: string, count: number): Promise<PolicyCheck[]> {
  const supabase = createAdminClient();
  const checks: PolicyCheck[] = [];

  // Check 1: agente(s) existen y están activos
  const { data: agents } = await supabase
    .from('voice_agents')
    .select('id, business_name, active, ai_ops_used, ai_ops_limit')
    .eq('portal_email', portalEmail);

  if (!agents?.length) {
    checks.push({ name: 'agent_exists', passed: false, detail: `Sin agentes para ${portalEmail}` });
    return checks;
  }
  const active = agents.filter(a => a.active);
  checks.push({
    name:   'agent_active',
    passed: active.length > 0,
    detail: `${active.length}/${agents.length} agentes activos en el portal`,
  });

  // Check 2: no está ya al 200% del límite (indicador de abuso)
  const overLimit = agents.filter(a => {
    const used  = a.ai_ops_used  ?? 0;
    const limit = a.ai_ops_limit ?? 0;
    return limit > 0 && used > limit * 2;
  });
  checks.push({
    name:   'not_severely_over',
    passed: overLimit.length === 0,
    detail: overLimit.length === 0
      ? 'Ningún agente > 200% del límite'
      : `${overLimit.length} agente(s) ya sobre 200% (posible abuso)`,
  });

  // Check 3: budget diario de grants no excedido
  const startOfDay = new Date(new Date().setHours(0, 0, 0, 0)).toISOString();
  const { data: todaysGrants } = await supabase
    .from('admin_approvals')
    .select('amount')
    .eq('type', 'grant_ops')
    .eq('status', 'approved')
    .gte('decided_at', startOfDay);

  const grantedToday = (todaysGrants ?? []).reduce((s, r) => s + (r.amount as number ?? 0), 0);
  const DAILY_GRANT_CAP = 500;
  const wouldExceed = grantedToday + count > DAILY_GRANT_CAP;
  checks.push({
    name:   'within_daily_budget',
    passed: !wouldExceed,
    detail: wouldExceed
      ? `Cap diario de ${DAILY_GRANT_CAP} ops rebasado (hoy: ${grantedToday} + este: ${count})`
      : `${grantedToday} ops otorgadas hoy de cap ${DAILY_GRANT_CAP}`,
  });

  return checks;
}

// ── CRUD ──────────────────────────────────────────────────────────────────────

export async function createApproval(input: CreateApprovalInput): Promise<Approval> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('admin_approvals')
    .insert({
      type:         input.type,
      title:        input.title,
      rationale:    input.rationale     ?? null,
      requested_by: input.requestedBy   ?? 'admin',
      amount:       input.amount        ?? null,
      target_id:    input.targetId      ?? null,
      target_email: input.targetEmail   ?? null,
      metadata:     input.metadata      ?? {},
      checks:       input.checks        ?? [],
      status:       'pending',
    })
    .select('*')
    .single();
  if (error) throw new Error(`createApproval: ${error.message}`);
  return data as Approval;
}

export async function listApprovals(status?: ApprovalStatus, limit = 50): Promise<Approval[]> {
  const supabase = createAdminClient();
  let q = supabase
    .from('admin_approvals')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (status) q = q.eq('status', status);
  const { data, error } = await q;
  if (error) throw new Error(`listApprovals: ${error.message}`);
  return (data ?? []) as Approval[];
}

export async function getApproval(id: string): Promise<Approval | null> {
  const supabase = createAdminClient();
  const { data } = await supabase.from('admin_approvals').select('*').eq('id', id).maybeSingle();
  return (data as Approval | null) ?? null;
}

// ── Decidir ──────────────────────────────────────────────────────────────────

export interface DecisionInput {
  id:            string;
  approve:       boolean;
  decidedBy:     string;
  note?:         string;
}

export async function decideApproval(input: DecisionInput): Promise<Approval> {
  const supabase = createAdminClient();
  const current = await getApproval(input.id);
  if (!current) throw new Error(`Approval ${input.id} no existe`);
  if (current.status !== 'pending') throw new Error(`Approval ${input.id} ya está ${current.status}`);

  const { data, error } = await supabase
    .from('admin_approvals')
    .update({
      status:        input.approve ? 'approved' : 'rejected',
      decided_at:    new Date().toISOString(),
      decided_by:    input.decidedBy,
      decision_note: input.note ?? null,
    })
    .eq('id', input.id)
    .eq('status', 'pending')      // guard: no doble-decidir bajo race
    .select('*')
    .single();
  if (error) throw new Error(`decideApproval: ${error.message}`);
  return data as Approval;
}

// ── Ejecutar la acción aprobada ──────────────────────────────────────────────

export interface ExecutionResult {
  ok:      boolean;
  message: string;
  data?:   Record<string, unknown>;
}

/**
 * Ejecuta la acción respaldada por el approval. Se llama después de
 * decideApproval con approve=true. Solo hace la acción; el status del
 * approval se marca en executed_at + execution_result.
 */
export async function executeApproval(approval: Approval): Promise<ExecutionResult> {
  const supabase = createAdminClient();

  let result: ExecutionResult;
  try {
    switch (approval.type) {
      case 'grant_ops': {
        if (!approval.target_email || approval.amount == null) {
          result = { ok: false, message: 'Falta target_email o amount' };
          break;
        }
        const count = approval.amount;
        const { data: before } = await supabase
          .from('voice_agents')
          .select('id, ai_ops_limit')
          .eq('portal_email', approval.target_email);
        if (!before?.length) {
          result = { ok: false, message: `Sin agentes para ${approval.target_email}` };
          break;
        }
        const updates = before.map(a =>
          supabase
            .from('voice_agents')
            .update({ ai_ops_limit: (a.ai_ops_limit ?? 0) + count })
            .eq('id', a.id)
        );
        const results = await Promise.allSettled(updates);
        const failed = results.filter(r => r.status === 'rejected').length;
        result = {
          ok:      failed === 0,
          message: `+${count} ops otorgadas a ${before.length - failed}/${before.length} agentes`,
          data:    { granted: count, affected: before.length - failed },
        };
        break;
      }
      // Placeholder para futuros tipos — no se ejecutan automáticamente.
      // Nazre decide manualmente en el admin correspondiente hasta que
      // valga la pena automatizar. Marcamos como executed sin efecto real.
      default:
        result = { ok: true, message: `Acción "${approval.type}" marcada como aprobada — ejecuta manualmente en el admin correspondiente.` };
    }
  } catch (err) {
    result = { ok: false, message: `Error al ejecutar: ${err instanceof Error ? err.message : String(err)}` };
  }

  await supabase
    .from('admin_approvals')
    .update({
      executed_at:      new Date().toISOString(),
      execution_result: result as unknown as Record<string, unknown>,
    })
    .eq('id', approval.id);

  return result;
}

// ── Count helper (útil para el cockpit) ──────────────────────────────────────

export async function pendingCount(): Promise<number> {
  const supabase = createAdminClient();
  const { count } = await supabase
    .from('admin_approvals')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'pending');
  return count ?? 0;
}
