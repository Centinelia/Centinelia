/**
 * Idempotencia para webhooks — dedupe por event_id.
 *
 * Usa la tabla `webhook_events` que ya vive en Supabase (schema:
 *   event_id text PRIMARY KEY,
 *   source   text,
 *   metadata jsonb,
 *   created_at timestamptz DEFAULT now()
 * ).
 *
 * Stripe usa su propia tabla `stripe_webhook_events` con 2-phase commit
 * (columna `processed_at`). Ver `stripeIdempotency` abajo.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export interface IdempotencyResult {
  /** true si el evento ya fue procesado y hay que retornar OK sin re-ejecutar. */
  isDuplicate: boolean;
  /** Solo relevante para 2-phase commit (Stripe). Retorna el commit fn. */
  markProcessed?: () => Promise<void>;
}

// ─── Generic 1-phase idempotency (Vapi, Twilio) ─────────────────────────────

/**
 * INSERT en webhook_events. Si el eventId ya existe (unique conflict), es
 * duplicate → retorna { isDuplicate: true }.
 *
 * Riesgo conocido: si el handler crashea después del INSERT pero antes de
 * completar side effects, el retry vendrá pero la fila ya existe → se
 * marcaría como duplicate → evento perdido. Para casos financieros / de
 * dinero, usar `stripeIdempotency` con 2-phase commit.
 */
export async function checkAndClaimEvent(
  supabase: SupabaseClient,
  args: {
    source:      string;
    eventId:     string;
    eventType?:  string;
    metadata?:   Record<string, unknown>;
  },
): Promise<IdempotencyResult> {
  const { error } = await supabase
    .from('webhook_events')
    .insert({
      event_id: args.eventId,
      source:   args.source,
      metadata: {
        type: args.eventType ?? null,
        ...(args.metadata ?? {}),
      },
    });

  // Postgres 23505 = unique violation → duplicate
  if (error?.code === '23505') return { isDuplicate: true };
  if (error) {
    console.error('[webhook idempotency] insert failed:', error);
    // Fail-open (mejor procesar 2 veces que perder el evento).
    // Handler debe ser idempotente por sí mismo cuando sea crítico.
    return { isDuplicate: false };
  }
  return { isDuplicate: false };
}

// ─── Stripe 2-phase commit ──────────────────────────────────────────────────

/**
 * Fase 1: INSERT con processed_at=NULL (claim). Si el row existe:
 *   - processed_at NOT NULL → duplicate real, skip
 *   - processed_at IS NULL y >5min → crash previo, re-procesar (delete + retry)
 *   - processed_at IS NULL y <5min → probablemente race, skip
 *
 * Fase 2: markProcessed() = UPDATE processed_at=now(). El caller lo invoca al
 * final del handler para "confirmar" que se completó.
 *
 * Comparación vs 1-phase: garantiza que retry de Stripe post-crash re-procesa
 * (no queda como "deduped" con el side effect a medio hacer).
 */
export async function stripeIdempotency(
  supabase: SupabaseClient,
  args: {
    eventId:         string;
    eventType:       string;
    sessionId?:      string | null;
    subscriptionId?: string | null;
    portalEmail?:    string | null;
  },
): Promise<IdempotencyResult> {
  const CRASH_RETRY_WINDOW_MS = 5 * 60 * 1000;

  const { error: insertErr } = await supabase
    .from('stripe_webhook_events')
    .insert({
      event_id:        args.eventId,
      event_type:      args.eventType,
      session_id:      args.sessionId      ?? null,
      subscription_id: args.subscriptionId ?? null,
      portal_email:    args.portalEmail    ?? null,
      processed_at:    null,
    });

  if (insertErr?.code === '23505') {
    // Row existe. ¿Procesado o a medio?
    const { data: prev } = await supabase
      .from('stripe_webhook_events')
      .select('processed_at, created_at')
      .eq('event_id', args.eventId)
      .maybeSingle();

    if (prev?.processed_at) return { isDuplicate: true };

    const createdAtMs = prev?.created_at ? new Date(prev.created_at as string).getTime() : 0;
    const ageMs       = Date.now() - createdAtMs;
    if (ageMs < CRASH_RETRY_WINDOW_MS) return { isDuplicate: true };

    // Crash previo — re-procesar. Reseteamos processed_at claim con nuevo timestamp.
    await supabase
      .from('stripe_webhook_events')
      .update({ processed_at: null, created_at: new Date().toISOString() })
      .eq('event_id', args.eventId);
  } else if (insertErr) {
    console.error('[stripe idempotency] insert failed:', insertErr);
    return { isDuplicate: false };
  }

  return {
    isDuplicate: false,
    markProcessed: async () => {
      const { error } = await supabase
        .from('stripe_webhook_events')
        .update({ processed_at: new Date().toISOString() })
        .eq('event_id', args.eventId);
      if (error) console.error('[stripe idempotency] mark processed failed:', error);
    },
  };
}
