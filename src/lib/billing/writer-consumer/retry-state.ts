/**
 * writer-consumer/retry-state.ts — Estado de reintentos por basename cuando
 * el writer reporta kind=pacError. La tabla writer_pac_retry_state (ver
 * migration 20260903_writer_pac_retry_state.sql) es la fuente de verdad.
 *
 * Flujo por basename con pacError:
 *   1. bumpAttempt() → INSERT o UPDATE attempts++. Devuelve estado nuevo.
 *   2. Si <= MAX_ATTEMPTS: consumer re-deposita el XML en pendientes/ para
 *      que el writer lo reintente en su siguiente tick.
 *   3. Si > MAX_ATTEMPTS: markExhausted() + escalate a Nazre; no más
 *      redeposits para ese basename.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export const MAX_PAC_RETRY_ATTEMPTS = 3;

export interface RetryState {
  basename:      string;
  portalEmail:   string;
  attempts:      number;
  firstSeenAt:   string;
  lastAttemptAt: string;
  exhausted:     boolean;
  lastReason:    string | null;
}

/**
 * Registra un nuevo intento de pacError para el basename. Si no existe,
 * inserta con attempts=1. Si existe, incrementa attempts. Devuelve el
 * estado resultante (con attempts actualizado).
 */
export async function bumpAttempt(
  supabase: SupabaseClient,
  basename: string,
  portalEmail: string,
  reason: string,
): Promise<RetryState | null> {
  // UPSERT: si existe, incrementa attempts; si no, insert con attempts=1.
  // Postgres no tiene UPSERT + INCREMENT en un solo statement portable via
  // supabase-js; hacemos SELECT + INSERT/UPDATE. Race entre dos ticks es
  // aceptable — a lo mucho attempts sube 2 en vez de 1, el cap sigue funcionando.
  const { data: existing } = await supabase
    .from('writer_pac_retry_state')
    .select('*')
    .eq('basename', basename)
    .maybeSingle();

  if (!existing) {
    const { data, error } = await supabase
      .from('writer_pac_retry_state')
      .insert({
        basename,
        portal_email:  portalEmail,
        attempts:      1,
        last_reason:   reason,
      })
      .select()
      .maybeSingle();
    if (error || !data) return null;
    return rowToState(data);
  }

  // Guard: si ya está exhausted, no bump-eamos más. Devolvemos el estado
  // tal cual para que el caller lo trate como "escalated" sin loop de
  // emails cada tick. Auditoría 2026-09-04 (spam escalations).
  if (existing.exhausted === true) {
    return rowToState(existing);
  }

  const newAttempts = (existing.attempts as number) + 1;
  const { data, error } = await supabase
    .from('writer_pac_retry_state')
    .update({
      attempts:        newAttempts,
      last_attempt_at: new Date().toISOString(),
      last_reason:     reason,
    })
    .eq('basename', basename)
    .select()
    .maybeSingle();
  if (error || !data) return null;
  return rowToState(data);
}

/**
 * Marca un basename como exhausto (no más redeposits). Se llama cuando
 * attempts excedió MAX_PAC_RETRY_ATTEMPTS.
 */
export async function markExhausted(
  supabase: SupabaseClient,
  basename: string,
): Promise<void> {
  await supabase
    .from('writer_pac_retry_state')
    .update({ exhausted: true })
    .eq('basename', basename);
}

function rowToState(row: Record<string, unknown>): RetryState {
  return {
    basename:      row.basename      as string,
    portalEmail:   row.portal_email  as string,
    attempts:      row.attempts      as number,
    firstSeenAt:   row.first_seen_at as string,
    lastAttemptAt: row.last_attempt_at as string,
    exhausted:     row.exhausted     as boolean,
    lastReason:    (row.last_reason as string | null) ?? null,
  };
}
