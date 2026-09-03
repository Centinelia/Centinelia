// scripts/run-nala-billing-cycle.ts — dispara el cron nala-billing-cycle
// directo bypasseando el HTTP endpoint (útil cuando el dev server no corre).

import { config as dotenvConfig } from 'dotenv';
dotenvConfig({ path: '.env.local' });

import { getClientesPorFacturar, updateCliente, nextBillingDate, cicloKey, type CentineliaCliente } from '../src/lib/billing/centinelia-clientes';
import { recordBillingEvent, yaFacturadoEsteCiclo } from '../src/lib/billing/centinelia-billing';
import { emitirIngresoFacturama } from '../src/lib/invoicing/facturama/emitir';
import { getCentineliaFiscalConfig, getFacturamaCredentials, isFacturamaSandbox } from '../src/lib/invoicing/facturama/centinelia-preset';
import type { CfdiInput } from '../src/lib/invoicing/provider';
import { createAdminClient } from '../src/lib/supabase/admin';
import { nalaCfdiSender } from '../src/lib/ops/nala-cfdi-sender';

function buildCfdiInput(cliente: CentineliaCliente): CfdiInput {
  const cfg = getCentineliaFiscalConfig();
  const creds = getFacturamaCredentials();
  const conceptos = cliente.conceptos.map(c => {
    const cantidad = c.cantidad ?? 1;
    const importe = +(cantidad * c.valor_unitario).toFixed(2);
    const conIva = c.con_iva !== false;
    return {
      claveProdServ: '81112501', claveUnidad: 'E48', cantidad,
      descripcion: c.descripcion, valorUnitario: c.valor_unitario, importe,
      iva: conIva ? +(importe * 0.16).toFixed(2) : undefined,
    };
  });
  const subtotal = +conceptos.reduce((s, c) => s + c.importe, 0).toFixed(2);
  const iva = +conceptos.reduce((s, c) => s + (c.iva ?? 0), 0).toFixed(2);
  const total = +(subtotal + iva).toFixed(2);
  return {
    emisor: { rfc: cfg.rfc, regimenFiscal: cfg.regimenFiscal, nombre: cfg.razonSocial },
    receptor: {
      rfc: cliente.rfc, nombre: cliente.razon_social,
      usoCfdi: cliente.uso_cfdi_default,
      regimenFiscal: cliente.regimen_fiscal,
      domicilioFiscal: cliente.cp,
    },
    lugarExpedicion: cfg.lugarExpedicion,
    formaPago: cliente.forma_pago_default,
    metodoPago: cliente.metodo_pago_default,
    moneda: 'MXN',
    conceptos, subtotal, iva, total,
    csd: { cerPem: '', keyPem: '', noCertificado: '' },
    pacCredentials: creds,
  };
}

async function main() {
  const supabase = createAdminClient();
  const testMode = isFacturamaSandbox();
  const hoy = new Date().toISOString().slice(0, 10);

  console.log(`Nala billing cycle @ ${new Date().toISOString()}`);
  console.log(`Modo: ${testMode ? 'SANDBOX' : 'PROD'} | Fecha corte: ${hoy}\n`);

  const clientes = await getClientesPorFacturar(hoy, supabase);
  console.log(`Clientes activos con fecha_proxima <= hoy: ${clientes.length}\n`);

  for (const cliente of clientes) {
    const ciclo = cicloKey(cliente.fecha_proxima_facturacion, cliente.periodicidad);
    console.log(`─── ${cliente.razon_social} (${cliente.rfc}) ───`);
    console.log(`   Ciclo: ${ciclo} | Correo: ${cliente.correo_facturacion}`);

    const previo = await yaFacturadoEsteCiclo(cliente.id, ciclo, 'cfdi_emitido', supabase);
    if (previo) {
      console.log(`   → SKIP: ya facturado (UUID ${previo.cfdi_uuid?.slice(-8)})`);
      continue;
    }

    if (cliente.conceptos.length === 0) {
      console.log(`   → ERROR: cliente sin conceptos`);
      continue;
    }

    const cfdi = buildCfdiInput(cliente);
    console.log(`   Total a timbrar: $${cfdi.total.toFixed(2)} (subtotal ${cfdi.subtotal} + IVA ${cfdi.iva})`);
    console.log(`   Conceptos:`);
    cfdi.conceptos.forEach((c, i) => console.log(`     ${i + 1}. ${c.descripcion} — $${c.valorUnitario}`));

    console.log(`   → Timbrando...`);
    const result = await emitirIngresoFacturama(cfdi, {
      testMode, timeoutMs: 60000,
      sendToEmail: cliente.correo_facturacion,
      emailSubject: `Factura ${cliente.razon_social} - ${ciclo}`,
      sender: nalaCfdiSender,
    });

    if (!result.ok) {
      console.log(`   ✗ FAIL: [${result.code}] ${result.message}`);
      await recordBillingEvent({
        cliente_id: cliente.id, tipo: 'error_emision', ciclo_key: ciclo,
        error_code: result.code, error_message: result.message,
      }, supabase).catch(() => { /* best effort */ });
      continue;
    }

    console.log(`   ✓ OK UUID ${result.uuid}`);
    console.log(`     Email: ${result.emailSent ? 'enviado' : 'FALLÓ'} a ${cliente.correo_facturacion}`);
    console.log(`     PDF: ${result.pdf ? `${result.pdf.length} bytes` : 'no descargado'}`);

    await recordBillingEvent({
      cliente_id: cliente.id, tipo: 'cfdi_emitido', ciclo_key: ciclo,
      cfdi_uuid: result.uuid, monto: cfdi.total, moneda: 'MXN',
      sent_to_email: cliente.correo_facturacion,
      sent_at: result.emailSent ? new Date().toISOString() : null,
      meta: { fecha_timbrado: result.fechaTimbrado, cert_sat: result.certificadoSat },
    }, supabase);

    const next = nextBillingDate(cliente.fecha_proxima_facturacion, cliente.periodicidad);
    await updateCliente(cliente.id, { fecha_proxima_facturacion: next }, supabase);
    await supabase.from('centinelia_clientes').update({ fecha_ultima_facturacion: hoy }).eq('id', cliente.id);
    console.log(`     Próxima factura: ${next}`);
  }
}

main().catch(err => {
  console.error('Unhandled:', err);
  process.exit(1);
});
