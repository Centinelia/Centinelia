/**
 * Flow determinístico para Ramón Leang: correo con Excel maestro semanal.
 *
 * Diferencias vs. Tortillería:
 *  - Excel es un ARCHIVO VIVO todo el año (múltiples semanas ya emitidas).
 *  - Nala procesa solo bloques semanales nuevos (los que no ha visto antes).
 *  - Un bloque = 5-6 CFDIs individuales (uno por día hábil + ajuste centavos).
 *  - Todos a Público General (XAXX010101000). Sin resolución de cliente.
 *  - 1 solo producto (SKU="VT" Venta de Tortilla).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { parseRamonLeangXlsx, type ParsedWeekBlock } from '../parsers/ramon-leang-weekly';
import { buildInvoicesFromWeek } from './pipeline';
import { checkConfidence } from './confidence';
import type { BillingAdapter, BillingInvoice } from '../adapter';
import { submitApprovedForEmail, type SubmittedPending } from '../tortilleria/submit-approved';
import type { RamonLeangConfig, PipelineErrorRL, PipelineWarningRL } from './types';

export interface AttachmentBlobRL {
  filename:    string;
  contentType: string;
  buffer:      Buffer;
  index:       number;
}

export interface RamonLeangFlowInput {
  portalEmail:  string;
  emailId:      string;
  agentId:      string;
  attachments:  AttachmentBlobRL[];
  config:       RamonLeangConfig;
  supabase:     SupabaseClient;
  adapter?:     BillingAdapter;
  clientEmail?: string;
  portalToken?: string;
  businessName?: string;
  contactName?: string;
  /**
   * Filtro opcional: solo procesar el bloque con `weekStart` en este rango
   * [inicio, fin] inclusive. Si no se pasa, procesa TODOS los bloques
   * encontrados (útil para backfill inicial; peligroso en operación normal).
   * Cron martes debería pasar rango = semana anterior (lun-dom).
   */
  weekRange?: { from: string; to: string };
}

export interface RamonLeangFlowResult {
  processed:         boolean;
  blockCount:        number;
  invoiceCount:      number;
  cardCount:         number;
  autoApprovedCount: number;
  pendingCount:      number;
  errorCount:        number;
  warnings:          PipelineWarningRL[];
  errors:            PipelineErrorRL[];
  submitted:         SubmittedPending[];
}

function isExcel(a: { contentType?: string; filename?: string }): boolean {
  const ct = (a.contentType ?? '').toLowerCase();
  const fn = (a.filename ?? '').toLowerCase();
  if (ct.startsWith('application/vnd.ms-excel')) return true;
  if (ct.startsWith('application/vnd.openxmlformats-officedocument.spreadsheetml')) return true;
  if (fn.endsWith('.xlsx') || fn.endsWith('.xls')) return true;
  return false;
}

export async function runRamonLeangFlow(input: RamonLeangFlowInput): Promise<RamonLeangFlowResult> {
  const empty: RamonLeangFlowResult = {
    processed:         false,
    blockCount:        0,
    invoiceCount:      0,
    cardCount:         0,
    autoApprovedCount: 0,
    pendingCount:      0,
    errorCount:        0,
    warnings:          [],
    errors:            [],
    submitted:         [],
  };

  const excels = input.attachments.filter(isExcel);
  if (excels.length === 0) return empty;

  // Idempotencia: si ya insertamos rows para este emailId (misma pass del cron),
  // solo intentar cerrar el ciclo submit approved sin re-parsear.
  const { data: existing } = await input.supabase
    .from('billing_pending_review')
    .select('id')
    .eq('email_id', input.emailId)
    .eq('portal_email', input.portalEmail)
    .limit(1);
  if (existing && existing.length > 0) {
    const submitted: SubmittedPending[] = [];
    const errors:    PipelineErrorRL[]  = [];
    if (input.adapter) {
      const r = await submitApprovedForEmail({
        portalEmail: input.portalEmail,
        emailId:     input.emailId,
        adapter:     input.adapter,
        supabase:    input.supabase,
      });
      submitted.push(...r.submitted);
      for (const e of r.errors) errors.push({ weekStart: '(submit)', reason: e.reason });
    }
    return { ...empty, processed: true, submitted, errors, errorCount: errors.length };
  }

  // Parse todos los xlsx.
  const allBlocks: ParsedWeekBlock[] = [];
  const allWarnings: PipelineWarningRL[] = [];
  const allErrors:   PipelineErrorRL[]   = [];
  for (const att of excels) {
    try {
      const parsed = parseRamonLeangXlsx(att.buffer);
      allBlocks.push(...parsed.blocks);
      for (const w of parsed.warnings) allWarnings.push({ weekStart: '(archivo)', message: w });
    } catch (parseErr) {
      allErrors.push({ weekStart: '(archivo)', reason: `Fallo al parsear ${att.filename}: ${(parseErr as Error).message}` });
    }
  }

  // Filtrar bloques por rango si se indicó. Cron martes normalmente pasa
  // semana anterior (lun-dom pasado) para procesar solo lo nuevo.
  const blocksToProcess = input.weekRange
    ? allBlocks.filter(b => b.weekStart >= input.weekRange!.from && b.weekStart <= input.weekRange!.to)
    : allBlocks;

  if (blocksToProcess.length === 0) {
    console.log('[ramon-leang/excel-flow] sin bloques que procesar', JSON.stringify({
      portal_email: input.portalEmail,
      email_id: input.emailId,
      xlsx_count: excels.length,
      total_blocks_in_excel: allBlocks.length,
      week_range: input.weekRange ?? '(sin filtro)',
    }));
    return { ...empty, processed: true, warnings: allWarnings, errors: allErrors, errorCount: allErrors.length };
  }

  // Por cada bloque: confidence check + build invoices + prep rows para insert.
  let autoApprovedCount = 0;
  const rows: Array<Record<string, unknown>> = [];

  for (const block of blocksToProcess) {
    for (const w of block.warnings) allWarnings.push({ weekStart: block.weekStart, message: w });

    const confidence = checkConfidence({ block });

    const result = buildInvoicesFromWeek(block, input.config);
    if (result.error) {
      allErrors.push({ weekStart: block.weekStart, reason: result.error });
      continue;
    }

    // Auto-approve por bloque completo: si el confidence pasa, TODOS los CFDIs
    // del bloque nacen approved. Si no, TODOS caen a pending para que Beatriz
    // PV revise en el portal.
    const status: 'approved' | 'pending' = confidence.autoApprove ? 'approved' : 'pending';
    if (confidence.autoApprove) autoApprovedCount += result.invoices.length;

    const reason = confidence.autoApprove
      ? `Auto-aprobada (semana ${block.weekStart} cuadra: $${block.totalDepositos?.toFixed(2)}).`
      : confidence.reasons[0] ?? `Semana ${block.weekStart} requiere revisión.`;

    for (let i = 0; i < result.invoices.length; i++) {
      const inv = result.invoices[i];
      const meta = result.meta[i];
      const total = inv.lines[0].unitPrice;

      rows.push({
        portal_email:   input.portalEmail,
        email_id:       input.emailId,
        image_index:    null,
        remision_index: i,
        folio:          `${block.weekStart} • día ${inv.date.slice(8, 10)}${meta.isAjuste ? ' (ajuste)' : ''}`,
        cliente_texto:  'Público en General',
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
          origin:             'ramon_leang_pipeline',
          week_start:         block.weekStart,
          is_ajuste:          meta.isAjuste,
          metodo_pago:        inv.metodoPago ?? 'PUE',
          uso_cfdi:           inv.usoCFDI,
          serie:              inv.serie,
          forma_pago:         inv.paymentMethod,
          notes:              inv.notes,
          confidence_reasons: confidence.reasons,
          auto_approved:      confidence.autoApprove,
          block_total:        block.totalDepositos,
          block_cfdi_base:    block.cfdiBase,
          block_ajuste_monto: block.ajusteMonto,
          block_dias_habiles: block.diasHabiles,
        },
        candidates:     null,
        status:         status as 'approved' | 'pending',
        ...(confidence.autoApprove ? {
          resolved_at: new Date().toISOString(),
          resolved_by: 'nala-auto',
        } : {}),
      });
    }
  }

  if (rows.length > 0) {
    const { error: insErr } = await input.supabase
      .from('billing_pending_review')
      .insert(rows);
    if (insErr) {
      allErrors.push({ weekStart: '(insert)', reason: `Fallo al insertar billing_pending_review: ${insErr.message}` });
    }
  }

  // Submit inmediato de los auto-approved.
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
      allErrors.push({ weekStart: '(auto-submit)', reason: e.reason });
    }
  }

  const pendingCount = rows.length - autoApprovedCount;
  const autoApprovedFailed = autoApprovedCount - submitted.length;

  // Notif Beatriz PV si hay pendings o auto-approved fallidos.
  if ((pendingCount > 0 || autoApprovedFailed > 0) && input.clientEmail) {
    try {
      const { sendMeerkatHtmlEmail } = await import('@/lib/email/send-as-agent');
      const html = buildNotifHtml({
        contactName:        input.contactName,
        autoApprovedCount,
        pendingCount,
        submittedCount:     submitted.length,
        autoApprovedFailed,
        pendingRows:        rows
          .filter(r => r.status === 'pending')
          .map(r => ({
            fecha:  r['fecha'] as string,
            total:  Number(r['total']),
            reason: r['reason'] as string,
          })),
        portalUrl: input.portalToken
          ? `https://www.centinelia.mx/portal/${input.portalToken}/oficina/facturas/pendientes`
          : null,
      });
      const prefix = input.businessName ? `[${input.businessName}] ` : '';
      const subject = pendingCount === 1
        ? `${prefix}1 factura de la semana necesita tu revisión`
        : `${prefix}${pendingCount} facturas de la semana necesitan tu revisión`;
      await sendMeerkatHtmlEmail({
        agentId: input.agentId,
        to:      input.clientEmail,
        subject,
        html,
      }, input.supabase);
    } catch (notifErr) {
      console.warn('[ramon-leang/excel-flow] notif Beatriz PV falló (no fatal):', (notifErr as Error).message);
    }
  }

  console.log('[ramon-leang/excel-flow] procesado', JSON.stringify({
    portal_email:        input.portalEmail,
    email_id:            input.emailId,
    agent_id:            input.agentId,
    xlsx_count:          excels.length,
    blocks_in_range:     blocksToProcess.length,
    total_blocks_excel:  allBlocks.length,
    invoice_count:       rows.length,
    auto_approved_count: autoApprovedCount,
    pending_count:       pendingCount,
    submitted_count:     submitted.length,
    error_count:         allErrors.length,
    warning_count:       allWarnings.length,
  }));

  return {
    processed:         true,
    blockCount:        blocksToProcess.length,
    invoiceCount:      rows.length,
    cardCount:         rows.length,
    autoApprovedCount,
    pendingCount,
    errorCount:        allErrors.length,
    warnings:          allWarnings,
    errors:            allErrors,
    submitted,
  };
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function buildNotifHtml(args: {
  contactName?: string;
  autoApprovedCount: number;
  pendingCount: number;
  submittedCount: number;
  autoApprovedFailed: number;
  pendingRows: Array<{ fecha: string; total: number; reason: string }>;
  portalUrl: string | null;
}): string {
  const { contactName, autoApprovedCount, pendingCount, submittedCount, autoApprovedFailed, pendingRows, portalUrl } = args;
  const saludo = contactName?.trim() ? `Hola ${escapeHtml(contactName.trim())},` : 'Hola,';
  const filas = pendingRows.slice(0, 20).map(r => `
    <tr>
      <td style="padding:8px 12px;border-bottom:1px solid #eee;font-size:13px;">${escapeHtml(r.fecha)}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #eee;font-size:13px;text-align:right;">$${r.total.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #eee;font-size:12px;color:#7a6e99;">${escapeHtml(r.reason).slice(0, 160)}</td>
    </tr>
  `).join('');
  const cta = portalUrl
    ? `<p style="margin:24px 0;text-align:center;"><a href="${portalUrl}" style="background:#6C3BFF;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;">Abrir portal para revisar</a></p>`
    : '';
  const okLine = autoApprovedCount > 0
    ? `De las facturas de esta semana, <strong>${autoApprovedCount}</strong> ya se timbraron automáticamente${submittedCount > 0 ? ` (${submittedCount} XMLs en Dropbox)` : ''}. `
    : '';
  const failBanner = autoApprovedFailed > 0
    ? `<div style="background:#fef3c7;border:1px solid #f59e0b;border-radius:8px;padding:12px 16px;margin:16px 0;font-size:13px;color:#92400e;"><strong>Aviso:</strong> ${autoApprovedFailed} factura(s) aprobadas no se pudieron enviar (Dropbox/CONTPAQi). Se reintentan.</div>`
    : '';
  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;background:#f5f5f7;margin:0;padding:24px;">
<div style="max-width:600px;margin:0 auto;background:#fff;border-radius:12px;padding:32px;">
<p style="margin:0 0 16px;font-size:14px;color:#1A0A3B;">${saludo}</p>
${failBanner}
<p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:#1A0A3B;">
${okLine}${pendingCount > 0 ? `Necesito tu ojo en <strong>${pendingCount}</strong> factura${pendingCount === 1 ? '' : 's'} que dejé pendiente${pendingCount === 1 ? '' : 's'} porque encontré algo raro:` : ''}
</p>
<table style="width:100%;border-collapse:collapse;margin:16px 0;">
<thead><tr>
<th style="padding:8px 12px;text-align:left;font-size:11px;text-transform:uppercase;color:#7a6e99;border-bottom:2px solid #6C3BFF;">Fecha</th>
<th style="padding:8px 12px;text-align:right;font-size:11px;text-transform:uppercase;color:#7a6e99;border-bottom:2px solid #6C3BFF;">Total</th>
<th style="padding:8px 12px;text-align:left;font-size:11px;text-transform:uppercase;color:#7a6e99;border-bottom:2px solid #6C3BFF;">Qué revisar</th>
</tr></thead>
<tbody>${filas}</tbody>
</table>
${cta}
<p style="margin:24px 0 0;font-size:12px;color:#7a6e99;line-height:1.5;">Si algo no cuadra o quieres que ignore algo, contéstame este correo.</p>
<p style="margin:16px 0 0;font-size:13px;color:#1A0A3B;">Nala</p>
</div></body></html>`;
}
