import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Máximo total de intentos de verificación antes de escalar a humano.
 * Cuenta el intento actual + reintentos. Ej: MAX=3 significa que si el 3er
 * intento no fue 'ok', el contacto pasa a 'failed' en vez de reagendar.
 * Nelia manda correo tarjeta con el resultado en CADA intento (incluido el
 * 3° final), así que el encargado siempre queda enterado antes del cierre.
 */
export const MAX_VERIFICATION_ATTEMPTS = 3;

/**
 * Reintento agendado al DÍA SIGUIENTE a las 15:00 America/Monterrey (UTC-6 sin
 * DST). Cambio pedido por Tortillería Estrella 2026-09-07: antes eran +2d,
 * pero para pedidos que no llegaron esperar 2 días adicionales es demasiado —
 * el cliente ya se enojó y compró en otro lado. Al día siguiente en la tarde
 * el vendedor ya pasó (o debió pasar) y se verifica en caliente.
 *
 * Se conserva la constante `VERIFICATION_RETRY_DAYS` solo para el test que la
 * importa; para la lógica real usar `nextDayAt3pmMty` abajo.
 */
export const VERIFICATION_RETRY_DAYS = 1;

const MTY_UTC_OFFSET_HOURS = 6;
const VERIFICATION_HOUR_MTY = 15;

function nextDayAt3pmMty(now: Date): string {
  const mtyShifted = new Date(now.getTime() - MTY_UTC_OFFSET_HOURS * 3600 * 1000);
  const y = mtyShifted.getUTCFullYear();
  const m = mtyShifted.getUTCMonth();
  const d = mtyShifted.getUTCDate();
  return new Date(Date.UTC(y, m, d + 1, VERIFICATION_HOUR_MTY + MTY_UTC_OFFSET_HOURS, 0, 0)).toISOString();
}

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

  return {
    toStatus:    'pending',
    scheduledAt: nextDayAt3pmMty(new Date()),
    reason:      `incident_retry_after_${last.result}`,
  };
}
