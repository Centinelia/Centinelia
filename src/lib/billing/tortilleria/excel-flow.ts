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
import { buildInvoicesFromBlocks, type InvoiceMeta } from './pipeline';
import type { BillingAdapter, BillingInvoice } from '../adapter';
import { getTortilleriaMapping } from './mapping-store';
import { submitApprovedForEmail, type SubmittedPending } from './submit-approved';
import { checkConfidence } from './confidence';
import type { TortilleriaPipelineConfig, TortilleriaMapping, PipelineWarning, PipelineError, SkipReport } from './types';

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
  /**
   * Correo humano dueño (ej. Beatriz para la Tortillería). Cuando llega y hay
   * cards que no pudieron auto-aprobarse, se le notifica con resumen + link
   * al portal. Sin este correo, el flujo funciona pero silencioso: Beatriz
   * tiene que checar el portal a mano.
   */
  clientEmail?: string;
  /** Portal token para construir el link al portal en la notif. */
  portalToken?: string;
}

export interface ExcelFlowResult {
  processed:    boolean;
  invoiceCount: number;
  cardCount:    number;
  skippedCount: number;
  errorCount:   number;
  /** Cards que nacieron auto-aprobadas (sin requerir intervención humana). */
  autoApprovedCount: number;
  /** Cards que cayeron a revisión humana (con motivo detallado). */
  pendingCount: number;
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
    processed:         false,
    invoiceCount:      0,
    cardCount:         0,
    skippedCount:      0,
    errorCount:        0,
    autoApprovedCount: 0,
    pendingCount:      0,
    warnings:          [],
    errors:            [],
    skipped:           [],
    submitted:         [],
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
  const allInvoiceMeta: InvoiceMeta[] = [];
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
    allInvoiceMeta.push(...result.invoiceMeta);
    allWarnings.push(...result.warnings);
    allErrors.push(...result.errors);
    allSkipped.push(...result.skipped);
  }

  // Insertar 1 row en billing_pending_review por invoice.
  // Auto-approve por default: si el confidence check pasa, la row nace en
  // status='approved' y el post-insert loop llama al adapter directo. Si no,
  // cae a 'pending' con reason detallado y Beatriz recibe notificación.
  let autoApprovedCount = 0;
  const rows = allInvoices.map((inv, i) => {
    const total = inv.lines.reduce((s, l) => s + l.qty * l.unitPrice, 0);
    const meta = allInvoiceMeta[i];
    // Todos los folios de las remisiones del bloque, sin cortar. Beatriz
    // necesita verlos completos para trazabilidad (si un cliente pregunta
    // "¿de qué remisión salió tal cargo?", tiene que estar visible).
    const folioRef = (inv.sourceFolios && inv.sourceFolios.length > 0)
      ? inv.sourceFolios.join(', ')
      : null;

    const confidence = checkConfidence({
      invoice:      inv,
      sourceBlocks: meta?.sourceBlocks ?? [],
      mapping:      mapping as TortilleriaMapping,
      warnings:     meta?.blockWarnings ?? [],
    });
    const status = confidence.autoApprove ? 'approved' : 'pending';
    if (confidence.autoApprove) autoApprovedCount++;

    const reason = confidence.autoApprove
      ? 'Auto-aprobada (Nala validó cliente, precios y total).'
      : confidence.reasons[0] ?? 'Requiere revisión.';

    return {
      portal_email:   input.portalEmail,
      email_id:       input.emailId,
      image_index:    null,
      remision_index: i,
      folio:          folioRef,
      cliente_texto:  inv.notes?.slice(0, 300) ?? null,
      rfc_matched:    inv.clientRFC,
      total:          Math.round(total * 100) / 100,
      fecha:          inv.date,
      productos:      inv.lines.map(l => ({
        sku:         l.sku,
        descripcion: l.description ?? l.sku,
        cantidad:    l.qty,
        precio:      l.unitPrice,
        iva_tasa:    l.ivaTasa ?? 0,
        subtotal:    Math.round(l.qty * l.unitPrice * 100) / 100,
      })),
      reason,
      extracted:      {
        origin:            'excel_pipeline',
        metodo_pago:       inv.metodoPago ?? 'PUE',
        uso_cfdi:          inv.usoCFDI,
        serie:             inv.serie,
        forma_pago:        inv.paymentMethod,
        notes:             inv.notes,
        source_folios:     inv.sourceFolios ?? [],
        confidence_reasons: confidence.reasons,
        auto_approved:     confidence.autoApprove,
      },
      candidates:     null,
      status:         status as 'approved' | 'pending',
      // Si auto-approved, marcamos resolved_at/by como el sistema.
      ...(confidence.autoApprove ? {
        resolved_at: new Date().toISOString(),
        resolved_by: 'nala-auto',
      } : {}),
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

  // Auto-approved → mandarlas al adapter YA para que los XMLs lleguen a Dropbox
  // sin esperar a la siguiente vuelta del cron. Idempotente por hash del XML.
  const submitted: SubmittedPending[] = [];
  if (autoApprovedCount > 0 && input.adapter) {
    const submitResult = await submitApprovedForEmail({
      portalEmail: input.portalEmail,
      emailId:     input.emailId,
      adapter:     input.adapter,
      supabase:    input.supabase,
    });
    submitted.push(...submitResult.submitted);
    for (const e of submitResult.errors) {
      allErrors.push({ tituloBloque: '(auto-submit)', reason: e.reason });
    }
  }

  const pendingCount = rows.length - autoApprovedCount;

  // Notificar a Beatriz si algo cayó a revisión. Sin este mail Beatriz no sabe
  // cuándo entrar al portal. Fire-and-forget: fallo del correo no rompe el flow.
  if (pendingCount > 0 && input.clientEmail) {
    try {
      const { sendMeerkatHtmlEmail } = await import('@/lib/email/send-as-agent');
      const pendingRows = rows
        .filter(r => r.status === 'pending')
        .map(r => ({
          cliente: r.cliente_texto ?? '(cliente sin identificar)',
          total:   r.total,
          reason:  r.reason,
        }));
      const portalUrl = input.portalToken
        ? `https://www.centinelia.mx/portal/${input.portalToken}/oficina/facturas/pendientes`
        : null;
      const html = buildPendingNotifHtml({
        autoApprovedCount,
        pendingCount,
        pendingRows,
        portalUrl,
        submittedCount: submitted.length,
      });
      await sendMeerkatHtmlEmail({
        agentId: input.agentId,
        to:      input.clientEmail,
        subject: pendingCount === 1
          ? `1 factura necesita tu revisión`
          : `${pendingCount} facturas necesitan tu revisión`,
        html,
      }, input.supabase);
    } catch (notifErr) {
      console.warn('[tortilleria/excel-flow] notif Beatriz falló (no fatal):', (notifErr as Error).message);
    }
  }

  console.log('[tortilleria/excel-flow] procesado', JSON.stringify({
    portal_email:        input.portalEmail,
    email_id:            input.emailId,
    agent_id:            input.agentId,
    xlsx_count:          excelAttachments.length,
    invoice_count:       allInvoices.length,
    card_count:          rows.length,
    auto_approved_count: autoApprovedCount,
    pending_count:       pendingCount,
    submitted_count:     submitted.length,
    skipped_count:       allSkipped.length,
    error_count:         allErrors.length,
    warning_count:       allWarnings.length,
  }));

  return {
    processed:         true,
    invoiceCount:      allInvoices.length,
    cardCount:         rows.length,
    skippedCount:      allSkipped.length,
    errorCount:        allErrors.length,
    autoApprovedCount,
    pendingCount,
    warnings:          allWarnings,
    errors:            allErrors,
    skipped:           allSkipped,
    submitted,
  };
}

/**
 * HTML del correo a Beatriz cuando hay cards pendientes. Tono tortillería:
 * corto, directo, con lista de qué revisar y un CTA claro al portal.
 * Sin adornos innecesarios — Beatriz lee correos entre pedidos.
 */
function buildPendingNotifHtml(args: {
  autoApprovedCount: number;
  pendingCount:      number;
  pendingRows:       Array<{ cliente: string; total: number; reason: string }>;
  portalUrl:         string | null;
  submittedCount:    number;
}): string {
  const { autoApprovedCount, pendingCount, pendingRows, portalUrl, submittedCount } = args;
  const lista = pendingRows.slice(0, 20).map(r => `
    <tr>
      <td style="padding:8px 12px;border-bottom:1px solid #eee;font-size:13px;">${escapeHtml(r.cliente).slice(0, 80)}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #eee;font-size:13px;text-align:right;">$${r.total.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #eee;font-size:12px;color:#7a6e99;">${escapeHtml(r.reason).slice(0, 120)}</td>
    </tr>
  `).join('');
  const masCount = pendingRows.length - 20;
  const cta = portalUrl
    ? `<p style="margin:24px 0;text-align:center;"><a href="${portalUrl}" style="background:#6C3BFF;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;">Abrir portal para revisar</a></p>`
    : '';
  const resumenLine = autoApprovedCount > 0
    ? `Del Excel de esta semana, <strong>${autoApprovedCount}</strong> factura${autoApprovedCount === 1 ? '' : 's'} ya se timbr${autoApprovedCount === 1 ? 'ó' : 'aron'} automáticamente${submittedCount > 0 ? ` (${submittedCount} XML${submittedCount === 1 ? '' : 's'} en Dropbox)` : ''}. `
    : '';
  return `
<!DOCTYPE html><html><body style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;background:#f5f5f7;margin:0;padding:24px;">
  <div style="max-width:600px;margin:0 auto;background:#fff;border-radius:12px;padding:32px;">
    <p style="margin:0 0 16px;font-size:14px;color:#1A0A3B;">Hola Beatriz,</p>
    <p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:#1A0A3B;">
      ${resumenLine}Necesito tu ojo en <strong>${pendingCount}</strong> factura${pendingCount === 1 ? '' : 's'} que dejé pendiente${pendingCount === 1 ? '' : 's'} porque encontré algo raro:
    </p>
    <table style="width:100%;border-collapse:collapse;margin:16px 0;">
      <thead>
        <tr>
          <th style="padding:8px 12px;text-align:left;font-size:11px;text-transform:uppercase;color:#7a6e99;border-bottom:2px solid #6C3BFF;">Cliente</th>
          <th style="padding:8px 12px;text-align:right;font-size:11px;text-transform:uppercase;color:#7a6e99;border-bottom:2px solid #6C3BFF;">Total</th>
          <th style="padding:8px 12px;text-align:left;font-size:11px;text-transform:uppercase;color:#7a6e99;border-bottom:2px solid #6C3BFF;">Qué revisar</th>
        </tr>
      </thead>
      <tbody>${lista}</tbody>
    </table>
    ${masCount > 0 ? `<p style="font-size:12px;color:#7a6e99;margin:8px 0;">... y ${masCount} más en el portal.</p>` : ''}
    ${cta}
    <p style="margin:24px 0 0;font-size:12px;color:#7a6e99;line-height:1.5;">
      Cuando entres, cada tarjeta muestra qué me falló y puedes corregir el dato antes de aprobar. Si algo no cuadra o quieres que ignore algo, contéstame este correo.
    </p>
    <p style="margin:16px 0 0;font-size:13px;color:#1A0A3B;">Nala</p>
  </div>
</body></html>
  `;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
