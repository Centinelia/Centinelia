/**
 * Aprueba manualmente un pago que Nala marcó como pendiente. Al aprobar,
 * dispara el timbrado del REP (mismo flow que auto-approve) y registra
 * pago_recibido + rep_emitido. Cierra el pendiente.
 */
import { NextRequest, NextResponse } from 'next/server';
import { isAdmin } from '@/lib/admin/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { emitirPagoFacturama } from '@/lib/invoicing/facturama/emitir';
import {
  getCentineliaFiscalConfig, getFacturamaCredentials, isFacturamaSandbox,
} from '@/lib/invoicing/facturama/centinelia-preset';
import type { PagoInput } from '@/lib/invoicing/provider';
import { nalaCfdiSender } from '@/lib/ops/nala-cfdi-sender';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!await isAdmin()) return NextResponse.json({ error: 'admin only' }, { status: 401 });
  const { id } = await params;

  const supabase = createAdminClient();

  const { data: pending, error: pendErr } = await supabase
    .from('centinelia_billing')
    .select('*')
    .eq('id', id)
    .eq('tipo', 'pago_pendiente_verificacion')
    .maybeSingle();

  if (pendErr || !pending) return NextResponse.json({ error: 'pendiente no encontrado' }, { status: 404 });
  if (!pending.cliente_id) return NextResponse.json({ error: 'pendiente sin cliente asociado — hay que resolver manualmente vía SQL o rechazando el evento' }, { status: 400 });

  const { data: cliente } = await supabase
    .from('centinelia_clientes')
    .select('*')
    .eq('id', pending.cliente_id)
    .single();
  if (!cliente) return NextResponse.json({ error: 'cliente no encontrado' }, { status: 404 });

  // Busca el CFDI original para saber ciclo_key y monto original
  const { data: cfdiOrig } = await supabase
    .from('centinelia_billing')
    .select('*')
    .eq('tipo', 'cfdi_emitido')
    .eq('cfdi_uuid', pending.related_uuid)
    .maybeSingle();

  if (!cfdiOrig) return NextResponse.json({ error: 'CFDI original no encontrado' }, { status: 404 });

  const centinelia = getCentineliaFiscalConfig();
  const creds = getFacturamaCredentials();
  const testMode = isFacturamaSandbox();

  const totalCfdi = Number(cfdiOrig.monto);
  const montoPago = Number(pending.monto);
  const ivaBase = +(totalCfdi / 1.16).toFixed(2);
  const ivaImporte = +(totalCfdi - ivaBase).toFixed(2);
  const meta = (pending.meta ?? {}) as Record<string, unknown>;
  const fechaPago = String(meta.fecha_pago ?? new Date().toISOString());
  const numOp = meta.num_operacion as string | undefined;
  const formaPago = String(meta.forma_pago ?? '03');

  const pago: PagoInput = {
    emisor: { rfc: centinelia.rfc, regimenFiscal: centinelia.regimenFiscal, nombre: centinelia.razonSocial },
    receptor: {
      rfc:             cliente.rfc,
      nombre:          cliente.razon_social,
      regimenFiscal:   cliente.regimen_fiscal,
      domicilioFiscal: cliente.cp,
      usoCfdi:         'CP01',
    },
    lugarExpedicion: centinelia.lugarExpedicion,
    pago: {
      fechaPago,
      formaDePagoP: formaPago,
      monedaP: 'MXN',
      monto: montoPago,
      numOperacion: numOp,
      documentosRelacionados: [{
        uuid: pending.related_uuid,
        monedaDR: 'MXN',
        metodoDePagoDR: 'PPD',
        numParcialidad: 1,
        impSaldoAnt: totalCfdi,
        impPagado: montoPago,
        impSaldoInsoluto: Math.max(0, totalCfdi - montoPago),
        objetoImpDR: '02',
        taxes: [{
          base: ivaBase, impuesto: '002', tipoFactor: 'Tasa',
          tasaOCuota: 0.16, importe: ivaImporte, isRetencion: false,
        }],
      }],
    },
    csd: { cerPem: '', keyPem: '', noCertificado: '' },
    pacCredentials: creds,
  };

  const emailDestino = pending.sent_to_email ?? cliente.correo_facturacion;
  const result = await emitirPagoFacturama(pago, {
    testMode, timeoutMs: 60000,
    sendToEmail: emailDestino,
    sender: nalaCfdiSender,
  });

  if (!result.ok) {
    return NextResponse.json({ error: `Timbrado falló: [${result.code}] ${result.message}` }, { status: 500 });
  }

  // Registra eventos definitivos
  await supabase.from('centinelia_billing').insert({
    cliente_id: cliente.id,
    tipo: 'pago_recibido',
    ciclo_key: cfdiOrig.ciclo_key,
    related_uuid: pending.related_uuid,
    monto: montoPago,
    moneda: 'MXN',
    meta: { fecha_pago: fechaPago, num_operacion: numOp, forma_pago: formaPago, auto_approved: false, approved_from_pending: pending.id },
  });
  await supabase.from('centinelia_billing').insert({
    cliente_id: cliente.id,
    tipo: 'rep_emitido',
    ciclo_key: cfdiOrig.ciclo_key,
    cfdi_uuid: result.uuid,
    related_uuid: pending.related_uuid,
    monto: montoPago,
    moneda: 'MXN',
    sent_to_email: emailDestino,
    sent_at: result.emailSent ? new Date().toISOString() : null,
    meta: { fecha_timbrado: result.fechaTimbrado, approved_from_pending: pending.id },
  });

  // Marca el evento pendiente como resuelto (agregamos meta.resolved_at)
  await supabase
    .from('centinelia_billing')
    .update({
      meta: {
        ...(pending.meta as Record<string, unknown>),
        resolved_at: new Date().toISOString(),
        resolved_action: 'approved',
        rep_uuid: result.uuid,
      },
    })
    .eq('id', id);

  return NextResponse.json({
    ok: true,
    rep_uuid: result.uuid,
    monto_pagado: montoPago,
    sent_to: emailDestino,
    message: `REP ${result.uuid} timbrado y enviado a ${emailDestino}`,
  });
}
