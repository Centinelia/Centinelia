/**
 * billing/pool-charge.ts — Wrapper unificado para cobrar tareas al pool
 * cuando Nala hace side-effects con costo real (LLM, correo, Dropbox, PAC).
 *
 * Historia:
 *   Antes del 2026-09-04, Nala hacía side-effects (Anthropic vision, LLM loop,
 *   Resend, timbrado PAC) SIN cobrar tareas al pool del cliente. Auditoría
 *   detectó undercharge sistemático — Centinelia absorbía ~$0.15-0.40 USD por
 *   correo procesado, sin visibilidad ni ledger. Con volumen real (10-50
 *   correos/día por cliente), $50-500 USD/mes de subsidio invisible.
 *
 * Este módulo unifica el patrón de cobro:
 *   - `withPoolCharge(opts, fn)` — cobra 1 op DESPUÉS de fn() exitosa.
 *   - `withBatchedPoolCharge(opts, fn)` — fn devuelve `count`; cobra ese count
 *     al final. Respeta la regla `Batched-consume multi-I/O` (memoria
 *     feedback_batched_consume_multi_io.md 2026-09-03): N side-effects en un
 *     loop cobran 1x con count=N, no N veces adentro.
 *
 * Kill switch por org: `voice_agents.features.nala_pool_charge_enabled`. Si
 * false o ausente, la función se ejecuta pero NO cobra. Útil para rollout
 * gradual y para no cobrar retroactivamente en clientes que ya recibieron el
 * servicio gratis durante el bug window.
 *
 * Auditabilidad: cada cobro escribe a `ai_ops_log` con `source`, `label` y
 * `context` descriptivos. El cliente ve en su historial exactamente cuánto y
 * por qué se cobró.
 */

import { consumeAiOp, type OpsMeta, type OpsResult } from '@/lib/ai/ops-guard';
import { createAdminClient } from '@/lib/supabase/admin';

export interface PoolChargeOpts extends OpsMeta {
  /** ID del voice_agent que atribuye la operación (Nala del cliente). */
  agentId: string;
}

/** Sentinel: cuando el kill switch está apagado, no cobramos y devolvemos esto. */
const CHARGE_SKIPPED: OpsResult = { ok: true, used: 0, limit: 0 };

/**
 * Ejecuta fn(), y si tiene éxito, cobra 1 op al pool del agente. Si fn tira,
 * NO se cobra (side-effect no ocurrió → no hay costo real).
 *
 * Diseño: cobro POST-op para que fallos técnicos no metan cargos fantasma.
 * Trade-off aceptable: si el proceso muere entre fn() y consumeAiOp, hay 1
 * op no cobrada — el drift detector (Nash hourly) lo detecta comparando
 * `outbound_emails` etc. con `ai_ops_log`.
 */
export async function withPoolCharge<T>(
  opts: PoolChargeOpts,
  fn: () => Promise<T>,
): Promise<T> {
  const result = await fn();
  const enabled = await isChargeEnabled(opts.agentId);
  if (enabled) {
    await consumeAiOp(opts.agentId, 1, {
      source:       opts.source,
      reference_id: opts.reference_id,
      label:        opts.label,
      context:      opts.context,
    });
  }
  return result;
}

/**
 * Como withPoolCharge, pero cobra `count` ops (batched). Usa esto cuando
 * fn() ejecuta N side-effects externos y sabes el N al final. Cobra 1 vez
 * en vez de N — reduce ruido en el ledger y evita over-charge si el loop
 * abortó a mitad.
 *
 * fn devuelve un objeto con `count` (cuánto cobrar) y el resultado.
 */
export async function withBatchedPoolCharge<T>(
  opts: PoolChargeOpts,
  fn: () => Promise<{ count: number; result: T }>,
): Promise<T> {
  const { count, result } = await fn();
  if (count <= 0) return result;
  const enabled = await isChargeEnabled(opts.agentId);
  if (enabled) {
    await consumeAiOp(opts.agentId, count, {
      source:       opts.source,
      reference_id: opts.reference_id,
      label:        opts.label,
      context:      opts.context,
    });
  }
  return result;
}

/**
 * Cobra directamente N ops (sin envolver fn). Útil cuando el trabajo ya
 * pasó y solo queremos registrar el cargo. Fire-and-await, log-only si falla.
 */
export async function chargePool(opts: PoolChargeOpts, count = 1): Promise<void> {
  if (count <= 0) return;
  const enabled = await isChargeEnabled(opts.agentId);
  if (!enabled) return;
  await consumeAiOp(opts.agentId, count, {
    source:       opts.source,
    reference_id: opts.reference_id,
    label:        opts.label,
    context:      opts.context,
  });
}

/**
 * Kill switch por agent. Con `voice_agents.features.nala_pool_charge_enabled =
 * true` el cobro se activa. Ausente/false = no cobra (rollout gradual).
 *
 * Cachea el lookup por 60s para no golpear la BD en cada op del loop.
 */
const featureCache = new Map<string, { enabled: boolean; expiresAt: number }>();
const FEATURE_CACHE_TTL_MS = 60_000;

async function isChargeEnabled(agentId: string): Promise<boolean> {
  const cached = featureCache.get(agentId);
  if (cached && cached.expiresAt > Date.now()) return cached.enabled;

  const supabase = createAdminClient();
  const { data } = await supabase
    .from('voice_agents')
    .select('features')
    .eq('id', agentId)
    .maybeSingle();

  const features = (data?.features ?? {}) as Record<string, unknown>;
  const enabled = features['nala_pool_charge_enabled'] === true;

  featureCache.set(agentId, { enabled, expiresAt: Date.now() + FEATURE_CACHE_TTL_MS });
  return enabled;
}

/** Testing helper: limpia el cache del kill switch. */
export function _clearPoolChargeFeatureCache(): void {
  featureCache.clear();
}
