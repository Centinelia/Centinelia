/**
 * writer-consumer/correlate.ts — Cross-reference entre el basename del
 * archivo procesado por el writer y el correo original que le dio origen.
 *
 * Cuando Nala invoca `submit_invoice_batch` (tool del PR #32), inserta en
 * `billing_activity_log` un evento con `action_type='invoice_submitted'` y
 * `context = { email_id, ref, basename, ... }`.
 *
 * Historia:
 *   v1 (PR #38): usaba `.filter('context->>ref', 'ilike', '%basename%')`.
 *     Auditoría detectó que esto permitía cross-match si dos basenames
 *     compartían prefijo (`facturas_2026-09-03_abc` vs
 *     `facturas_2026-09-03_abc12`) o si el basename contenía metacaracteres
 *     LIKE (%,_). Riesgo real: entregar el CFDI de un cliente al hilo de
 *     correo de OTRO cliente. Fuga de datos fiscales.
 *   v2: match EXACTO contra `context->>basename` (que `submit_invoice_batch`
 *     ahora inserta explícito) + filtro opcional por portal_email para
 *     eliminar cross-org matches en caso de colisión de content-hash.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export interface CorrelationResult {
  emailId: string;
  portalEmail: string;
}

/**
 * Busca el evento invoice_submitted cuyo `context.basename` coincide
 * EXACTAMENTE. Devuelve null si no encuentra registro.
 *
 * @param expectedPortalEmail — si se pasa, valida que el registro corresponda
 *   a esta organización (defensivo contra colisión de hash cross-org).
 */
export async function correlateBasenameToEmail(
  supabase: SupabaseClient,
  basename: string,
  expectedPortalEmail?: string,
): Promise<CorrelationResult | null> {
  let q = supabase
    .from('billing_activity_log')
    .select('portal_email, context')
    .eq('action_type', 'invoice_submitted')
    .eq('context->>basename', basename)
    .order('created_at', { ascending: false })
    .limit(1);

  if (expectedPortalEmail) {
    q = q.eq('portal_email', expectedPortalEmail);
  }

  const { data, error } = await q.maybeSingle();
  if (error || !data) return null;

  const ctx = data.context as { email_id?: string } | null;
  if (!ctx?.email_id) return null;

  if (expectedPortalEmail && data.portal_email !== expectedPortalEmail) return null;

  return {
    emailId:     ctx.email_id,
    portalEmail: data.portal_email as string,
  };
}
