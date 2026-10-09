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
    `Tareas usadas / límite: **${fmtN(opsUsed)} / ${fmtN(opsLimit)}**`,
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
    .select('id, business_name')
    .eq('portal_email', portalEmail);

  if (!before?.length) return { ok: false, message: `Sin agentes para ${portalEmail}.` };

  // Modelo event-sourced: "reset" = aplicar un ajuste al ledger que lleve el
  // balance al cap mensual del plan. No tocamos ai_ops_limit (es config).
  const { data: balanceRaw } = await supabase.rpc('get_ops_pool_balance', { p_portal_email: portalEmail });
  const { data: capRaw }     = await supabase.rpc('get_ops_pool_cap',     { p_portal_email: portalEmail });
  const balance = (balanceRaw as number | null) ?? 0;
  const cap     = (capRaw     as number | null) ?? 0;
  const delta   = cap - balance;

  if (delta === 0) {
    return { ok: true, message: `Balance de ${portalEmail} ya está en el cap (${cap}). No hay reset que aplicar.`, data: { balance, cap } };
  }

  const { error } = await supabase.rpc('apply_ops_ledger_entry', {
    p_portal_email: portalEmail,
    p_agent_id:     null,
    p_amount:       delta,
    p_kind:         delta > 0 ? 'grant' : 'adjustment',
    p_reference_id: `admin-reset-${new Date().toISOString().slice(0, 10)}`,
    p_description:  `Admin reset: ajuste de ${delta > 0 ? '+' : ''}${delta} para llevar balance al cap ${cap}`,
  });

  if (error) return { ok: false, message: `Error aplicando ajuste al ledger: ${error.message}` };

  return {
    ok: true,
    message: `**Balance reseteado al cap para ${portalEmail}**\n\n- Balance antes: ${fmtN(balance)}\n- Cap mensual: ${fmtN(cap)}\n- Ajuste aplicado: ${delta > 0 ? '+' : ''}${fmtN(delta)}\n- Afecta a ${before.length} agente${before.length > 1 ? 's' : ''} del portal`,
    data: { affected: before.length, balance_before: balance, cap, delta },
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
    .select('id, business_name')
    .eq('portal_email', portalEmail);

  if (!before?.length) return { ok: false, message: `Sin agentes para ${portalEmail}.` };

  // Credit one-shot al ledger (NO cambia ai_ops_limit del plan).
  // El credit respeta el cap 2x automáticamente via apply_ops_ledger_entry
  // (si excede, se emite un rollover_cap debit).
  const { data: balanceBefore } = await supabase.rpc('get_ops_pool_balance', { p_portal_email: portalEmail });
  const { error } = await supabase.rpc('apply_ops_ledger_entry', {
    p_portal_email: portalEmail,
    p_agent_id:     null,
    p_amount:       count,
    p_kind:         'grant',
    p_reference_id: `admin-grant-${new Date().toISOString().slice(0, 10)}-${count}`,
    p_description:  `Admin grant: +${count} ops one-shot (no cambia el plan)`,
  });

  if (error) return { ok: false, message: `Error aplicando grant al ledger: ${error.message}` };

  const { data: balanceAfter } = await supabase.rpc('get_ops_pool_balance', { p_portal_email: portalEmail });

  return {
    ok: true,
    message: `**+${count} ops otorgadas a ${portalEmail}** (one-shot al ledger, plan no modificado)\n\n` +
             `- Balance antes: ${fmtN((balanceBefore as number | null) ?? 0)}\n` +
             `- Balance después: ${fmtN((balanceAfter as number | null) ?? 0)}\n` +
             `- Afecta a ${before.length} agente${before.length > 1 ? 's' : ''} del portal (pool compartido)`,
    data: { granted: count, affected: before.length, balance_before: balanceBefore, balance_after: balanceAfter },
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

// ── show vapi (diagnóstico de config actual del assistant) ────────────────

async function showVapi(query: string): Promise<ActionResult> {
  const supabase = createAdminClient();
  const q = query.trim();

  // Buscar agente por email o business_name (parcial)
  const { data: agents } = await supabase
    .from('voice_agents')
    .select('id, business_name, agent_name, vapi_agent_id, portal_email, active')
    .or(`portal_email.ilike.%${q}%,business_name.ilike.%${q}%`)
    .limit(5);

  if (!agents?.length) return { ok: false, message: `Sin agentes para "${q}".` };
  if (!process.env.VAPI_API_KEY) return { ok: false, message: 'VAPI_API_KEY no configurado en env.' };

  const results: string[] = [];

  for (const a of agents) {
    if (!a.vapi_agent_id) {
      results.push(`⚠️ **${a.business_name}** — sin vapi_agent_id (nunca creado en Vapi).`);
      continue;
    }

    try {
      const res = await fetch(`https://api.vapi.ai/assistant/${a.vapi_agent_id}`, {
        headers: { Authorization: `Bearer ${process.env.VAPI_API_KEY}` },
      });
      if (!res.ok) {
        results.push(`❌ **${a.business_name}** (${a.vapi_agent_id}): ${res.status} ${await res.text().catch(() => '')}`);
        continue;
      }
      const config = await res.json() as {
        serverUrl?: string;
        serverUrlSecret?: string;
        model?: { provider?: string; model?: string; url?: string; maxTokens?: number; temperature?: number };
        voice?: { provider?: string; voiceId?: string; model?: string; speed?: number };
        transcriber?: { provider?: string; model?: string; language?: string };
        firstMessage?: string;
      };
      const serverUrl       = config.serverUrl ?? '(none)';
      const serverUrlSecret = config.serverUrlSecret ? `${config.serverUrlSecret.slice(0, 4)}…${config.serverUrlSecret.slice(-4)} (len ${config.serverUrlSecret.length})` : '(none)';
      const modelProvider   = config.model?.provider ?? '(none)';
      const modelUrl        = config.model?.url ?? '(n/a)';
      const modelName       = config.model?.model ?? '(none)';
      const voiceProvider   = config.voice?.provider ?? '(none)';
      const voiceId         = config.voice?.voiceId ?? '(none)';
      const voiceModel      = config.voice?.model ?? '(none)';
      const voiceSpeed      = config.voice?.speed ?? '(none)';
      const sttProvider     = config.transcriber?.provider ?? '(none)';
      const sttModel        = config.transcriber?.model ?? '(none)';
      const sttLang         = config.transcriber?.language ?? '(none)';
      const firstMsg        = (config.firstMessage ?? '').slice(0, 80);

      // Extraer secret del serverUrl si viene como ?secret=
      let serverUrlSecretInUrl = '(none)';
      try {
        const url = new URL(serverUrl);
        const s = url.searchParams.get('secret');
        if (s) serverUrlSecretInUrl = `${s.slice(0, 4)}…${s.slice(-4)} (len ${s.length})`;
      } catch { /* not a valid URL */ }

      // Fetch phone numbers asociados al assistant
      let phoneInfo = '(no phones fetched)';
      try {
        const phoneRes = await fetch(`https://api.vapi.ai/phone-number?assistantId=${a.vapi_agent_id}`, {
          headers: { Authorization: `Bearer ${process.env.VAPI_API_KEY}` },
        });
        if (phoneRes.ok) {
          const phones = await phoneRes.json() as Array<{ id: string; number?: string; provider?: string; assistantId?: string }>;
          phoneInfo = phones.length > 0
            ? phones.map(p => `${p.number ?? '?'} (${p.provider ?? '?'})`).join(', ')
            : '(no phones asignados)';
        }
      } catch { /* ignore */ }

      results.push([
        `${a.active ? '🟢' : '⚫'} **${a.business_name}** (${a.agent_name ?? '—'}) · ${a.vapi_agent_id}`,
        `   portal: ${a.portal_email ?? '—'}`,
        `   phone(s): \`${phoneInfo}\``,
        `   model: \`${modelProvider} · ${modelName}\``,
        `   voice: \`${voiceProvider} · voiceId=${voiceId} · model=${voiceModel} · speed=${voiceSpeed}\``,
        `   transcriber: \`${sttProvider} · ${sttModel} · ${sttLang}\``,
        `   firstMessage: \`"${firstMsg}${(config.firstMessage ?? '').length > 80 ? '…' : ''}"\``,
        `   serverUrl \`?secret=\`: \`${serverUrlSecretInUrl}\``,
        `   serverUrlSecret header: \`${serverUrlSecret}\``,
      ].join('\n'));
    } catch (err) {
      results.push(`❌ **${a.business_name}**: error fetch — ${String(err)}`);
    }
  }

  const envSecret = process.env.VAPI_SERVER_SECRET
    ? `${process.env.VAPI_SERVER_SECRET.slice(0, 4)}…${process.env.VAPI_SERVER_SECRET.slice(-4)} (len ${process.env.VAPI_SERVER_SECRET.length})`
    : '(no configurado en env de este runtime)';

  return {
    ok: true,
    message: [
      `**Env actual (este runtime):**`,
      `- VAPI_SERVER_SECRET: \`${envSecret}\``,
      `- NEXT_PUBLIC_APP_URL: \`${process.env.NEXT_PUBLIC_APP_URL ?? '(no configurado)'}\``,
      '',
      ...results,
    ].join('\n'),
  };
}

// ── activate / deactivate ────────────────────────────────────────────────────

async function toggleActive(portalEmail: string, active: boolean): Promise<ActionResult> {
  const supabase = createAdminClient();
  const { data: before } = await supabase
    .from('voice_agents')
    .select('id, business_name, agent_name, active, client_paused')
    .eq('portal_email', portalEmail);

  if (!before?.length) return { ok: false, message: `Sin agentes para ${portalEmail}.` };

  // Al activar, también quitamos `client_paused` — de lo contrario el portal
  // considera al agente pausado por el cliente y muestra el badge.
  const patch = active
    ? { active: true, client_paused: false, client_paused_at: null }
    : { active: false };

  const { error } = await supabase
    .from('voice_agents')
    .update(patch)
    .eq('portal_email', portalEmail);
  if (error) return { ok: false, message: `Error: ${error.message}` };

  // Verificación post-update: si algo (trigger, RLS) revirtió el cambio, avisar.
  const { data: after } = await supabase
    .from('voice_agents')
    .select('id, active')
    .eq('portal_email', portalEmail);
  const stillWrong = (after ?? []).filter(a => a.active !== active);
  if (stillWrong.length > 0) {
    return {
      ok: false,
      message: `⚠️ Update ejecutado sin error pero ${stillWrong.length} agente(s) siguen en \`active=${!active}\`. Puede haber un trigger o RLS revirtiendo. IDs: ${stillWrong.map(a => a.id).join(', ')}`,
    };
  }

  const summary = before.map(a => `- ${a.business_name} (${a.agent_name ?? '—'}): ${a.active} → ${active}`).join('\n');
  const nextStep = active
    ? '\n\nSiguiente paso: `resync all` para propagar la config a Vapi.'
    : '';
  return {
    ok: true,
    message: `**${before.length} agente${before.length > 1 ? 's' : ''} ${active ? 'activados' : 'desactivados'}** para ${portalEmail}\n\n${summary}${nextStep}`,
    data: { affected: before.length, active },
  };
}

// ── customLLM toggle ────────────────────────────────────────────────────────

async function toggleCustomLlm(portalEmail: string, enabled: boolean): Promise<ActionResult> {
  const supabase = createAdminClient();
  const { data: before } = await supabase
    .from('voice_agents')
    .select('id, business_name, features')
    .eq('portal_email', portalEmail);

  if (!before?.length) return { ok: false, message: `Sin agentes para ${portalEmail}.` };

  const updates = before.map(a => {
    const features = { ...(a.features as Record<string, unknown> ?? {}), use_custom_llm: enabled };
    return supabase.from('voice_agents').update({ features }).eq('id', a.id);
  });
  const results = await Promise.allSettled(updates);
  const failed  = results.filter(r => r.status === 'rejected').length;

  const summary = before.map(a => `- ${a.business_name}: use_custom_llm = ${enabled}`).join('\n');
  const nextStep = enabled
    ? '\n\nSiguiente paso: `resync all` para propagar el cambio a Vapi, después haz una llamada de prueba y verifica en logs de Anthropic que `cache_read_input_tokens` aparece a partir del 2do turno.'
    : '';
  return {
    ok: failed === 0,
    message: `**customLLM ${enabled ? 'habilitado' : 'deshabilitado'} para ${portalEmail}** (${before.length - failed}/${before.length} agentes)\n\n${summary}${nextStep}`,
    data: { affected: before.length - failed, enabled },
  };
}

// ── resync all ──────────────────────────────────────────────────────────────

async function resyncAllCmd(): Promise<ActionResult> {
  const started = Date.now();
  const result  = await pushConversationalPromptsToAllAgents();
  const ms      = Date.now() - started;

  const failed        = result.details.filter(d => !d.ok);
  const phoneReassigned = result.details.filter(d => d.phoneReassigned);
  const summary = [
    `**${result.synced} agentes sincronizados${result.errors ? `, ${result.errors} errores` : ''}** en ${(ms / 1000).toFixed(1)}s`,
    result.phoneFixes > 0 ? `**🔧 ${result.phoneFixes} phone number${result.phoneFixes > 1 ? 's' : ''} reasignado${result.phoneFixes > 1 ? 's' : ''}** (había perdido asociación al assistant)` : '',
    '',
    ...phoneReassigned.map(d => `- 🔧 ${d.name}: phone reasignado`),
    ...failed.slice(0, 10).map(d => `- ❌ ${d.name} (${d.id}): ${d.error ?? '—'}`),
    failed.length > 10 ? `\n_+${failed.length - 10} más con error_` : '',
  ].filter(Boolean).join('\n');

  return {
    ok:      result.errors === 0,
    message: summary,
    data:    { synced: result.synced, errors: result.errors, phoneFixes: result.phoneFixes, ms },
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
    case 'enable_customllm':  return toggleCustomLlm(cmd.portalEmail, true);
    case 'disable_customllm': return toggleCustomLlm(cmd.portalEmail, false);
    case 'activate':          return toggleActive(cmd.portalEmail, true);
    case 'deactivate':        return toggleActive(cmd.portalEmail, false);
    case 'show_vapi':         return showVapi(cmd.query);
  }
}
