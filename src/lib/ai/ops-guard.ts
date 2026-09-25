import { after } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { executeAutoRefillOps } from '@/lib/billing/auto-refill';
import { consumePoolOps, fireOverageAlertIfNeeded } from '@/lib/annual-contracts/pool-consume';
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

// Atomically checks and consumes AI ops from the account pool.
// 4 paths:
//   NEW (ops_ledger_enabled=true): consume_pool_ops RPC unifica annual + stripe.
//   LEGACY (a) annual_prepaid: descuenta del pool en organizations (nunca falla, tracks overage).
//   LEGACY (b) stripe con portal_email: consume_ai_ops RPC con FOR UPDATE lock.
//   LEGACY (c) stripe standalone: mismo RPC, account_email=null.
export async function consumeAiOp(agentId: string, count = 1, meta?: OpsMeta): Promise<OpsResult> {
  const supabase = createAdminClient();

  // Fase 7: normalizar reason/source con backwards-compat.
  // `reason` es el campo nuevo semantico; `source` es el alias legacy.
  // resolveReason prioriza `reason` si se pasan ambos.
  const resolvedReason = resolveReason(meta?.reason, meta?.source);

  // Validacion defensiva: solo warning, NUNCA bloquea el cobro.
  // Fix C2 (Round 1): metaForValidation se construye desde campos estructurados
  // de OpsMeta directamente. Ver buildMetaForValidation para detalles.
  if (resolvedReason !== 'unknown') {
    const validation = validateLedgerEntry(resolvedReason, buildMetaForValidation(meta));
    if (!validation.ok) {
      console.warn('[ops-guard] ledger metadata warning (cobro continua):', validation.error);
    }
  }

  const logPayload = {
    source:       resolvedReason,    // ai_ops_log.source (backwards-compat con consumption-audit.ts)
    reason:       resolvedReason,    // ai_ops_log.reason (nuevo campo Fase 7)
    reference_id: meta?.reference_id ?? null,
    label:        meta?.label        ?? null,
    context:      meta?.context      ?? null,
    count,
  };

  // Resolve portal_email + feature flag + billing_model
  const { data: agentRow } = await supabase
    .from('voice_agents')
    .select('portal_email')
    .eq('id', agentId)
    .maybeSingle();
  const portalEmail = (agentRow?.portal_email as string | null) ?? null;

  let ledgerEnabled = false;
  if (portalEmail) {
    const { data: orgRow } = await supabase
      .from('organizations')
      .select('ops_ledger_enabled')
      .eq('portal_email', portalEmail)
      .maybeSingle();
    ledgerEnabled = !!orgRow?.ops_ledger_enabled;
  }

  // Path NEW (feature flag on): unifica annual + stripe via consume_pool_ops
  if (ledgerEnabled && portalEmail) {
    const { data: newBalance, error } = await supabase.rpc('consume_pool_ops', {
      p_portal_email: portalEmail,
      p_agent_id:     agentId,
      p_ops:          count,
      p_reference_id: meta?.reference_id ?? null,
      p_description:  meta?.label ?? meta?.source ?? null,
    });
    if (error) return { ok: false, used: 0, limit: 0 };

    const { data: acct } = await supabase
      .from('account_ops')
      .select('ops_used, ops_included')
      .eq('portal_email', portalEmail)
      .maybeSingle();

    // Compliance Municipio 7-year retention: ai_ops_log DEBE persistir cada op.
    // ANTES: after() → Vercel podía cortar la función antes de completar el
    // INSERT → row perdida indistinguible de row nunca ocurrida. Ledger es
    // source of truth pero ai_ops_log_archive queda con huecos vs ledger.
    // Ver Scope C2 compliance gap. Ahora es sync (fire-and-await con log-only
    // error si falla — nunca romper el flow del user por el log).
    try {
      await supabase
        .from('ai_ops_log')
        .insert({ agent_id: agentId, portal_email: portalEmail, ...logPayload });
    } catch (err) {
      console.error('[ops-guard] ai_ops_log insert failed (audit gap):', err);
    }

    // Balance <=0 = agotado; los grants nuevos vienen del cron
    return {
      ok:    (newBalance ?? 0) >= 0,
      used:  acct?.ops_used ?? 0,
      limit: acct?.ops_included ?? 0,
    };
  }

  // Path LEGACY: código actual sin cambios (annual → consumePoolOps, stripe → consume_ai_ops)
  if (portalEmail) {
    const pool = await consumePoolOps(portalEmail, count, supabase);
    if (pool.consumed) {
      void fireOverageAlertIfNeeded(portalEmail, {
        crossed_100_threshold: pool.crossed_100_threshold,
        crossed_120_threshold: pool.crossed_120_threshold,
      });
      // Sync insert (antes iba en after() — Vercel podía cortar la función
      // antes de completarlo → row perdida = charge sin fila en historial.
      // Mismo fix que Path NEW línea 76. Ver [[project-centinelia-pool-drift-detector]].
      try {
        await supabase
          .from('ai_ops_log')
          .insert({ agent_id: agentId, portal_email: portalEmail, ...logPayload });
      } catch (err) {
        console.error('[ops-guard] ai_ops_log insert failed (audit gap):', err);
      }
      return { ok: true, used: pool.minutes_used_after, limit: pool.minutes_pool };
    }
  }

  const { data, error } = await supabase
    .rpc('consume_ai_ops', { p_agent_id: agentId, p_count: count })
    .single();

  if (error || !data) return { ok: false, used: 0, limit: 0 };

  const row = data as { ok: boolean; ops_used: number; ops_limit: number; account_email: string | null };

  if (row.ok && row.account_email) {
    const accountEmail = row.account_email;
    try {
      await supabase
        .from('ai_ops_log')
        .insert({ agent_id: agentId, portal_email: accountEmail, ...logPayload });
    } catch (err) {
      console.error('[ops-guard] ai_ops_log insert failed (audit gap):', err);
    }

    const remaining = row.ops_limit - row.ops_used;
    const prevRemaining = remaining + count;
    after(async () => {
      const { data: cfg } = await supabase
        .from('voice_agents')
        .select('auto_refill_ops_enabled, auto_refill_ops_threshold, stripe_customer_id')
        .eq('id', agentId)
        .single();
      const threshold = (cfg?.auto_refill_ops_threshold as number) ?? 50;
      if (cfg?.auto_refill_ops_enabled && cfg?.stripe_customer_id && prevRemaining >= threshold && remaining < threshold) {
        await executeAutoRefillOps(agentId).catch(() => null);
      }
    });
  }

  return { ok: row.ok, used: row.ops_used, limit: row.ops_limit };
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
      .select('portal_email, ai_ops_used')
      .eq('id', agentId)
      .maybeSingle();
    const portalEmail = (agentRow?.portal_email as string | null) ?? null;

    let ledgerEnabled = false;
    if (portalEmail) {
      const { data: orgRow } = await supabase
        .from('organizations')
        .select('ops_ledger_enabled')
        .eq('portal_email', portalEmail)
        .maybeSingle();
      ledgerEnabled = !!orgRow?.ops_ledger_enabled;
    }

    if (ledgerEnabled && portalEmail) {
      await supabase.rpc('apply_ops_ledger_entry', {
        p_portal_email: portalEmail,
        p_agent_id:     agentId,
        p_amount:       count,
        p_kind:         'refund',
        p_reference_id: meta?.reference_id ?? null,
        p_description:  meta?.label ? `Reembolso: ${meta.label}` : 'Reembolso por error en tool',
      });
    } else {
      // Legacy path: decrementar ai_ops_used (bounded a 0)
      const currentUsed = (agentRow?.ai_ops_used as number) ?? 0;
      const newUsed = Math.max(0, currentUsed - count);
      await supabase.from('voice_agents').update({ ai_ops_used: newUsed }).eq('id', agentId);
      if (portalEmail) {
        // Reflejar en organizations.monthly_ops_used también (paridad con consumo)
        const { data: orgUsedRow } = await supabase
          .from('organizations')
          .select('monthly_ops_used')
          .eq('portal_email', portalEmail)
          .maybeSingle();
        const orgUsed = (orgUsedRow?.monthly_ops_used as number) ?? 0;
        await supabase
          .from('organizations')
          .update({ monthly_ops_used: Math.max(0, orgUsed - count) })
          .eq('portal_email', portalEmail);
      }
    }
  } catch (err) {
    console.error('[refundOps] failed silently', { agentId, count, meta, err });
  }
}

// Resetea el contador de ops del ciclo. Se llama en renovación mensual
// (billing webhook + cron reset-ops-pool). Resetea tanto el contador de la
// org (source of truth) como el per-agente (atribución).
export async function resetAiOps(portalEmail: string): Promise<void> {
  const supabase = createAdminClient();
  await Promise.all([
    supabase.from('organizations').update({ monthly_ops_used: 0 }).eq('portal_email', portalEmail),
    supabase.from('voice_agents').update({ ai_ops_used: 0 }).eq('portal_email', portalEmail),
  ]);
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
 * no tiene voice_agents activos. Inserta en ai_ops_log con agent_id=null Y
 * decrementa organizations.monthly_ops_used para que el pool refleje el cobro.
 *
 * Fix C1 (Round 1): antes solo insertaba en ai_ops_log (audit log) pero nunca
 * decrementaba el pool. organizations.monthly_ops_used quedaba desajustado:
 * el ledger tenia el registro pero el pool no reflejaba el descuento. Viola
 * feedback_pool_accuracy_top_priority y feedback_zero_debt.
 *
 * Uso: cuando getPrimaryAgentId retorna null (org sin agentes activos).
 * Garantiza cero-gap de cobro aunque el org no tenga empleados aun activos.
 *
 * Estrategia de decremento:
 *   1. Para annual_prepaid: llama consumePoolOps (maneja RPC y overage correctamente).
 *   2. Para stripe u otros: UPDATE directo a organizations.monthly_ops_used.
 *   En ambos casos el INSERT en ai_ops_log sigue ocurriendo para audit trail.
 *
 * Defensivo: si el decremento o el insert fallan, logga el error sin throw.
 */
export async function chargeOrgDirectly(
  portalEmail: string,
  count = 1,
  meta?: OpsMeta,
): Promise<void> {
  if (!portalEmail || count <= 0) return;

  const resolvedReason = resolveReason(meta?.reason, meta?.source);

  // Validacion defensiva (C2 fix: usa buildMetaForValidation)
  if (resolvedReason !== 'unknown') {
    const validation = validateLedgerEntry(resolvedReason, buildMetaForValidation(meta));
    if (!validation.ok) {
      console.warn('[ops-guard] chargeOrgDirectly ledger metadata warning:', validation.error);
    }
  }

  try {
    const supabase = createAdminClient();

    // ── Paso 1: decrementar el pool org (C1 fix) ──────────────────────────
    // consumePoolOps retorna consumed=true para annual_prepaid y lo decrementa
    // via RPC atómica o UPDATE directo según el flag ops_ledger_enabled.
    // Para stripe/expired retorna consumed=false → hacemos UPDATE directo.
    let poolDecremented = false;
    try {
      const poolResult = await consumePoolOps(portalEmail, count, supabase);
      if (poolResult.consumed) {
        poolDecremented = true;
        void fireOverageAlertIfNeeded(portalEmail, {
          crossed_100_threshold: poolResult.crossed_100_threshold,
          crossed_120_threshold: poolResult.crossed_120_threshold,
        });
      }
    } catch (poolErr) {
      console.warn('[ops-guard] chargeOrgDirectly consumePoolOps failed, intentando UPDATE directo:', poolErr);
    }

    if (!poolDecremented) {
      // Fallback para stripe u otros modelos: UPDATE directo con SELECT-then-UPDATE.
      // Incrementamos monthly_ops_used en `count` de forma segura.
      const { data: orgRow } = await supabase
        .from('organizations')
        .select('monthly_ops_used')
        .eq('portal_email', portalEmail)
        .maybeSingle();
      const current = (orgRow?.monthly_ops_used as number | null) ?? 0;
      await supabase
        .from('organizations')
        .update({ monthly_ops_used: current + count })
        .eq('portal_email', portalEmail);
    }

    // ── Paso 2: insertar en ai_ops_log (audit trail) ──────────────────────
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
      { portalEmail, count, reason: resolvedReason, poolDecremented },
    );
  } catch (err) {
    console.error('[ops-guard] chargeOrgDirectly failed (audit gap):', { portalEmail, count, meta, err });
  }
}

// Fija la cuota mensual de ops de la cuenta. El argumento aiOpsPerAgent viene
// de plans.ts (JORNADA_CONFIG[jornada][tier].aiOps o resolveTierAllocation) y
// mantiene semántica per-agente para no cambiar el pricing histórico: la cuenta
// paga aiOpsPerAgent × N.
// Escribe en dos lugares:
//   organizations.monthly_ops_pool  = source of truth del pool compartido
//   voice_agents.ai_ops_limit       = valor per-agente (fallback + UI legacy)
//
// ⚠️ DEPRECATED behavior: esta función asume que TODOS los agentes tienen el
// mismo tier (los uniformiza al aiOpsPerAgent). Rompe cuentas heterogéneas
// (ej: Pneuma con Sofía 100, Noah 500, Niva 3000). Preferir recomputeOrgOpsPool
// que respeta los tiers individuales. Ver bug 2026-08-09.
export async function setAiOpsLimit(portalEmail: string, aiOpsPerAgent: number): Promise<void> {
  const supabase = createAdminClient();
  const { count } = await supabase
    .from('voice_agents')
    .select('id', { count: 'exact', head: true })
    .eq('portal_email', portalEmail);
  const agentCount = count ?? 0;
  const poolTotal = aiOpsPerAgent * Math.max(1, agentCount);
  await Promise.all([
    supabase.from('organizations').update({ monthly_ops_pool: poolTotal }).eq('portal_email', portalEmail),
    supabase.from('voice_agents').update({ ai_ops_limit: aiOpsPerAgent }).eq('portal_email', portalEmail),
  ]);
}

// Recalcula organizations.monthly_ops_pool sumando el ai_ops_limit de cada
// agente activo. NO toca los ai_ops_limit individuales — respeta que cada
// empleado tenga su propio tier. Usar después de cambios per-agente
// (nuevo empleado, cambio de tier de uno solo, etc.).
export async function recomputeOrgOpsPool(portalEmail: string): Promise<number> {
  const supabase = createAdminClient();
  const { data: agents } = await supabase
    .from('voice_agents')
    .select('ai_ops_limit')
    .eq('portal_email', portalEmail)
    .eq('active', true);
  const total = (agents ?? []).reduce((sum: number, a) => sum + (((a as { ai_ops_limit?: number }).ai_ops_limit) ?? 0), 0);
  await supabase.from('organizations')
    .update({ monthly_ops_pool: total })
    .eq('portal_email', portalEmail);
  return total;
}
