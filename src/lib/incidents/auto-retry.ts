import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Máximo total de intentos de verificación antes de escalar a humano.
 * Cuenta el intento actual + reintentos. Ej: MAX=4 significa que si el 4to
 * intento no fue 'ok', el contacto pasa a 'failed' en vez de reagendar.
 */
export const MAX_VERIFICATION_ATTEMPTS = 4;

/** Días entre reintentos cuando el resultado no fue 'ok'. */
export const VERIFICATION_RETRY_DAYS = 2;

export interface AutoRetryDecision {
  /** Estado destino del outbound_contact tras esta llamada. */
  toStatus:    'completed' | 'pending' | 'failed';
  /** Fecha para el próximo intento (solo definido si toStatus === 'pending'). */
  scheduledAt?: string;
  /** Razón para transición (auditoría). */
  reason:      string;
}

/**
 * Decide qué hacer con un outbound_contact ligado a un client_incident después
 * de que la llamada terminó. Reglas:
 * - Si el último intento fue 'ok' o no hay attempts → completed (nada más que hacer).
 * - Si el último fue 'no_visitado' o 'sin_respuesta' y hay margen de intentos →
 *   pending con scheduled_at = ahora + VERIFICATION_RETRY_DAYS.
 * - Si se alcanzó MAX_VERIFICATION_ATTEMPTS → failed (escala a humano).
 *
 * `contact` debe traer `external_source` + `external_id` para saber que es
 * un client_incident. Si no lo es, retorna null (webhook usa flow default).
 */
export async function decideIncidentAutoRetry(
  supabase: SupabaseClient,
  contact:  { external_source: string | null; external_id: string | null },
): Promise<AutoRetryDecision | null> {
  if (contact.external_source !== 'client_incident') return null;
  if (!contact.external_id) return null;

  const { data: inc, error } = await supabase
    .from('client_incidents')
    .select('verification_attempts')
    .eq('id', contact.external_id)
    .maybeSingle();
  if (error || !inc) return null;

  const attempts = Array.isArray((inc as { verification_attempts?: unknown[] }).verification_attempts)
    ? ((inc as { verification_attempts: Array<{ result: string }> }).verification_attempts)
    : [];
  const last = attempts[attempts.length - 1];

  if (!last || last.result === 'ok') {
    return { toStatus: 'completed', reason: 'incident_verified_ok' };
  }

  if (attempts.length >= MAX_VERIFICATION_ATTEMPTS) {
    return { toStatus: 'failed', reason: `incident_max_attempts_${MAX_VERIFICATION_ATTEMPTS}` };
  }

  const retryAt = new Date(Date.now() + VERIFICATION_RETRY_DAYS * 24 * 60 * 60 * 1000);
  return {
    toStatus:    'pending',
    scheduledAt: retryAt.toISOString(),
    reason:      `incident_retry_after_${last.result}`,
  };
}
