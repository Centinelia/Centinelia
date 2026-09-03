/**
 * Cron endpoint — facturación proactiva de Nala.
 *
 * Corre diariamente (9 AM MX típico). Emite CFDIs para clientes en
 * centinelia_clientes cuya fecha_proxima_facturacion <= hoy, siempre y cuando
 * no se haya facturado ya este ciclo (idempotencia via unique index en
 * centinelia_billing).
 *
 * Flujo por cliente:
 *   1. Calcula ciclo_key según periodicidad (2026-09 para mensual, etc)
 *   2. Verifica centinelia_billing: ¿ya facturado este ciclo? Si sí, skip.
 *   3. Construye CfdiInput con conceptos del plan + preset Centinelia como emisor
 *   4. Llama emitirIngresoFacturama → timbra + descarga PDF + envía correo con XML+PDF
 *   5. Inserta evento en centinelia_billing (cfdi_emitido) con ciclo_key
 *   6. Avanza fecha_proxima_facturacion += periodicidad
 *   7. Update fecha_ultima_facturacion = hoy
 *
 * Si el timbrado falla, se inserta evento error_emision para audit sin
 * bloquear a otros clientes del batch. La fecha_proxima_facturacion NO se
 * avanza para que el próximo cron reintente (idempotencia protege contra
 * duplicados si en el retry sí funciona).
 */
import { NextRequest, NextResponse } from 'next/server';
import {
  getClientesPorFacturar, updateCliente, nextBillingDate, cicloKey,
  type CentineliaCliente,
} from '@/lib/billing/centinelia-clientes';
import {
  recordBillingEvent, yaFacturadoEsteCiclo,
} from '@/lib/billing/centinelia-billing';
import { emitirIngresoFacturama } from '@/lib/invoicing/facturama/emitir';
import {
  getCentineliaFiscalConfig, getFacturamaCredentials, isFacturamaSandbox,
} from '@/lib/invoicing/facturama/centinelia-preset';
import type { CfdiInput } from '@/lib/invoicing/provider';
import { createAdminClient } from '@/lib/supabase/admin';
import { nalaCfdiSender, nalaCfdiBodyDefault, nalaEmailHtml } from '@/lib/ops/nala-cfdi-sender';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

function buildCfdiInput(cliente: CentineliaCliente): CfdiInput {
  const cfg = getCentineliaFiscalConfig();
  const creds = getFacturamaCredentials();

  const conceptos = cliente.conceptos.map(c => {
    const cantidad = c.cantidad ?? 1;
    const importe = +(cantidad * c.valor_unitario).toFixed(2);
    const conIva = c.con_iva !== false;
    return {
      claveProdServ: '81112501',
      claveUnidad:   'E48',
      cantidad,
      descripcion:   c.descripcion,
      valorUnitario: c.valor_unitario,
      importe,
      iva:           conIva ? +(importe * 0.16).toFixed(2) : undefined,
    };
  });
  const subtotal = +conceptos.reduce((s, c) => s + c.importe, 0).toFixed(2);
  const iva = +conceptos.reduce((s, c) => s + (c.iva ?? 0), 0).toFixed(2);
  const total = +(subtotal + iva).toFixed(2);

  return {
    emisor: {
      rfc:           cfg.rfc,
      regimenFiscal: cfg.regimenFiscal,
      nombre:        cfg.razonSocial,
    },
    receptor: {
      rfc:             cliente.rfc,
      nombre:          cliente.razon_social,
      usoCfdi:         cliente.uso_cfdi_default,
      regimenFiscal:   cliente.regimen_fiscal,
      domicilioFiscal: cliente.cp,
    },
    lugarExpedicion: cfg.lugarExpedicion,
    formaPago:       cliente.forma_pago_default,
    metodoPago:      cliente.metodo_pago_default,
    moneda:          'MXN',
    conceptos,
    subtotal, iva, total,
    csd: { cerPem: '', keyPem: '', noCertificado: '' },
    pacCredentials: creds,
  };
}

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization') ?? '';
  const expected = process.env.CRON_SECRET;
  if (!expected || auth !== `Bearer ${expected}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const supabase = createAdminClient();
  const testMode = isFacturamaSandbox();
  const hoy = new Date().toISOString().slice(0, 10);

  const summary = {
    ranAt:         new Date().toISOString(),
    fechaCorte:    hoy,
    testMode,
    totalClientes: 0,
    skippedYaFacturados: 0,
    intentados:    0,
    emitidos:      0,
    errores:       [] as Array<{ clienteId: string; rfc: string; razon: string; error: string }>,
  };

  let clientes: CentineliaCliente[];
  try {
    clientes = await getClientesPorFacturar(hoy, supabase);
  } catch (e) {
    return NextResponse.json({ error: `getClientesPorFacturar: ${(e as Error).message}` }, { status: 500 });
  }
  summary.totalClientes = clientes.length;

  for (const cliente of clientes) {
    const ciclo = cicloKey(cliente.fecha_proxima_facturacion, cliente.periodicidad);

    // Idempotencia: si ya se emitió este ciclo, skip.
    try {
      const previo = await yaFacturadoEsteCiclo(cliente.id, ciclo, 'cfdi_emitido', supabase);
      if (previo) {
        summary.skippedYaFacturados++;
        // Igual avanza la fecha si no se avanzó antes (por si el error fue en el update)
        if (cliente.fecha_proxima_facturacion <= hoy) {
          const next = nextBillingDate(cliente.fecha_proxima_facturacion, cliente.periodicidad);
          await updateCliente(cliente.id, {
            fecha_proxima_facturacion: next,
          }, supabase);
        }
        continue;
      }
    } catch (e) {
      summary.errores.push({
        clienteId: cliente.id, rfc: cliente.rfc, razon: cliente.razon_social,
        error: `yaFacturadoEsteCiclo: ${(e as Error).message}`,
      });
      continue;
    }

    if (cliente.conceptos.length === 0) {
      summary.errores.push({
        clienteId: cliente.id, rfc: cliente.rfc, razon: cliente.razon_social,
        error: 'cliente sin conceptos configurados en su plan',
      });
      continue;
    }

    summary.intentados++;

    // Timbrado + descarga + email en una sola llamada
    const cfdi = buildCfdiInput(cliente);
    const result = await emitirIngresoFacturama(cfdi, {
      testMode,
      timeoutMs:   60000,
      sendToEmail: cliente.correo_facturacion,
      emailSubject: `Factura ${cliente.razon_social} - ${ciclo}`,
      sender:      nalaCfdiSender,
    });

    if (!result.ok) {
      // Registra el error para audit — la fecha_proxima_facturacion NO avanza
      // para que el próximo cron reintente. Idempotencia impide duplicado si
      // el reintento sí funciona.
      await recordBillingEvent({
        cliente_id:    cliente.id,
        tipo:          'error_emision',
        ciclo_key:     ciclo,
        error_code:    result.code,
        error_message: result.message,
      }, supabase).catch(() => { /* best effort */ });
      summary.errores.push({
        clienteId: cliente.id, rfc: cliente.rfc, razon: cliente.razon_social,
        error:     `[${result.code}] ${result.message}`,
      });
      continue;
    }

    // Registrar emisión + avanzar fecha
    try {
      await recordBillingEvent({
        cliente_id:    cliente.id,
        tipo:          'cfdi_emitido',
        ciclo_key:     ciclo,
        cfdi_uuid:     result.uuid,
        monto:         cfdi.total,
        moneda:        'MXN',
        xml_path:      result.storagePaths?.xml ?? null,
        pdf_path:      result.storagePaths?.pdf ?? null,
        qr_path:       result.storagePaths?.qr ?? null,
        sent_to_email: cliente.correo_facturacion,
        sent_at:       result.emailSent ? new Date().toISOString() : null,
        meta:          { fecha_timbrado: result.fechaTimbrado, cert_sat: result.certificadoSat },
      }, supabase);

      const next = nextBillingDate(cliente.fecha_proxima_facturacion, cliente.periodicidad);
      await updateCliente(cliente.id, {
        fecha_proxima_facturacion: next,
      }, supabase);
      // fecha_ultima_facturacion también — pero no está en el input type. Update raw:
      await supabase
        .from('centinelia_clientes')
        .update({ fecha_ultima_facturacion: hoy })
        .eq('id', cliente.id);

      summary.emitidos++;
    } catch (e) {
      summary.errores.push({
        clienteId: cliente.id, rfc: cliente.rfc, razon: cliente.razon_social,
        error:     `post-emisión: ${(e as Error).message} — UUID timbrado: ${result.uuid}`,
      });
    }
  }

  return NextResponse.json(summary);
}
