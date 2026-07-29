import { createAdminClient } from '@/lib/supabase/admin';
import type { Command } from './command-grammar';
import { helpText } from './command-grammar';
import {
  createApproval, grantOpsChecks, listApprovals,
  decideApproval, executeApproval, getApproval,
} from './approvals';
import { pushConversationalPromptsToAllAgents } from '@/lib/vapi/sync';

export interface ActionResult {
  ok:      boolean;
  message: string;  // markdown
  data?:   unknown;
}

const HAIKU_COST_PER_OP = 0.0024;      // usado por el dashboard actual
const GRANT_OPS_GATE_THRESHOLD = 50;   // >50 requerirá C3 gate (todavía no existe)

interface AgentRow {
  id: string;
  business_name: string;
  agent_name: string | null;
  client_name: string | null;
  plan: string | null;
  active: boolean;
  billing_status: string | null;
  portal_email: string | null;
  ai_ops_used: number | null;
  ai_ops_limit: number | null;
  minutes_used: number | null;
  minutes_included: number | null;
  created_at: string;
}

function fmt$(n: number | null | undefined): string {
  if (n == null) return '—';
  return n.toLocaleString('es-MX', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });
}

function fmtN(n: number | null | undefined): string {
  if (n == null) return '—';
  return n.toLocaleString('es-MX');
}

// ── budget report ───────────────────────────────────────────────────────────

async function budgetReport(): Promise<ActionResult> {
  const supabase = createAdminClient();
  const startMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();

  const [{ data: agents }, vapiRes, twilioRes] = await Promise.all([
    supabase.from('voice_agents').select('ai_ops_used, ai_ops_limit'),
    fetch('https://api.vapi.ai/account', {
      headers: { Authorization: `Bearer ${process.env.VAPI_API_KEY}` },
    }).then(r => r.ok ? r.json() : null).catch(() => null),
    (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN)
      ? fetch(
          `https://api.twilio.com/2010-04-01/Accounts/${process.env.TWILIO_ACCOUNT_SID}/Balance.json`,
          { headers: { Authorization: `Basic ${Buffer.from(`${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`).toString('base64')}` } }
        ).then(r => r.ok ? r.json() : null).catch(() => null)
      : Promise.resolve(null),
  ]);

  type Ops = { ai_ops_used: number | null; ai_ops_limit: number | null };
  const opsUsed  = (agents ?? []).reduce((s, a: Ops) => s + (a.ai_ops_used  ?? 0), 0);
  const opsLimit = (agents ?? []).reduce((s, a: Ops) => s + (a.ai_ops_limit ?? 0), 0);
  const claudeCost   = opsUsed * HAIKU_COST_PER_OP;
  const claudeBudget = parseFloat(process.env.CLAUDE_MONTHLY_BUDGET ?? '50');
  const claudePct    = Math.round((claudeCost / claudeBudget) * 100);

  const vapiBalance    = typeof vapiRes?.balance === 'number' ? vapiRes.balance : null;
  const twilioBalance  = typeof twilioRes?.balance === 'string' ? parseFloat(twilioRes.balance) : null;

  const lines = [
    `**Presupuesto — mes actual desde ${new Date(startMonth).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })}**`,
    '',
    `Ops usadas / límite: **${fmtN(opsUsed)} / ${fmtN(opsLimit)}**`,
    `Claude estimado: **${fmt$(claudeCost)}** de ${fmt$(claudeBudget)} presupuesto (${claudePct}%)`,
    `Vapi balance: **${fmt$(vapiBalance)}**${vapiBalance != null && vapiBalance < 20 ? ' ⚠️ bajo' : ''}`,
    `Twilio balance: **${fmt$(twilioBalance)}**${twilioBalance != null && twilioBalance < 10 ? ' ⚠️ bajo' : ''}`,
  ];

  return { ok: true, message: lines.join('\n'), data: { opsUsed, opsLimit, claudeCost, vapiBalance, twilioBalance } };
}

// ── burn report ─────────────────────────────────────────────────────────────

async function burnReport(): Promise<ActionResult> {
  const supabase = createAdminClient();
  const { data: agents } = await supabase
    .from('voice_agents')
    .select('id, business_name, portal_email, ai_ops_used, ai_ops_limit, active')
    .eq('active', true)
    .order('ai_ops_used', { ascending: false, nullsFirst: false })
    .limit(10);

  if (!agents?.length) return { ok: true, message: 'Sin agentes activos.' };

  const rows = agents.map((a, i) => {
    const used  = a.ai_ops_used ?? 0;
    const limit = a.ai_ops_limit ?? 0;
    const pct   = limit > 0 ? Math.round((used / limit) * 100) : 0;
    const cost  = fmt$(used * HAIKU_COST_PER_OP);
    return `${i + 1}. **${a.business_name}** — ${fmtN(used)} / ${fmtN(limit)} ops (${pct}%) · ${cost}`;
  });

  return {
    ok: true,
    message: [`**Top 10 por burn de ops este mes**`, '', ...rows].join('\n'),
    data: agents,
  };
}

// ── list agents ─────────────────────────────────────────────────────────────

async function listAgents(filter: 'active' | 'inactive' | 'all'): Promise<ActionResult> {
  const supabase = createAdminClient();
  let q = supabase
    .from('voice_agents')
    .select('id, business_name, agent_name, plan, active, ai_ops_used, ai_ops_limit, minutes_used, minutes_included, portal_email, created_at')
    .order('created_at', { ascending: false })
    .limit(20);
  if (filter === 'active')   q = q.eq('active', true);
  if (filter === 'inactive') q = q.eq('active', false);

  const { data: agents } = await q;
  if (!agents?.length) return { ok: true, message: `Sin agentes en filtro "${filter}".` };

  const rows = agents.map((a) => {
    const status = a.active ? '🟢' : '⚫';
    const ops    = `${fmtN(a.ai_ops_used)}/${fmtN(a.ai_ops_limit)} ops`;
    const mins   = `${fmtN(a.minutes_used)}/${fmtN(a.minutes_included)} min`;
    return `${status} **${a.business_name}** (${a.agent_name ?? 'sin nombre'}) — ${a.plan ?? 'sin plan'} — ${ops} · ${mins}\n    ${a.portal_email ?? '(sin portal)'}`;
  });

  return {
    ok: true,
    message: [`**Agentes (${filter}, últimos 20)**`, '', ...rows].join('\n'),
    data: agents,
  };
}

// ── find agent ──────────────────────────────────────────────────────────────

async function findAgent(query: string): Promise<ActionResult> {
  const supabase = createAdminClient();
  const q = query.trim();

  const { data: agents } = await supabase
    .from('voice_agents')
    .select('id, business_name, agent_name, portal_email, active, ai_ops_used, ai_ops_limit, plan')
    .or(`business_name.ilike.%${q}%,agent_name.ilike.%${q}%,portal_email.ilike.%${q}%,id.eq.${q.match(/^[0-9a-f-]{36}$/i) ? q : '00000000-0000-0000-0000-000000000000'}`)
    .limit(10);

  if (!agents?.length) return { ok: true, message: `Sin coincidencias para "${q}".` };

  const rows = agents.map((a) => {
    const status = a.active ? '🟢' : '⚫';
    return `${status} **${a.business_name}** — ${a.agent_name ?? '—'} — ${a.plan ?? '—'}\n    ${a.portal_email ?? '(sin portal)'} · ${a.id}`;
  });

  return {
    ok: true,
    message: [`**${agents.length} resultado${agents.length > 1 ? 's' : ''} para "${q}"**`, '', ...rows].join('\n'),
    data: agents,
  };
}

// ── health ──────────────────────────────────────────────────────────────────

async function health(portalEmail: string): Promise<ActionResult> {
  const supabase = createAdminClient();
  const { data: agents } = await supabase
    .from('voice_agents')
    .select('*')
    .eq('portal_email', portalEmail);

  if (!agents?.length) return { ok: true, message: `Sin agentes para ${portalEmail}.` };

  const lines: string[] = [`**${portalEmail}** — ${agents.length} agente${agents.length > 1 ? 's' : ''}`, ''];

  for (const a of agents as unknown as AgentRow[]) {
    const status  = a.active ? '🟢 activo' : '⚫ inactivo';
    const ops     = `${fmtN(a.ai_ops_used)} / ${fmtN(a.ai_ops_limit)} ops`;
    const mins    = `${fmtN(a.minutes_used)} / ${fmtN(a.minutes_included)} min`;
    const billing = a.billing_status ?? '—';

    // Última llamada
    const { data: lastCall } = await supabase
      .from('voice_calls')
      .select('created_at, outcome, duration_seconds')
      .eq('agent_id', a.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    lines.push(
      `- **${a.business_name}** (${a.agent_name ?? '—'}) · ${status}`,
      `  plan: ${a.plan ?? '—'} · billing: ${billing}`,
      `  ${ops} · ${mins}`,
      lastCall
        ? `  última llamada: ${new Date(lastCall.created_at).toLocaleString('es-MX')} — ${lastCall.outcome} — ${lastCall.duration_seconds}s`
        : `  sin llamadas registradas`,
      '',
    );
  }

  return { ok: true, message: lines.join('\n'), data: agents };
}

// ── reset ops ───────────────────────────────────────────────────────────────

async function resetOps(portalEmail: string): Promise<ActionResult> {
  const supabase = createAdminClient();
  const { data: before } = await supabase
    .from('voice_agents')
    .select('id, business_name, ai_ops_used')
    .eq('portal_email', portalEmail);

  if (!before?.length) return { ok: false, message: `Sin agentes para ${portalEmail}.` };

  const { error } = await supabase
    .from('voice_agents')
    .update({ ai_ops_used: 0 })
    .eq('portal_email', portalEmail);

  if (error) return { ok: false, message: `Error: ${error.message}` };

  const summary = before.map(a => `- ${a.business_name}: ${fmtN(a.ai_ops_used)} → 0`).join('\n');
  return {
    ok: true,
    message: `**Ops reseteadas para ${portalEmail}** (${before.length} agente${before.length > 1 ? 's' : ''})\n\n${summary}`,
    data: { affected: before.length },
  };
}

// ── grant ops ───────────────────────────────────────────────────────────────

async function grantOps(portalEmail: string, count: number): Promise<ActionResult> {
  if (count <= 0) return { ok: false, message: 'La cantidad de ops debe ser positiva.' };

  // C3 gate: grants > GRANT_OPS_GATE_THRESHOLD requieren aprobación explícita.
  // Se crea un approval pending y se le devuelve al operador el id para
  // que apruebe/rechace desde /admin/aprobaciones o desde el comando
  // `approve <id>`.
  if (count > GRANT_OPS_GATE_THRESHOLD) {
    const checks = await grantOpsChecks(portalEmail, count);
    const approval = await createApproval({
      type:        'grant_ops',
      title:       `+${count} ops para ${portalEmail}`,
      rationale:   `Comando manual solicitó grant de ${count} ops (arriba del cap de ${GRANT_OPS_GATE_THRESHOLD} sin gate).`,
      amount:      count,
      targetEmail: portalEmail,
      metadata:    { portalEmail, count },
      checks,
    });
    const anyFailed = checks.some(c => !c.passed);
    return {
      ok:      true,
      message: `**Grant de ${count} ops encolado en el gate** (id ${approval.id})\n\n` +
               `Está en \`pending\` — necesita aprobación explícita.\n` +
               (anyFailed ? '⚠️ Algún policy check falló; aprobar será un override explícito.\n' : '') +
               `Aprobar con \`approve ${approval.id}\` o desde /admin/aprobaciones.`,
      data:    { approvalId: approval.id },
    };
  }

  const supabase = createAdminClient();
  const { data: before } = await supabase
    .from('voice_agents')
    .select('id, business_name, ai_ops_limit')
    .eq('portal_email', portalEmail);

  if (!before?.length) return { ok: false, message: `Sin agentes para ${portalEmail}.` };

  // Incrementa ai_ops_limit en cada agente del portal
  const updates = before.map(a =>
    supabase
      .from('voice_agents')
      .update({ ai_ops_limit: (a.ai_ops_limit ?? 0) + count })
      .eq('id', a.id)
  );
  const results = await Promise.allSettled(updates);
  const failed  = results.filter(r => r.status === 'rejected').length;

  const summary = before.map(a => `- ${a.business_name}: ${fmtN(a.ai_ops_limit)} → ${fmtN((a.ai_ops_limit ?? 0) + count)}`).join('\n');
  return {
    ok: failed === 0,
    message: `**+${count} ops otorgadas a ${portalEmail}** (${before.length - failed}/${before.length} agentes)\n\n${summary}`,
    data: { granted: count, affected: before.length - failed },
  };
}

// ── list approvals ──────────────────────────────────────────────────────────

async function listApprovalsCmd(filter: 'pending' | 'all'): Promise<ActionResult> {
  const items = filter === 'pending' ? await listApprovals('pending') : await listApprovals();
  if (items.length === 0) {
    return { ok: true, message: filter === 'pending' ? 'Sin aprobaciones pendientes.' : 'Sin aprobaciones registradas.' };
  }
  const rows = items.map(a => {
    const statusIcon = a.status === 'pending' ? '⏳' : a.status === 'approved' ? '✅' : '❌';
    const amt = a.amount != null ? ` · ${fmtN(a.amount)}` : '';
    return `${statusIcon} \`${a.id}\` · **${a.type}** · ${a.title}${amt}`;
  });
  return {
    ok:      true,
    message: [`**${items.length} aprobación${items.length === 1 ? '' : 'es'} (${filter})**`, '', ...rows].join('\n'),
    data:    items,
  };
}

// ── approve ─────────────────────────────────────────────────────────────────

async function approveCmd(id: string): Promise<ActionResult> {
  const before = await getApproval(id);
  if (!before) return { ok: false, message: `Approval ${id} no existe.` };
  if (before.status !== 'pending') return { ok: false, message: `Approval ${id} ya está ${before.status}.` };

  const decided = await decideApproval({ id, approve: true, decidedBy: 'admin (command line)' });
  const executed = await executeApproval(decided);
  return {
    ok:      executed.ok,
    message: `**${executed.ok ? '✅ Aprobado y ejecutado' : '⚠️ Aprobado pero la ejecución falló'}**\n\n${executed.message}`,
    data:    { decided, executed },
  };
}

// ── resync all ──────────────────────────────────────────────────────────────

async function resyncAllCmd(): Promise<ActionResult> {
  const started = Date.now();
  const result  = await pushConversationalPromptsToAllAgents();
  const ms      = Date.now() - started;

  const failed  = result.details.filter(d => !d.ok);
  const summary = [
    `**${result.synced} agentes sincronizados${result.errors ? `, ${result.errors} errores` : ''}** en ${(ms / 1000).toFixed(1)}s`,
    '',
    ...failed.slice(0, 10).map(d => `- ❌ ${d.name} (${d.id}): ${d.error ?? '—'}`),
    failed.length > 10 ? `\n_+${failed.length - 10} más con error_` : '',
  ].filter(Boolean).join('\n');

  return {
    ok:      result.errors === 0,
    message: summary,
    data:    { synced: result.synced, errors: result.errors, ms },
  };
}

// ── reject ──────────────────────────────────────────────────────────────────

async function rejectCmd(id: string, note?: string): Promise<ActionResult> {
  const before = await getApproval(id);
  if (!before) return { ok: false, message: `Approval ${id} no existe.` };
  if (before.status !== 'pending') return { ok: false, message: `Approval ${id} ya está ${before.status}.` };

  const decided = await decideApproval({ id, approve: false, decidedBy: 'admin (command line)', note });
  return {
    ok:      true,
    message: `**❌ Rechazado**${note ? `\n\nNota: ${note}` : ''}`,
    data:    decided,
  };
}

// ── reset minutes ───────────────────────────────────────────────────────────

async function resetMinutes(portalEmail: string): Promise<ActionResult> {
  const supabase = createAdminClient();
  const { data: before } = await supabase
    .from('voice_agents')
    .select('id, business_name, minutes_used')
    .eq('portal_email', portalEmail);

  if (!before?.length) return { ok: false, message: `Sin agentes para ${portalEmail}.` };

  const { error } = await supabase
    .from('voice_agents')
    .update({ minutes_used: 0 })
    .eq('portal_email', portalEmail);

  if (error) return { ok: false, message: `Error: ${error.message}` };

  const summary = before.map(a => `- ${a.business_name}: ${fmtN(a.minutes_used)} → 0 min`).join('\n');
  return {
    ok: true,
    message: `**Minutos reseteados para ${portalEmail}**\n\n${summary}`,
    data: { affected: before.length },
  };
}

// ── dispatcher ──────────────────────────────────────────────────────────────

export async function executeCommand(cmd: Command): Promise<ActionResult> {
  switch (cmd.kind) {
    case 'help':          return { ok: true, message: `**Comandos disponibles**\n\n${helpText()}` };
    case 'budget_report': return budgetReport();
    case 'burn_report':   return burnReport();
    case 'list_agents':   return listAgents(cmd.filter);
    case 'find_agent':    return findAgent(cmd.query);
    case 'health':        return health(cmd.portalEmail);
    case 'reset_ops':     return resetOps(cmd.portalEmail);
    case 'grant_ops':     return grantOps(cmd.portalEmail, cmd.count);
    case 'reset_minutes': return resetMinutes(cmd.portalEmail);
    case 'list_approvals': return listApprovalsCmd(cmd.filter);
    case 'approve':       return approveCmd(cmd.id);
    case 'reject':        return rejectCmd(cmd.id, cmd.note);
    case 'resync_all':    return resyncAllCmd();
  }
}
