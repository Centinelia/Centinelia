/**
 * writer-consumer/audit.ts — Escritura al audit trail (billing_activity_log)
 * de cada acción que el consumer toma sobre archivos del writer.
 *
 * Objetivo: trazabilidad server-side. Un humano (o cron de análisis) puede
 * consultar la BD y responder:
 *   - ¿A cuántos clientes le respondimos por RFC no encontrado esta semana?
 *   - ¿Cuántos CFDIs entregamos hoy?
 *   - ¿Qué basenames escalaron a Nazre y por qué?
 *
 * Insert falla ruidoso NO por diseño — no queremos que un audit-log-down
 * bloquee reply/escalate/deliver. Solo se loguea el error.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export type WriterAuditAction =
  | 'writer_reply_sent'          // reply al cliente por rfcNotFound/skuNotFound
  | 'writer_escalated'           // email a BILLING_ESCALATION_EMAIL
  | 'writer_cfdi_delivered'      // CFDI entregado al receptor
  | 'writer_pac_retry_marked'    // pacError detectado, redepositado
  | 'writer_pac_retry_exhausted' // se agotaron retries, escalate
  | 'writer_correlation_missing' // basename sin email_id (contra escalate)
  | 'writer_report_unparseable'; // json malformado

export interface WriterAuditContext {
  supabase:      SupabaseClient;
  portalEmail:   string;
  /** Nombre base del archivo (sin extensión), usado como entity_ref. */
  basename:      string;
  /** Payload libre — kind, rfc, folio, attempts, error, etc. */
  context:       Record<string, unknown>;
  /** 'info' para acciones normales, 'warning' cuando degradamos, 'error' cuando escalamos irrecoverables. */
  severity?:     'info' | 'warning' | 'error';
}

export async function logWriterAudit(
  action: WriterAuditAction,
  { supabase, portalEmail, basename, context, severity = 'info' }: WriterAuditContext,
): Promise<void> {
  try {
    const { error } = await supabase.from('billing_activity_log').insert({
      portal_email: portalEmail,
      action_type:  action,
      severity,
      entity_ref:   basename,
      context,
    });
    if (error) {
      console.warn(
        `[writer-consumer/audit] failed to log ${action} for ${basename}: ${error.message}`,
      );
    }
  } catch (err) {
    console.warn(
      `[writer-consumer/audit] unexpected error logging ${action}:`,
      err instanceof Error ? err.message : String(err),
    );
  }
}
