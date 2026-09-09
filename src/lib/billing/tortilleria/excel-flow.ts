/**
 * Flow determinístico para correos con adjuntos Excel de la Tortillería.
 *
 * Cuando llega un correo a Nala con uno o más `.xlsx`/`.xls`:
 *   1. Parsea cada archivo con `parseTortilleriaBatchXlsx`.
 *   2. Aplica el pipeline (skip, consolidación DCA, mapping cliente + producto,
 *      PPD para créditos).
 *   3. Inserta `billing_pending_review` — 1 row por factura resultante.
 *   4. Devuelve un resumen sin ejecutar el loop LLM.
 *
 * Coexiste con el flow de vision (imagen manuscrita) — si un correo trae
 * ambos, el caller decide cuál correr. El piloto solo usa Excel.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { parseTortilleriaBatchXlsx } from '../parsers/tortilleria-batch';
import { buildInvoicesFromBlocks } from './pipeline';
import type { BillingAdapter, BillingInvoice } from '../adapter';
import { getTortilleriaMapping } from './mapping-store';
import { submitApprovedForEmail, type SubmittedPending } from './submit-approved';
import type { TortilleriaPipelineConfig, PipelineWarning, PipelineError, SkipReport } from './types';

/** Metadata de un adjunto ya cargado (bytes en Buffer). */
export interface AttachmentBlob {
  filename:    string;
  contentType: string;
  buffer:      Buffer;
  index:       number;
}

export interface ExcelFlowInput {
  portalEmail: string;
  emailId:     string;
  agentId:     string;
  attachments: AttachmentBlob[];
  config:      TortilleriaPipelineConfig;
  supabase:    SupabaseClient;
  /**
   * Adapter para cerrar el ciclo approval→XML. Cuando llega, las pendings de
   * este email en `approved`/`edited_approved` sin XML se envían al adapter
   * y se marcan con `extracted.xml_path`. Sin adapter, solo se hace el
   * parseo/insert normal (útil para tests o dev que no quieren tocar Dropbox).
   */
  adapter?: BillingAdapter;
}

export interface ExcelFlowResult {
  processed:    boolean;
  invoiceCount: number;
  cardCount:    number;
  skippedCount: number;
  errorCount:   number;
  warnings:     PipelineWarning[];
  errors:       PipelineError[];
  skipped:      SkipReport[];
  /** Pendings efectivamente convertidas en XML+Dropbox en esta corrida. */
  submitted:    SubmittedPending[];
}

/** True si el content type o el filename indican Excel. */
export function isExcelAttachment(a: { contentType?: string; filename?: string }): boolean {
  const ct = (a.contentType ?? '').toLowerCase();
  const fn = (a.filename ?? '').toLowerCase();
  if (ct.startsWith('application/vnd.ms-excel')) return true;
  if (ct.startsWith('application/vnd.openxmlformats-officedocument.spreadsheetml')) return true;
  if (fn.endsWith('.xlsx') || fn.endsWith('.xls')) return true;
  return false;
}

/**
 * Procesa los adjuntos Excel de un correo. Idempotente: si ya se generaron
 * `billing_pending_review` para este `emailId`, no duplica.
 */
export async function runExcelFlow(input: ExcelFlowInput): Promise<ExcelFlowResult> {
  const empty: ExcelFlowResult = {
    processed:    false,
    invoiceCount: 0,
    cardCount:    0,
    skippedCount: 0,
    errorCount:   0,
    warnings:     [],
    errors:       [],
    skipped:      [],
    submitted:    [],
  };

  const excelAttachments = input.attachments.filter(isExcelAttachment);
  if (excelAttachments.length === 0) return empty;

  // Cargar mapping guardado del portal.
  const mapping = await getTortilleriaMapping(input.agentId, input.supabase);
  if (!mapping) {
    return {
      ...empty,
      errors: [{ tituloBloque: '(sin mapping)', reason: 'No hay tortilleria_mapping guardado para este agente. Ejecutar scripts/upload-tortilleria-mapping.ts.' }],
      errorCount: 1,
    };
  }

  // Idempotencia + cierre approval→XML: si ya existen rows para este email,
  // no re-parseamos el Excel; pero SÍ intentamos cerrar el ciclo emitiendo el
  // XML para pendings que Beatriz haya aprobado desde el portal. Sin este
  // paso el fast-path sale early y el XML nunca llega a Dropbox.
  const { data: existing } = await input.supabase
    .from('billing_pending_review')
    .select('id')
    .eq('email_id', input.emailId)
    .eq('portal_email', input.portalEmail)
    .limit(1);
  if (existing && existing.length > 0) {
    const submitted: SubmittedPending[] = [];
    const submitErrors: PipelineError[] = [];
    if (input.adapter) {
      const r = await submitApprovedForEmail({
        portalEmail: input.portalEmail,
        emailId:     input.emailId,
        adapter:     input.adapter,
        supabase:    input.supabase,
      });
      submitted.push(...r.submitted);
      for (const e of r.errors) {
        submitErrors.push({ tituloBloque: '(submit-approved)', reason: e.reason });
      }
      for (const s of r.skipped) {
        submitErrors.push({ tituloBloque: `(pending ${s.pendingId})`, reason: `skip: ${s.reason}` });
      }
      console.log('[tortilleria/excel-flow] approvals resueltas', JSON.stringify({
        portal_email:    input.portalEmail,
        email_id:        input.emailId,
        candidate_count: r.candidateCount,
        submitted:       r.submitted.length,
        skipped:         r.skipped.length,
        errors:          r.errors.length,
      }));
    }
    return {
      ...empty,
      processed:  true,
      submitted,
      errors:     submitErrors,
      errorCount: submitErrors.length,
    };
  }

  const allInvoices: BillingInvoice[] = [];
  const allWarnings: PipelineWarning[] = [];
  const allErrors:   PipelineError[]   = [];
  const allSkipped:  SkipReport[]      = [];

  for (const att of excelAttachments) {
    let parsed;
    try {
      parsed = parseTortilleriaBatchXlsx(att.buffer);
    } catch (parseErr) {
      allErrors.push({
        tituloBloque: att.filename,
        reason: `Fallo al parsear ${att.filename}: ${(parseErr as Error).message}`,
      });
      continue;
    }
    if (parsed.warnings.length > 0) {
      for (const w of parsed.warnings) {
        allWarnings.push({ tituloBloque: att.filename, message: w });
      }
    }
    const result = buildInvoicesFromBlocks(parsed.blocks, mapping, input.config);
    allInvoices.push(...result.invoices);
    allWarnings.push(...result.warnings);
    allErrors.push(...result.errors);
    allSkipped.push(...result.skipped);
  }

  // Insertar 1 row en billing_pending_review por invoice.
  const rows = allInvoices.map((inv, i) => {
    const total = inv.lines.reduce((s, l) => s + l.qty * l.unitPrice, 0);
    return {
      portal_email:   input.portalEmail,
      email_id:       input.emailId,
      image_index:    null,
      remision_index: i,
      folio:          null,
      cliente_texto:  inv.notes?.slice(0, 300) ?? null,
      rfc_matched:    inv.clientRFC,
      total:          Math.round(total * 100) / 100,
      fecha:          inv.date,
      productos:      inv.lines.map(l => ({
        sku:        l.sku,
        cantidad:   l.qty,
        precio:     l.unitPrice,
        iva_tasa:   l.ivaTasa ?? 0,
        subtotal:   Math.round(l.qty * l.unitPrice * 100) / 100,
      })),
      reason:         'Excel semanal Tortillería',
      extracted:      {
        origin:       'excel_pipeline',
        metodo_pago:  inv.metodoPago ?? 'PUE',
        uso_cfdi:     inv.usoCFDI,
        serie:        inv.serie,
        forma_pago:   inv.paymentMethod,
        notes:        inv.notes,
      },
      candidates:     null,
      status:         'pending' as const,
    };
  });

  if (rows.length > 0) {
    const { error: insErr } = await input.supabase
      .from('billing_pending_review')
      .insert(rows);
    if (insErr) {
      allErrors.push({
        tituloBloque: '(insert)',
        reason: `Fallo al insertar billing_pending_review: ${insErr.message}`,
      });
    }
  }

  // Observabilidad: el Excel flow no cobra pool (parser+DB son locales, sin
  // costo externo real). Los correos de vuelta al cliente cuando Beatriz
  // aprueba los cards SÍ cobran vía chargePool en sendMeerkatHtmlEmail.
  // Aquí solo dejamos un log estructurado para tracking del volumen procesado.
  console.log('[tortilleria/excel-flow] procesado', JSON.stringify({
    portal_email:  input.portalEmail,
    email_id:      input.emailId,
    agent_id:      input.agentId,
    xlsx_count:    excelAttachments.length,
    invoice_count: allInvoices.length,
    card_count:    rows.length,
    skipped_count: allSkipped.length,
    error_count:   allErrors.length,
    warning_count: allWarnings.length,
  }));

  return {
    processed:    true,
    invoiceCount: allInvoices.length,
    cardCount:    rows.length,
    skippedCount: allSkipped.length,
    errorCount:   allErrors.length,
    warnings:     allWarnings,
    errors:       allErrors,
    skipped:      allSkipped,
    submitted:    [],
  };
}
