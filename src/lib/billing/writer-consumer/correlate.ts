/**
 * writer-consumer/correlate.ts — Cross-reference entre el basename del
 * archivo procesado por el writer y el correo original que le dio origen.
 *
 * Cuando Nala invoca <c>submit_invoice_batch</c> (tool del PR #32), inserta
 * en <c>billing_activity_log</c> un evento con <c>action_type =
 * 'invoice_submitted'</c> y <c>context = { email_id, ref, ... }</c>. El
 * <c>ref</c> es el path completo del XML depositado en pendientes/, por
 * ejemplo <c>/tortilleria/Importables_CONTPAQi/pendientes/facturas_2026-09-03_abc123.xml</c>.
 *
 * Este módulo hace el matching inverso: dado el basename
 * <c>facturas_2026-09-03_abc123</c>, devuelve el <c>email_id</c> del
 * correo original para poder responderle threaded.
 *
 * Si el registro no existe (submit_invoice_batch aún no mergeado, o el
 * evento se perdió), la función devuelve <c>null</c> y el caller decide
 * si degradar a envío no-threaded o escalar.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export interface CorrelationResult {
  emailId: string;
  portalEmail: string;
}

/**
 * Busca el evento <c>invoice_submitted</c> cuyo <c>ref</c> contiene el basename.
 * Usa filtro server-side con <c>ilike</c> para no traer todos los eventos.
 */
export async function correlateBasenameToEmail(
  supabase: SupabaseClient,
  basename: string,
): Promise<CorrelationResult | null> {
  const { data, error } = await supabase
    .from('billing_activity_log')
    .select('portal_email, context')
    .eq('action_type', 'invoice_submitted')
    .filter('context->>ref', 'ilike', `%${basename}%`)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;

  const ctx = data.context as { email_id?: string } | null;
  if (!ctx?.email_id) return null;

  return {
    emailId:     ctx.email_id,
    portalEmail: data.portal_email as string,
  };
}
