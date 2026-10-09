import { after } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { executeAutoRefillOps } from '@/lib/billing/auto-refill';
import { validateLedgerEntry, resolveReason } from './ledger-schemas';

// Helper interno: construye metaForValidation desde los campos estructurados
// de OpsMeta mas el JSON de context si esta presente.
// Extraido para reusar en consumeAiOp y chargeOrgDirectly sin duplicar logica.
function buildMetaForValidation(meta?: OpsMeta): Record<string, unknown> {
  const m: Record<string, unknown> = {
    reference_id:   meta?.reference_id,
    rule_id:        meta?.rule_id,
    task_id:        meta?.task_id,
    run_id:         meta?.run_id,
    ficha_id:       meta?.ficha_id,
    applies_to:     meta?.applies_to,
    trigger_type:   meta?.trigger_type,
    trigger_source: meta?.trigger_source,
    action_types:   meta?.action_types,
    ficha_ids:      meta?.ficha_ids,
  };
  if (meta?.context) {
    try {
      const parsed = JSON.parse(meta.context) as Record<string, unknown>;
      Object.assign(m, parsed);
    } catch { /* context mal formado — ignorar */ }
  }
  return m;
}

export interface OpsResult {
  ok:    boolean;
  used:  number;
  limit: number;
}

export interface OpsMeta {
  /**
   * Tipo semantico de la operacion (Fase 7 nuevo, preferido).
   * Debe estar en LEDGER_REASONS de ledger-schemas.ts.
   * Si se pasan ambos `reason` y `source`, `reason` tiene prioridad.
   */
  reason?:       string;
  /**
   * Alias legacy de `reason`. Se mantiene para backwards-compat con todos
   * los call sites de Fases 2-3-6 que ya usaban `source`. Internamente se
   * normaliza con resolveReason(reason, source).
   */
  source?:       string;
  reference_id?: string;   // task_id, report_id, meeting_id, etc.
  label?:        string;   // Texto legible corto para historial de consumo (fallback: source)
  context?:      string;   // Descripcion completa expandida

  // ── Campos estructurados por reason (opcionales, Round 1 fix C2) ─────────
  // Se leen directamente en metaForValidation sin depender del JSON en context.
  // Backwards-compat: callers que solo populan reference_id siguen funcionando
  // (solo verán warnings de metadata incompleta, nunca un error fatal).
  rule_id?:        string;
  task_id?:        string;
  run_id?:         string;
  ficha_id?:       string;
  applies_to?:     string[];
  trigger_type?:   string;
  trigger_source?: string;
  action_types?:   string[];
  ficha_ids?:      string[];
}

// Atomically checks and consumes AI ops from the account pool via ops_ledger.
// 2026-10-09: path legacy eliminado. Todas las orgs usan ledger como fuente única
// (ver .brain/decisions/2026-10-09-ops-ledger-fuente-unica.md). Si una org no
// tiene portal_email, no se puede cobrar — devuelve ok:false para no silenciar
// un gap de billing.
export async function consumeAiOp(agentId: string, count = 1, meta?: OpsMeta): Promise<OpsResult> {
  const supabase = createAdminClient();

  // Fase 7: normalizar reason/source con backwards-compat.
  const resolvedReason = resolveReason(meta?.reason, meta?.source);

  if (resolvedReason !== 'unknown') {
    const validation = validateLedgerEntry(resolvedReason, buildMetaForValidation(meta));
    if (!validation.ok) {
      console.warn('[ops-guard] ledger metadata warning (cobro continua):', validation.error);
    }
  }

  const logPayload = {
    source:       resolvedReason,
    reason:       resolvedReason,
    reference_id: meta?.reference_id ?? null,
    label:        meta?.label        ?? null,
    context:      meta?.context      ?? null,
    count,
  };

  const { data: agentRow } = await supabase
    .from('voice_agents')
    .select('portal_email')
    .eq('id', agentId)
    .maybeSingle();
  const portalEmail = (agentRow?.portal_email as string | null) ?? null;

  if (!portalEmail) {
    console.error('[ops-guard] consumeAiOp sin portal_email (agente huérfano):', {
      agentId, count, reason: resolvedReason, reference_id: meta?.reference_id,
    });
    return { ok: false, used: 0, limit: 0 };
  }

  const { data: newBalance, error } = await supabase.rpc('consume_pool_ops', {
    p_portal_email: portalEmail,
    p_agent_id:     agentId,
    p_ops:          count,
    p_reference_id: meta?.reference_id ?? null,
    p_description:  meta?.label ?? meta?.source ?? null,
  });

  // Bug 2026-09-29 (Nelia/Tortillería): incident_registered aparece en
  // ai_ops_log pero incidencia_notif NO. RPC fallaba intermitente y la función
  // retornaba silent ok=false sin audit row → undercharge invisible.
  // Ahora: logeamos el error y insertamos audit row con count=0 + rpc_error
  // en context para que el drift detector vea el intento fallido.
  if (error) {
    console.error('[ops-guard] consume_pool_ops RPC failed (undercharge):', {
      agentId, portalEmail, count,
      source: meta?.source, reason: meta?.reason,
      reference_id: meta?.reference_id,
      error,
    });
    try {
      await supabase.from('ai_ops_log').insert({
        agent_id: agentId, portal_email: portalEmail,
        ...logPayload,
        count: 0,
        context: JSON.stringify({
          ...(logPayload.context ? { orig_context: logPayload.context } : {}),
          rpc_error: (error as { message?: string }).message ?? String(error),
          intended_count: count,
        }),
      });
    } catch (auditErr) {
      console.error('[ops-guard] audit insert also failed (double gap):', auditErr);
    }
    return { ok: false, used: 0, limit: 0 };
  }

  const { data: acct } = await supabase
    .from('account_ops')
    .select('ops_used, ops_included')
    .eq('portal_email', portalEmail)
    .maybeSingle();

  // Compliance Municipio 7-year retention: ai_ops_log DEBE persistir cada op.
  // Sync insert (no after()) para que Vercel no corte antes del INSERT.
  try {
    await supabase
      .from('ai_ops_log')
      .insert({ agent_id: agentId, portal_email: portalEmail, ...logPayload });
  } catch (err) {
    console.error('[ops-guard] ai_ops_log insert failed (audit gap):', err);
  }

  // Auto-refill on threshold: si al consumir cruzamos por abajo del threshold
  // y auto_refill_ops está activo + hay customer stripe → disparar refill.
  // Migrated desde path legacy — mismo contrato pero contra balance del ledger.
  const balance     = newBalance ?? 0;
  const prevBalance = balance + count;
  after(async () => {
    const { data: cfg } = await supabase
      .from('voice_agents')
      .select('auto_refill_ops_enabled, auto_refill_ops_threshold, stripe_customer_id')
      .eq('id', agentId)
      .single();
    const threshold = (cfg?.auto_refill_ops_threshold as number) ?? 50;
    if (cfg?.auto_refill_ops_enabled && cfg?.stripe_customer_id && prevBalance >= threshold && balance < threshold) {
      await executeAutoRefillOps(agentId).catch(() => null);
    }
  });

  // Balance <=0 = agotado; los grants nuevos vienen del cron o del webhook.
  return {
    ok:    balance >= 0,
    used:  acct?.ops_used    ?? 0,
    limit: acct?.ops_included ?? 0,
  };
}

// Refunda ops al pool cuando un tool call falla. El LLM ya consumió tokens
// (Anthropic ya cobró) así que el cobro inicial no se refunda, pero SÍ el costo
// de la iteración específica que terminó en error — de lo contrario el cliente
// paga varias veces por un flow que nunca produjo nada útil.
//
// Se llama desde agent-chat/route.ts después de executeAgentTool cuando el
// resultado devuelve ok:false. Best-effort: si el escribir al ledger falla,
// no hace throw.
export async function refundOps(agentId: string, count: number, meta?: OpsMeta): Promise<void> {
  if (count <= 0) return;
  try {
    const supabase = createAdminClient();
    const { data: agentRow } = await supabase
      .from('voice_agents')
      .select('portal_email')
      .eq('id', agentId)
      .maybeSingle();
    const portalEmail = (agentRow?.portal_email as string | null) ?? null;

    if (!portalEmail) {
      console.error('[refundOps] sin portal_email (agente huérfano), skip refund', { agentId, count });
      return;
    }

    await supabase.rpc('apply_ops_ledger_entry', {
      p_portal_email: portalEmail,
      p_agent_id:     agentId,
      p_amount:       count,
      p_kind:         'refund',
      p_reference_id: meta?.reference_id ?? null,
      p_description:  meta?.label ? `Reembolso: ${meta.label}` : 'Reembolso por error en tool',
    });
  } catch (err) {
    console.error('[refundOps] failed silently', { agentId, count, meta, err });
  }
}

// Renovación mensual del pool: inserta un grant que lleva el balance del ledger
// al cap mensual del plan (sum de voice_agents.ai_ops_limit activos). Se llama
// desde el billing webhook en renovación de suscripción + cron reset-ops-pool
// al cierre del ciclo.
//
// 2026-10-09: era "UPDATE monthly_ops_used = 0" en modelo legacy. En ledger
// event-sourced, "resetear" no aplica — se aplica un grant que compensa el
// consumo acumulado del ciclo anterior.
export async function resetAiOps(portalEmail: string): Promise<void> {
  const supabase = createAdminClient();

  const { data: balance } = await supabase.rpc('get_ops_pool_balance', { p_portal_email: portalEmail });
  const { data: cap }     = await supabase.rpc('get_ops_pool_cap',     { p_portal_email: portalEmail });

  const currentBalance = (balance as number | null) ?? 0;
  const monthlyCap     = (cap     as number | null) ?? 0;
  const grantAmount    = monthlyCap - currentBalance;

  if (grantAmount <= 0) return; // ya en o arriba del cap, no re-grant

  await supabase.rpc('apply_ops_ledger_entry', {
    p_portal_email: portalEmail,
    p_agent_id:     null,
    p_amount:       grantAmount,
    p_kind:         'grant',
    p_reference_id: `monthly-reset-${new Date().toISOString().slice(0, 7)}`,
    p_description:  `Renovación mensual: grant de ${grantAmount} ops para alcanzar cap ${monthlyCap}`,
  });
}

// ─── Fase 7 I-2 fix: cobro org-level cuando no hay agente activo ─────────────
//
// Problema original: createRule (Fase 2) y createTask (Fase 3) llaman
// consumeAiOp via getPrimaryAgentId(). Si el org no tiene agentes activos,
// getPrimaryAgentId() devuelve null y el cobro se SKIPEA en silencio.
// Esto viola feedback_pool_accuracy_top_priority y feedback_zero_debt.
//
// Fix: chargeOrgDirectly inserta directamente en ai_ops_log con agent_id=null
// y portal_email del org. El ledger eventualmente queda registrado aunque no
// haya voice_agent. NO usa ops_ledger (que requiere agentId para cap enforcement),
// solo loggea en ai_ops_log para trazabilidad.
//
// El llamador (agent-rules/service.ts) decide: si hay agente → consumeAiOp,
// si no hay agente → chargeOrgDirectly. De ninguna manera se skipea en silencio.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Cobra ops directamente al nivel del org (sin agente) para casos donde el org
 * no tiene voice_agents activos. Inserta un debit en ops_ledger con agent_id=null.
 *
 * Uso: cuando getPrimaryAgentId retorna null (org sin agentes activos).
 * Garantiza cero-gap de cobro aunque el org no tenga empleados aun activos.
 *
 * 2026-10-09: migrado de dual-write (monthly_ops_used + ai_ops_log) a solo
 * ledger. apply_ops_ledger_entry maneja el debit y, para stripe, también
 * aplica el cap 2x. ai_ops_log se mantiene como audit trail paralelo.
 */
export async function chargeOrgDirectly(
  portalEmail: string,
  count = 1,
  meta?: OpsMeta,
): Promise<void> {
  if (!portalEmail || count <= 0) return;

  const resolvedReason = resolveReason(meta?.reason, meta?.source);

  if (resolvedReason !== 'unknown') {
    const validation = validateLedgerEntry(resolvedReason, buildMetaForValidation(meta));
    if (!validation.ok) {
      console.warn('[ops-guard] chargeOrgDirectly ledger metadata warning:', validation.error);
    }
  }

  try {
    const supabase = createAdminClient();

    // Debit en el ledger (fuente única). amount negativo = consumo.
    await supabase.rpc('apply_ops_ledger_entry', {
      p_portal_email: portalEmail,
      p_agent_id:     null,
      p_amount:       -count,
      p_kind:         'consumption',
      p_reference_id: meta?.reference_id ?? null,
      p_description:  meta?.label ?? `Cobro org-level sin agente activo (${resolvedReason})`,
    });

    // Audit trail paralelo (ai_ops_log). Compliance Municipio 7-year retention.
    await supabase.from('ai_ops_log').insert({
      agent_id:     null,
      portal_email: portalEmail,
      source:       resolvedReason,
      reason:       resolvedReason,
      reference_id: meta?.reference_id ?? null,
      label:        meta?.label        ?? null,
      context:      meta?.context      ?? null,
      count,
    });

    console.log(
      '[ops-guard] chargeOrgDirectly: cobro org-level sin agente activo',
      { portalEmail, count, reason: resolvedReason },
    );
  } catch (err) {
    console.error('[ops-guard] chargeOrgDirectly failed (audit gap):', { portalEmail, count, meta, err });
  }
}

// Fija la cuota mensual por-agente del plan. El argumento aiOpsPerAgent viene
// de plans.ts (JORNADA_CONFIG[jornada][tier].aiOps o resolveTierAllocation) y
// se escribe en voice_agents.ai_ops_limit, que es CONFIG del plan — no un
// contador. get_ops_pool_cap() lo lee para calcular el cap 2x en stripe.
//
// 2026-10-09: ya no escribe organizations.monthly_ops_pool (campo legacy que
// se elimina en Fase 4). El cap se deriva de SUM(ai_ops_limit) activos.
//
// ⚠️ DEPRECATED behavior: esta función asume que TODOS los agentes tienen el
// mismo tier (los uniformiza al aiOpsPerAgent). Rompe cuentas heterogéneas
// (ej: Pneuma con Sofía 100, Noah 500, Niva 3000). Preferir recomputeOrgOpsPool
// que respeta los tiers individuales.
export async function setAiOpsLimit(portalEmail: string, aiOpsPerAgent: number): Promise<void> {
  const supabase = createAdminClient();
  await supabase.from('voice_agents').update({ ai_ops_limit: aiOpsPerAgent }).eq('portal_email', portalEmail);
}

// Devuelve el cap total del org sumando el ai_ops_limit de cada agente activo.
// Es solo cálculo — no muta. Usar cuando necesites conocer el cap para
// mostrar en UI o calcular grants mensuales. Fuente de verdad del cap es el
// RPC get_ops_pool_cap(portal_email) a nivel de DB.
//
// 2026-10-09: ya no escribe organizations.monthly_ops_pool. El nombre se
// mantiene por retrocompatibilidad con los callers; renombrar en Fase 4.
export async function recomputeOrgOpsPool(portalEmail: string): Promise<number> {
  const supabase = createAdminClient();
  const { data: agents } = await supabase
    .from('voice_agents')
    .select('ai_ops_limit')
    .eq('portal_email', portalEmail)
    .eq('active', true);
  return (agents ?? []).reduce((sum: number, a) => sum + (((a as { ai_ops_limit?: number }).ai_ops_limit) ?? 0), 0);
}
