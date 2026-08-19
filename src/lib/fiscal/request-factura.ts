/**
 * Servicio que Sofia (u otro agente) invoca cuando el cliente pide su factura.
 * Valida datos, calcula totales, inserta factura_requests, dispara email al
 * responsable de facturación (Martha en AC). No timbramos aquí — solo pasamos
 * el balón bien formateado.
 */

import type { createAdminClient } from '@/lib/supabase/admin';
import { isValidRfc, normalizeRfc, USO_CFDI, FORMA_PAGO, METODO_PAGO, usoCfdiLabel, formaPagoLabel, metodoPagoLabel } from './cfdi-catalog';
import { sendEmail } from '@/lib/email/send';
import { resolveInvoicingPath, emitirFacturaAuto } from '@/lib/invoicing/emitir-factura';

type SupabaseClient = ReturnType<typeof createAdminClient>;

export interface SolicitarFacturaItem {
  descripcion:     string;
  cantidad:        number;
  precio_unitario: number;
  unidad?:         string;
  clave_prodserv?: string;
  clave_unidad?:   string;
}

export interface SolicitarFacturaArgs {
  cliente_nombre:    string;
  cliente_rfc:       string;
  cliente_email:     string;
  cliente_telefono?: string;
  cliente_direccion?: string;
  uso_cfdi:          string;
  forma_pago:        string;
  metodo_pago:       string;
  condiciones_pago?: string;
  items:             SolicitarFacturaItem[];
  incluir_iva?:      boolean;
  notes?:            string;
}

export interface SolicitarFacturaCtx {
  agentId:       string;
  portalEmail:   string;
  businessName:  string;
  supabase:      SupabaseClient;
  channel?:      'voice' | 'chat' | 'email';
  sourceCallId?: string;
  sourceInboxId?: string;
  sourceContext?: string;
  invoicingEmail?: string;  // organizations.invoicing_email; fallback client_email o portal_email
}

export interface SolicitarFacturaResult {
  ok:           boolean;
  request_id?:  string;
  target_email?: string;
  subtotal?:    number;
  iva?:         number;
  total?:       number;
  error?:       string;
  path?:        'human' | 'auto';
  outcome?:     'stamped' | 'failed' | 'retrying';
  uuid?:        string;
  folio_corto?: string;
}

export async function solicitarFactura(
  args: SolicitarFacturaArgs,
  ctx:  SolicitarFacturaCtx,
): Promise<SolicitarFacturaResult> {
  // Validation
  if (!args.cliente_nombre?.trim())    return { ok: false, error: 'Falta el nombre o razón social del cliente.' };
  if (!args.cliente_email?.trim())     return { ok: false, error: 'Falta el correo del cliente donde llegará la factura.' };
  if (!isValidRfc(args.cliente_rfc))   return { ok: false, error: `RFC "${args.cliente_rfc}" no tiene formato válido. Debe ser tipo XAXX010101000.` };
  const rfc = normalizeRfc(args.cliente_rfc);

  const usoCfdi     = args.uso_cfdi.toUpperCase();
  const formaPago   = args.forma_pago.padStart(2, '0');
  const metodoPago  = args.metodo_pago.toUpperCase();

  if (!USO_CFDI[usoCfdi])       return { ok: false, error: `Uso CFDI "${args.uso_cfdi}" no reconocido. Los más comunes: G03 gastos generales, G01 mercancías, P01 por definir.` };
  if (!FORMA_PAGO[formaPago])   return { ok: false, error: `Forma de pago "${args.forma_pago}" no reconocida. Las más comunes: 01 efectivo, 03 transferencia, 04 tarjeta.` };
  if (!METODO_PAGO[metodoPago]) return { ok: false, error: `Método de pago "${args.metodo_pago}" no reconocido. Debe ser PUE (una exhibición) o PPD (parcialidades).` };

  if (!Array.isArray(args.items) || args.items.length === 0) {
    return { ok: false, error: 'La factura necesita al menos un concepto.' };
  }
  for (const it of args.items) {
    if (!it.descripcion?.trim())                          return { ok: false, error: 'Cada concepto necesita descripción.' };
    if (!Number.isFinite(it.cantidad)        || it.cantidad        <= 0) return { ok: false, error: `Cantidad inválida para "${it.descripcion}".` };
    if (!Number.isFinite(it.precio_unitario) || it.precio_unitario <  0) return { ok: false, error: `Precio unitario inválido para "${it.descripcion}".` };
  }

  // Totales
  const subtotal = round2(args.items.reduce((s, i) => s + i.cantidad * i.precio_unitario, 0));
  const incluirIVA = args.incluir_iva !== false;
  const iva      = incluirIVA ? round2(subtotal * 0.16) : 0;
  const total    = round2(subtotal + iva);

  // Insert
  const { data: row, error } = await ctx.supabase
    .from('factura_requests')
    .insert({
      agent_id:          ctx.agentId,
      portal_email:      ctx.portalEmail,
      cliente_nombre:    args.cliente_nombre.trim(),
      cliente_rfc:       rfc,
      cliente_email:     args.cliente_email.trim(),
      cliente_telefono:  args.cliente_telefono?.trim() ?? null,
      cliente_direccion: args.cliente_direccion?.trim() ?? null,
      uso_cfdi:          usoCfdi,
      forma_pago:        formaPago,
      metodo_pago:       metodoPago,
      condiciones_pago:  args.condiciones_pago ?? null,
      items:             args.items,
      subtotal, iva, total,
      currency:          'MXN',
      source_channel:    ctx.channel ?? 'voice',
      source_call_id:    ctx.sourceCallId ?? null,
      source_inbox_id:   ctx.sourceInboxId ?? null,
      source_context:    ctx.sourceContext?.slice(0, 500) ?? null,
      notes:             args.notes ?? null,
      status:            'pending',
    })
    .select('id')
    .single();

  if (error || !row) {
    console.error('[solicitar_factura] insert failed:', error);
    return { ok: false, error: 'No pude registrar la solicitud. Intenta de nuevo.' };
  }

  // Bifurcación: delegar a emitirFacturaAuto si el org tiene PAC configurado
  const invoicingPath = await resolveInvoicingPath(ctx.portalEmail, ctx.supabase);

  if (invoicingPath === 'auto') {
    const auto = await emitirFacturaAuto(row.id, ctx.supabase);
    if (auto.outcome === 'stamped') {
      return {
        ok: true, request_id: row.id, target_email: ctx.invoicingEmail,
        subtotal, iva, total, path: 'auto', outcome: 'stamped',
        uuid: auto.uuid, folio_corto: auto.folioCorto,
      };
    }
    if (auto.outcome === 'retrying') {
      return {
        ok: true, request_id: row.id, target_email: ctx.invoicingEmail,
        subtotal, iva, total, path: 'auto', outcome: 'retrying',
      };
    }
    // 'failed' → cae al flujo humano (email) abajo con guardrail_reason ya guardado
  }

  // Flujo humano (existente): manda email al responsable de facturación
  const targetEmail = ctx.invoicingEmail ?? ctx.portalEmail;
  if (targetEmail) {
    // Resolve portal_token for the deep link. Any agent under the same
    // portal_email will do (sub-users login with any of them and see the same
    // account-wide list); we prefer the agent that originated the request.
    const { data: tokenRow } = await ctx.supabase
      .from('voice_agents')
      .select('portal_token')
      .eq('id', ctx.agentId)
      .single();
    const portalToken = (tokenRow?.portal_token as string | undefined) ?? '';

    void sendFacturaRequestEmail({
      to:            targetEmail,
      requestId:     row.id,
      portalToken,
      businessName:  ctx.businessName,
      cliente:       { nombre: args.cliente_nombre, rfc, email: args.cliente_email, telefono: args.cliente_telefono, direccion: args.cliente_direccion },
      fiscal:        { usoCfdi, formaPago, metodoPago, condiciones: args.condiciones_pago },
      items:         args.items,
      subtotal, iva, total,
      notes:         args.notes,
    }).catch(err => console.error('[solicitar_factura] email dispatch failed:', err));
  }

  return { ok: true, request_id: row.id, target_email: targetEmail, subtotal, iva, total, path: 'human' };
}

function round2(n: number): number { return Math.round(n * 100) / 100; }
function mxn(n: number): string   { return n.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' }); }

interface FacturaEmailArgs {
  to:           string;
  requestId:    string;
  portalToken:  string;
  businessName: string;
  cliente:      { nombre: string; rfc: string; email: string; telefono?: string; direccion?: string };
  fiscal:       { usoCfdi: string; formaPago: string; metodoPago: string; condiciones?: string };
  items:        SolicitarFacturaItem[];
  subtotal:     number;
  iva:          number;
  total:        number;
  notes?:       string;
}

async function sendFacturaRequestEmail(a: FacturaEmailArgs): Promise<void> {
  const base    = process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.centinelia.mx';
  const itemsHtml = a.items.map((it, i) => `
    <tr>
      <td style="padding:8px 6px;border-top:1px solid #eee;color:#374151;font-size:13px">${i + 1}</td>
      <td style="padding:8px 6px;border-top:1px solid #eee;color:#111;font-size:13px">${escapeHtml(it.descripcion)}</td>
      <td style="padding:8px 6px;border-top:1px solid #eee;color:#374151;font-size:13px;text-align:right">${it.cantidad}</td>
      <td style="padding:8px 6px;border-top:1px solid #eee;color:#374151;font-size:13px;text-align:right">${mxn(it.precio_unitario)}</td>
      <td style="padding:8px 6px;border-top:1px solid #eee;color:#111;font-size:13px;text-align:right">${mxn(it.cantidad * it.precio_unitario)}</td>
    </tr>
  `).join('');

  const html = `<!DOCTYPE html>
<html><body style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;background:#f5f5f7;margin:0;padding:32px 16px;color:#111">
<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:620px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden">
  <tr><td style="padding:24px 28px;border-bottom:1px solid #f0f0f0">
    <p style="margin:0;font-size:11px;text-transform:uppercase;letter-spacing:0.08em;color:#6b7280;font-weight:600">Solicitud de factura</p>
    <h1 style="margin:6px 0 0;font-size:20px;font-weight:700;color:#111">Un cliente pidió su CFDI</h1>
    <p style="margin:8px 0 0;font-size:13px;color:#6b7280">${escapeHtml(a.businessName)} · Solicitud ${a.requestId.slice(0, 8)}</p>
  </td></tr>

  <tr><td style="padding:20px 28px">
    <p style="margin:0 0 4px;font-size:11px;text-transform:uppercase;letter-spacing:0.08em;color:#6b7280;font-weight:600">Datos del receptor</p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin-top:8px">
      <tr><td style="padding:4px 0;font-size:13px;color:#6b7280;width:130px">Razón social</td><td style="padding:4px 0;font-size:13px;color:#111;font-weight:600">${escapeHtml(a.cliente.nombre)}</td></tr>
      <tr><td style="padding:4px 0;font-size:13px;color:#6b7280">RFC</td><td style="padding:4px 0;font-size:13px;color:#111;font-weight:600;font-family:monospace">${escapeHtml(a.cliente.rfc)}</td></tr>
      <tr><td style="padding:4px 0;font-size:13px;color:#6b7280">Correo fiscal</td><td style="padding:4px 0;font-size:13px;color:#111">${escapeHtml(a.cliente.email)}</td></tr>
      ${a.cliente.telefono ? `<tr><td style="padding:4px 0;font-size:13px;color:#6b7280">Teléfono</td><td style="padding:4px 0;font-size:13px;color:#111">${escapeHtml(a.cliente.telefono)}</td></tr>` : ''}
      ${a.cliente.direccion ? `<tr><td style="padding:4px 0;font-size:13px;color:#6b7280;vertical-align:top">Dirección</td><td style="padding:4px 0;font-size:13px;color:#111">${escapeHtml(a.cliente.direccion)}</td></tr>` : ''}
    </table>
  </td></tr>

  <tr><td style="padding:0 28px 20px">
    <p style="margin:0 0 4px;font-size:11px;text-transform:uppercase;letter-spacing:0.08em;color:#6b7280;font-weight:600">Datos fiscales</p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin-top:8px">
      <tr><td style="padding:4px 0;font-size:13px;color:#6b7280;width:130px">Uso CFDI</td><td style="padding:4px 0;font-size:13px;color:#111"><strong>${escapeHtml(a.fiscal.usoCfdi)}</strong> · ${escapeHtml(usoCfdiLabel(a.fiscal.usoCfdi))}</td></tr>
      <tr><td style="padding:4px 0;font-size:13px;color:#6b7280">Forma de pago</td><td style="padding:4px 0;font-size:13px;color:#111"><strong>${escapeHtml(a.fiscal.formaPago)}</strong> · ${escapeHtml(formaPagoLabel(a.fiscal.formaPago))}</td></tr>
      <tr><td style="padding:4px 0;font-size:13px;color:#6b7280">Método de pago</td><td style="padding:4px 0;font-size:13px;color:#111"><strong>${escapeHtml(a.fiscal.metodoPago)}</strong> · ${escapeHtml(metodoPagoLabel(a.fiscal.metodoPago))}</td></tr>
      ${a.fiscal.condiciones ? `<tr><td style="padding:4px 0;font-size:13px;color:#6b7280">Condiciones</td><td style="padding:4px 0;font-size:13px;color:#111">${escapeHtml(a.fiscal.condiciones)}</td></tr>` : ''}
    </table>
  </td></tr>

  <tr><td style="padding:0 28px 20px">
    <p style="margin:0 0 8px;font-size:11px;text-transform:uppercase;letter-spacing:0.08em;color:#6b7280;font-weight:600">Conceptos</p>
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border:1px solid #eee;border-radius:8px;overflow:hidden">
      <tr style="background:#fafafa">
        <th style="padding:8px 6px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:0.05em;color:#6b7280;font-weight:600;width:32px">#</th>
        <th style="padding:8px 6px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:0.05em;color:#6b7280;font-weight:600">Descripción</th>
        <th style="padding:8px 6px;text-align:right;font-size:11px;text-transform:uppercase;letter-spacing:0.05em;color:#6b7280;font-weight:600;width:60px">Cant.</th>
        <th style="padding:8px 6px;text-align:right;font-size:11px;text-transform:uppercase;letter-spacing:0.05em;color:#6b7280;font-weight:600;width:100px">P. Unit.</th>
        <th style="padding:8px 6px;text-align:right;font-size:11px;text-transform:uppercase;letter-spacing:0.05em;color:#6b7280;font-weight:600;width:110px">Importe</th>
      </tr>
      ${itemsHtml}
    </table>

    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin-top:12px">
      <tr><td style="text-align:right;font-size:13px;color:#6b7280;padding:2px 6px">Subtotal</td><td style="width:120px;text-align:right;font-size:13px;color:#111;padding:2px 0">${mxn(a.subtotal)}</td></tr>
      ${a.iva > 0 ? `<tr><td style="text-align:right;font-size:13px;color:#6b7280;padding:2px 6px">IVA 16%</td><td style="text-align:right;font-size:13px;color:#111;padding:2px 0">${mxn(a.iva)}</td></tr>` : ''}
      <tr><td style="text-align:right;font-size:14px;color:#111;font-weight:700;padding:8px 6px;border-top:2px solid #111">Total</td><td style="text-align:right;font-size:14px;color:#111;font-weight:700;padding:8px 0;border-top:2px solid #111">${mxn(a.total)}</td></tr>
    </table>
  </td></tr>

  ${a.notes ? `<tr><td style="padding:0 28px 20px">
    <p style="margin:0 0 4px;font-size:11px;text-transform:uppercase;letter-spacing:0.08em;color:#6b7280;font-weight:600">Notas</p>
    <p style="margin:0;font-size:13px;color:#374151;line-height:1.5">${escapeHtml(a.notes)}</p>
  </td></tr>` : ''}

  <tr><td style="padding:20px 28px;background:#fff8e6;border-top:1px solid #ffe8b3">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
      <tr>
        <td style="vertical-align:top;width:24px;padding-top:2px">
          <div style="width:20px;height:20px;border-radius:50%;background:#f59e0b;color:#fff;font-weight:800;font-size:12px;line-height:20px;text-align:center">!</div>
        </td>
        <td style="padding-left:10px">
          <p style="margin:0 0 4px;font-size:13px;font-weight:700;color:#92400e">Siguiente paso: timbrar y marcar como emitida</p>
          <p style="margin:0;font-size:13px;color:#78350f;line-height:1.55">
            1. Copia los datos de arriba a tu PAC (Solución Factible, CONTPAQ, Aspel, etc.) y timbra el CFDI.
            <br/>
            2. Regresa al portal y márcala como <a href="${base}/portal/${encodeURIComponent(a.portalToken)}/oficina/facturas?open=${encodeURIComponent(a.requestId)}" style="color:#6C3BFF;font-weight:700;text-decoration:underline">emitida</a>.
          </p>
        </td>
      </tr>
    </table>
  </td></tr>

  <tr><td style="padding:16px 28px 28px;text-align:center;background:#fafafa">
    <a href="${base}/portal/${encodeURIComponent(a.portalToken)}/oficina/facturas?open=${encodeURIComponent(a.requestId)}" style="display:inline-block;padding:12px 24px;background:#6C3BFF;color:#fff;text-decoration:none;font-weight:600;font-size:14px;border-radius:8px">
      Abrir esta solicitud en el portal
    </a>
    <p style="margin:12px 0 0;font-size:12px;color:#6b7280">
      Solo tú (con acceso al portal de ${escapeHtml(a.businessName)}) puedes marcarla.
    </p>
  </td></tr>
</table>
</body></html>`;

  await sendEmail({
    to:      a.to,
    subject: `Nueva solicitud de factura · ${a.cliente.nombre} · ${mxn(a.total)}`,
    html,
    from:    `${a.businessName} vía Centinelia <notificaciones@centinelia.mx>`,
  });
}

function escapeHtml(s: string | undefined | null): string {
  if (!s) return '';
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
