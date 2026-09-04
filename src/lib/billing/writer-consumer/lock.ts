/**
 * writer-consumer/lock.ts — Lease-based lock por portal_email para evitar
 * que dos invocaciones solapadas del cron nala-writer-inbox procesen el
 * mismo inbox al mismo tiempo.
 *
 * Mecanismo:
 *   - Tabla writer_inbox_lock (portal_email PK, locked_until, holder_id).
 *   - acquire() intenta INSERT o UPDATE atómico condicionado a que el lock
 *     esté libre (no exista o locked_until < now).
 *   - release() borra el lock si es del mismo holder_id (safety).
 *   - Si el proceso muere, el lock expira automático (TTL 5 min).
 *
 * Diseño: si acquire() falla, el caller SKIPPEA esa org en este tick.
 * Otro tick ya la está atendiendo — o el lock viejo expirará en < 5 min.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';

/** TTL del lock: mayor que la cadence (3 min) pero menor que Vercel maxDuration (5 min). */
export const INBOX_LOCK_TTL_SECONDS = 240; // 4 minutos

export interface LockHandle {
  portalEmail: string;
  holderId:    string;
}

/**
 * Intenta adquirir el lock. Retorna handle si lo obtuvo, null si otro proceso
 * lo tiene. Idempotente: si el lock existe pero expiró, lo toma.
 */
export async function acquireInboxLock(
  supabase: SupabaseClient,
  portalEmail: string,
): Promise<LockHandle | null> {
  const holderId = randomUUID();
  const lockedUntil = new Date(Date.now() + INBOX_LOCK_TTL_SECONDS * 1000).toISOString();

  // UPSERT atómico: solo escribe si el lock no existe o está expirado.
  // Usamos UPDATE ... WHERE + fallback INSERT para simular. Postgres soporta
  // ON CONFLICT ... WHERE pero supabase-js .upsert() no expone la cláusula
  // WHERE, así que hacemos dos pasos con concurrencia aceptable (misma
  // heurística que retry-state.ts).
  const nowIso = new Date().toISOString();

  // Paso 1: intentar UPDATE atómico de un lock expirado o vencido.
  const { data: updated } = await supabase
    .from('writer_inbox_lock')
    .update({ locked_until: lockedUntil, holder_id: holderId, acquired_at: nowIso })
    .eq('portal_email', portalEmail)
    .lt('locked_until', nowIso)
    .select()
    .maybeSingle();

  if (updated) {
    return { portalEmail, holderId };
  }

  // Paso 2: no había expirado o no existía. Intentar INSERT.
  const { data: inserted, error } = await supabase
    .from('writer_inbox_lock')
    .insert({ portal_email: portalEmail, locked_until: lockedUntil, holder_id: holderId })
    .select()
    .maybeSingle();

  if (inserted) {
    return { portalEmail, holderId };
  }

  // Si el INSERT falló con conflict, otro tick lo tiene ahora mismo.
  // Cualquier otro error también asumimos "no pude": mejor skip que
  // duplicar el envío al cliente.
  if (error && error.code !== '23505') {
    console.warn(
      `[writer-consumer/lock] acquire failed for ${portalEmail} with code ${error.code}: ${error.message}`,
    );
  }
  return null;
}

/**
 * Libera el lock solo si somos el holder que lo tomó. Idempotente: si
 * ya expiró o alguien más lo tomó, no falla.
 */
export async function releaseInboxLock(
  supabase: SupabaseClient,
  handle: LockHandle,
): Promise<void> {
  await supabase
    .from('writer_inbox_lock')
    .delete()
    .eq('portal_email', handle.portalEmail)
    .eq('holder_id',   handle.holderId);
}
