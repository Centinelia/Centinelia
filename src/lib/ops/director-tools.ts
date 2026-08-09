/**
 * Tools exclusivas de la Directora General (Niva).
 *
 *   - revisar_desempeno_equipo(periodo): agrega métricas por meerkat de la
 *     cuenta — llamadas, tareas, docs, correos, ops usadas. Read-only.
 *   - aprobar_gasto(concepto, monto, justificacion): registra una aprobación
 *     con audit trail en expense_approvals.
 */
import type { createAdminClient } from '@/lib/supabase/admin';

type SupabaseClient = ReturnType<typeof createAdminClient>;

// ── Periodos soportados ──────────────────────────────────────────────────────

type Periodo = 'hoy' | 'esta_semana' | 'este_mes' | 'ultima_semana' | 'ultimo_mes' | 'ultimos_30_dias';

function windowFor(periodo: Periodo): { since: Date; until: Date; label: string } {
  const now = new Date();
  const start = new Date(now); start.setUTCHours(0, 0, 0, 0);

  switch (periodo) {
    case 'hoy':
      return { since: start, until: now, label: 'hoy' };
    case 'esta_semana': {
      const s = new Date(start); s.setUTCDate(s.getUTCDate() - ((s.getUTCDay() + 6) % 7));
      return { since: s, until: now, label: 'esta semana' };
    }
    case 'ultima_semana': {
      const e = new Date(start); e.setUTCDate(e.getUTCDate() - ((e.getUTCDay() + 6) % 7));
      const s = new Date(e); s.setUTCDate(s.getUTCDate() - 7);
      return { since: s, until: e, label: 'la semana pasada' };
    }
    case 'este_mes': {
      const s = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
      return { since: s, until: now, label: 'este mes' };
    }
    case 'ultimo_mes': {
      const e = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
      const s = new Date(Date.UTC(e.getUTCFullYear(), e.getUTCMonth() - 1, 1));
      return { since: s, until: e, label: 'el mes pasado' };
    }
    case 'ultimos_30_dias':
    default: {
      const s = new Date(now.getTime() - 30 * 86400_000);
      return { since: s, until: now, label: 'los últimos 30 días' };
    }
  }
}

// ── revisar_desempeno_equipo ─────────────────────────────────────────────────

export interface TeamPerformanceRow {
  agent_id:      string;
  agent_name:    string;
  role:          string | null;
  calls:         number;
  call_minutes:  number;
  tasks_done:    number;
  tasks_failed:  number;
  docs_created:  number;
  emails_in:     number;
  emails_out:    number;
  ops_used:      number;
}

export interface TeamPerformanceResult {
  ok:       boolean;
  periodo:  string;
  since:    string;
  until:    string;
  rows:     TeamPerformanceRow[];
  totals:   Omit<TeamPerformanceRow, 'agent_id' | 'agent_name' | 'role'>;
  summary:  string;
}

export async function reviewTeamPerformance(args: {
  supabase:    SupabaseClient;
  portalEmail: string;
  periodo?:    Periodo;
}): Promise<TeamPerformanceResult> {
  const { supabase, portalEmail } = args;
  const win = windowFor(args.periodo ?? 'esta_semana');
  const sinceIso = win.since.toISOString();
  const untilIso = win.until.toISOString();

  const { data: agents } = await supabase
    .from('voice_agents')
    .select('id, agent_name, role, ai_ops_used')
    .eq('portal_email', portalEmail)
    .eq('active', true);
  const agentIds = (agents ?? []).map(a => a.id as string);

  if (!agentIds.length) {
    return {
      ok: true, periodo: win.label, since: sinceIso, until: untilIso,
      rows: [], totals: { calls: 0, call_minutes: 0, tasks_done: 0, tasks_failed: 0, docs_created: 0, emails_in: 0, emails_out: 0, ops_used: 0 },
      summary: 'No hay empleados activos.',
    };
  }

  const [callsR, tasksR, docsR, inboxR] = await Promise.all([
    supabase.from('voice_calls').select('agent_id, duration_seconds').in('agent_id', agentIds).gte('created_at', sinceIso).lt('created_at', untilIso),
    supabase.from('agent_tasks').select('assigned_to, status').eq('portal_email', portalEmail).gte('created_at', sinceIso).lt('created_at', untilIso),
    supabase.from('ops_documents').select('agent_id').eq('portal_email', portalEmail).gte('created_at', sinceIso).lt('created_at', untilIso),
    supabase.from('ops_inbox').select('agent_id, auto_reply_sent').in('agent_id', agentIds).gte('created_at', sinceIso).lt('created_at', untilIso),
  ]);

  const rows: TeamPerformanceRow[] = [];
  for (const a of agents ?? []) {
    const id = a.id as string;
    const calls = (callsR.data ?? []).filter(c => c.agent_id === id);
    const tasks = (tasksR.data ?? []).filter(t => t.assigned_to === id);
    const docs  = (docsR.data ?? []).filter(d => d.agent_id === id);
    const inbox = (inboxR.data ?? []).filter(i => i.agent_id === id);
    rows.push({
      agent_id:     id,
      agent_name:   (a.agent_name as string) ?? '(sin nombre)',
      role:         (a.role as string | null) ?? null,
      calls:        calls.length,
      call_minutes: Math.round(calls.reduce((s, c) => s + Number(c.duration_seconds ?? 0), 0) / 60),
      tasks_done:   tasks.filter(t => t.status === 'completed').length,
      tasks_failed: tasks.filter(t => t.status === 'failed').length,
      docs_created: docs.length,
      emails_in:    inbox.length,
      emails_out:   inbox.filter(i => i.auto_reply_sent).length,
      ops_used:     Number(a.ai_ops_used ?? 0),
    });
  }

  const totals = rows.reduce((t, r) => ({
    calls:        t.calls + r.calls,
    call_minutes: t.call_minutes + r.call_minutes,
    tasks_done:   t.tasks_done + r.tasks_done,
    tasks_failed: t.tasks_failed + r.tasks_failed,
    docs_created: t.docs_created + r.docs_created,
    emails_in:    t.emails_in + r.emails_in,
    emails_out:   t.emails_out + r.emails_out,
    ops_used:     t.ops_used + r.ops_used,
  }), { calls: 0, call_minutes: 0, tasks_done: 0, tasks_failed: 0, docs_created: 0, emails_in: 0, emails_out: 0, ops_used: 0 });

  const lines = rows.map(r => {
    const bits = [
      `${r.agent_name}${r.role ? ` (${r.role})` : ''}:`,
      r.calls ? `${r.calls} llamadas / ${r.call_minutes} min` : null,
      r.tasks_done ? `${r.tasks_done} tareas ✓` : null,
      r.tasks_failed ? `${r.tasks_failed} tareas ✗` : null,
      r.docs_created ? `${r.docs_created} docs` : null,
      r.emails_in ? `${r.emails_in} correos entrantes (${r.emails_out} auto-respondidos)` : null,
    ].filter(Boolean);
    return `- ${bits.join(' · ') || `${r.agent_name}: sin actividad en el período`}`;
  }).join('\n');

  const summary = `Desempeño del equipo — ${win.label}\n${lines}\n\nTotales: ${totals.calls} llamadas, ${totals.tasks_done} tareas completadas, ${totals.tasks_failed} fallidas, ${totals.docs_created} docs generados, ${totals.emails_in} correos entrantes.`;

  return { ok: true, periodo: win.label, since: sinceIso, until: untilIso, rows, totals, summary };
}

// ── aprobar_gasto ────────────────────────────────────────────────────────────

export interface ExpenseApprovalArgs {
  supabase:      SupabaseClient;
  portalEmail:   string;
  approvedBy:    string;   // agentId
  concept:       string;
  amountMxn:     number;
  justification?: string | null;
  status?:       'approved' | 'rejected';
}

export interface ExpenseApprovalResult {
  ok:       boolean;
  error?:   string;
  id?:      string;
  message?: string;
}

export async function recordExpenseApproval(args: ExpenseApprovalArgs): Promise<ExpenseApprovalResult> {
  const { supabase, portalEmail, approvedBy, concept, amountMxn, justification, status = 'approved' } = args;

  if (!concept?.trim()) return { ok: false, error: 'Falta concepto.' };
  if (!(amountMxn > 0))  return { ok: false, error: 'El monto debe ser mayor a 0.' };

  const { data, error } = await supabase.from('expense_approvals').insert({
    portal_email:  portalEmail,
    approved_by:   approvedBy,
    concept:       concept.trim().slice(0, 500),
    amount_mxn:    amountMxn,
    justification: justification?.trim().slice(0, 1000) || null,
    status,
  }).select('id').single();

  if (error) return { ok: false, error: `No se pudo registrar la aprobación: ${error.message}` };

  const fmt = amountMxn.toLocaleString('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 });
  return {
    ok: true, id: data.id as string,
    message: status === 'approved'
      ? `Aprobación registrada: "${concept.slice(0, 80)}" por ${fmt}. El equipo puede ejecutar.`
      : `Rechazo registrado: "${concept.slice(0, 80)}" por ${fmt}. El equipo no debe ejecutar.`,
  };
}

// ── evaluar_limite_gasto ────────────────────────────────────────────────────
// Cruza el gasto pedido contra:
//   - monthly_expense_budget de la org (si está seteado)
//   - suma de expense_approvals aprobados del mes en curso
// Devuelve señal para que el empleado decida si aprueba solo o escala.

export interface EvaluateBudgetArgs {
  supabase:    SupabaseClient;
  portalEmail: string;
  amountMxn:   number;
}

export interface EvaluateBudgetResult {
  ok:               true;
  budget:           number | null;   // null si org no configuró presupuesto
  spent_this_month: number;
  proposed:         number;
  remaining_after?: number;          // solo si budget != null
  within_budget?:   boolean;         // solo si budget != null
  would_exceed_by?: number;          // solo si excede
  message:          string;
}

export async function evaluateExpenseBudget(args: EvaluateBudgetArgs): Promise<EvaluateBudgetResult> {
  const { supabase, portalEmail, amountMxn } = args;

  const [{ data: org }, { data: rows }] = await Promise.all([
    supabase.from('organizations').select('monthly_expense_budget').eq('portal_email', portalEmail).maybeSingle(),
    supabase.from('expense_approvals')
      .select('amount_mxn')
      .eq('portal_email', portalEmail)
      .eq('status', 'approved')
      .gte('created_at', firstDayOfMonthIso()),
  ]);

  const budget = (org?.monthly_expense_budget as number | null) ?? null;
  const spent  = (rows ?? []).reduce((s, r) => s + Number((r as { amount_mxn: number }).amount_mxn ?? 0), 0);
  const fmt = (n: number) => n.toLocaleString('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 });

  if (budget == null) {
    return {
      ok: true, budget: null, spent_this_month: spent, proposed: amountMxn,
      message: `Sin presupuesto mensual configurado. Este mes ya se aprobaron ${fmt(spent)} en gastos. Solicitud actual: ${fmt(amountMxn)}. Sugiere al dueño configurar presupuesto en Organización → Presupuesto.`,
    };
  }

  const remaining = budget - spent - amountMxn;
  const withinBudget = remaining >= 0;
  return {
    ok:              true,
    budget,
    spent_this_month: spent,
    proposed:         amountMxn,
    remaining_after:  remaining,
    within_budget:    withinBudget,
    would_exceed_by:  withinBudget ? undefined : Math.abs(remaining),
    message: withinBudget
      ? `Dentro de presupuesto. Presupuesto ${fmt(budget)}, gastado ${fmt(spent)} este mes, solicitud ${fmt(amountMxn)}. Quedarán ${fmt(remaining)} para el resto del mes.`
      : `EXCEDE presupuesto por ${fmt(Math.abs(remaining))}. Presupuesto ${fmt(budget)}, gastado ${fmt(spent)}, solicitud ${fmt(amountMxn)}. Escala al dueño antes de aprobar.`,
  };
}

// ── verificar_gasto_recurrente ──────────────────────────────────────────────
// Reemplaza a matchear_orden_compra: no hay tabla de OCs, pero sí historial
// de facturas recibidas en ops_inbox. Si un proveedor tiene N facturas
// previas del mismo rango de monto y todas fueron aprobadas → es gasto
// recurrente, bajo riesgo, empleado puede auto-marcar como pagada sin
// escalar al humano.

export interface VerifyRecurringArgs {
  supabase:    SupabaseClient;
  portalEmail: string;
  proveedor:   string;
  monto?:      number;  // monto de la factura actual — para detectar variación anómala
}

export interface VerifyRecurringResult {
  ok:               true;
  proveedor:        string;
  history_count:    number;
  approved_count:   number;
  last_amount?:     number;
  last_status?:     string;
  amount_variance?: number;    // 0-1, si monto está más de 20% diferente del histórico
  is_recurring:     boolean;   // true si count>=2 aprobados
  recommendation:   'auto_approve' | 'review' | 'unknown_vendor';
  message:          string;
}

export async function verifyRecurringExpense(args: VerifyRecurringArgs): Promise<VerifyRecurringResult> {
  const { supabase, portalEmail, proveedor, monto } = args;
  const proveedorNorm = proveedor.trim().toLowerCase();

  // Buscar histórico en ops_inbox por invoice_data->proveedor o email_from
  // que contenga el nombre. Últimas 20 facturas del org, últimos 12 meses.
  const yearAgo = new Date(Date.now() - 365 * 86400_000).toISOString();
  const { data: agents } = await supabase.from('voice_agents').select('id').eq('portal_email', portalEmail);
  const agentIds = (agents ?? []).map(a => a.id as string);
  if (!agentIds.length) {
    return {
      ok: true, proveedor, history_count: 0, approved_count: 0, is_recurring: false,
      recommendation: 'unknown_vendor',
      message: 'Sin historial de facturas para esta cuenta.',
    };
  }

  const { data: rows } = await supabase
    .from('ops_inbox')
    .select('email_from, invoice_data, status, created_at')
    .in('agent_id', agentIds)
    .eq('item_type', 'invoice')
    .gte('created_at', yearAgo)
    .order('created_at', { ascending: false })
    .limit(50);

  const matches = (rows ?? []).filter(r => {
    const from  = String((r as { email_from: string | null }).email_from ?? '').toLowerCase();
    const invP  = String(((r as { invoice_data: Record<string, unknown> | null }).invoice_data)?.proveedor ?? '').toLowerCase();
    const invV  = String(((r as { invoice_data: Record<string, unknown> | null }).invoice_data)?.vendor ?? '').toLowerCase();
    return from.includes(proveedorNorm) || invP.includes(proveedorNorm) || invV.includes(proveedorNorm);
  });

  const approved = matches.filter(m => m.status === 'approved');
  const last     = matches[0];
  const lastAmount = last
    ? Number(((last as { invoice_data: Record<string, unknown> | null }).invoice_data)?.total ?? ((last as { invoice_data: Record<string, unknown> | null }).invoice_data)?.amount ?? 0)
    : undefined;

  const fmt = (n: number) => n.toLocaleString('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 });

  let variance: number | undefined;
  if (monto && lastAmount && lastAmount > 0) {
    variance = Math.abs(monto - lastAmount) / lastAmount;
  }

  const isRecurring = approved.length >= 2;
  const highVariance = variance != null && variance > 0.2;

  let recommendation: 'auto_approve' | 'review' | 'unknown_vendor';
  let message: string;
  if (matches.length === 0) {
    recommendation = 'unknown_vendor';
    message = `Sin historial para "${proveedor}". Es un proveedor nuevo — recomendable revisar la factura antes de pagar.`;
  } else if (isRecurring && !highVariance) {
    recommendation = 'auto_approve';
    message = `Proveedor recurrente: ${approved.length} facturas aprobadas antes. Última: ${lastAmount ? fmt(lastAmount) : 'monto no registrado'} · ${last?.status ?? '?'}. Bajo riesgo, puedes auto-marcar como pagada.`;
  } else if (isRecurring && highVariance) {
    recommendation = 'review';
    message = `Proveedor recurrente pero monto varía ${((variance ?? 0) * 100).toFixed(0)}% del último (${lastAmount ? fmt(lastAmount) : '?'} → ${monto ? fmt(monto) : '?'}). Vale la pena revisar antes de pagar.`;
  } else {
    recommendation = 'review';
    message = `Solo ${matches.length} factura(s) previa(s) de "${proveedor}", ${approved.length} aprobada(s). No hay suficiente historial para auto-aprobar.`;
  }

  return {
    ok:              true,
    proveedor,
    history_count:   matches.length,
    approved_count:  approved.length,
    last_amount:     lastAmount,
    last_status:     last?.status ?? undefined,
    amount_variance: variance,
    is_recurring:    isRecurring,
    recommendation,
    message,
  };
}

function firstDayOfMonthIso(): string {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString();
}
