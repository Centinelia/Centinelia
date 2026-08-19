/**
 * Servicio que un empleado invoca cuando el cliente pide su factura.
 * Valida datos, calcula totales, inserta factura_requests, y timbra vía el
 * PAC del negocio (SF, CONTPAQi, etc.).
 *
 * Requiere que el org tenga invoicing_provider + CSD cargados. El flujo
 * manual (email al responsable de facturación) fue eliminado 2026-08-19 —
 * si el org no tiene PAC configurado, el empleado responde al cliente que
 * necesita conectar uno antes de poder facturar.
 */

import type { createAdminClient } from '@/lib/supabase/admin';
import { isValidRfc, normalizeRfc, USO_CFDI, FORMA_PAGO, METODO_PAGO } from './cfdi-catalog';
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
}

export interface SolicitarFacturaResult {
  ok:           boolean;
  request_id?:  string;
  subtotal?:    number;
  iva?:         number;
  total?:       number;
  error?:       string;
  /** 'no_pac' = org sin invoicing_provider — cliente debe conectar PAC */
  reason?:      'no_pac';
  outcome?:     'stamped' | 'failed' | 'retrying';
  uuid?:        string;
  folio_corto?: string;
}

export async function solicitarFactura(
  args: SolicitarFacturaArgs,
  ctx:  SolicitarFacturaCtx,
): Promise<SolicitarFacturaResult> {
  // Gate: solo orgs con PAC pueden facturar (2026-08-19: flujo manual eliminado)
  const invoicingPath = await resolveInvoicingPath(ctx.portalEmail, ctx.supabase);
  if (invoicingPath !== 'auto') {
    return {
      ok: false,
      reason: 'no_pac',
      error: 'Este negocio aún no tiene configurado un PAC para facturar. Un humano necesita conectar Solución Factible (u otro proveedor) desde Integraciones antes de poder timbrar CFDIs.',
    };
  }

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

  // Timbrar vía PAC. Si falla auto, el status en factura_requests queda como
  // failed/retrying y el cron retry-failed-stamps se encarga. No hay fallback
  // manual (email) desde 2026-08-19.
  const auto = await emitirFacturaAuto(row.id, ctx.supabase);
  if (auto.outcome === 'stamped') {
    return {
      ok: true, request_id: row.id,
      subtotal, iva, total, outcome: 'stamped',
      uuid: auto.uuid, folio_corto: auto.folioCorto,
    };
  }
  if (auto.outcome === 'retrying') {
    return {
      ok: true, request_id: row.id,
      subtotal, iva, total, outcome: 'retrying',
    };
  }
  // 'failed' — request queda en DB con guardrail_reason. Portal la mostrará
  // para reintento manual desde /oficina/facturas.
  return {
    ok: false, request_id: row.id,
    subtotal, iva, total, outcome: 'failed',
    error: (auto as { error?: string }).error ?? 'Timbrado falló. Revisa el detalle en el portal.',
  };
}

function round2(n: number): number { return Math.round(n * 100) / 100; }

