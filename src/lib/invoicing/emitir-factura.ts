// src/lib/invoicing/emitir-factura.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import { getCsd, decryptString } from './csd-vault';
import { evaluateGuardrails } from './guardrails';
import type { GuardrailLimits } from './guardrails';
import { solucionFactibleProvider } from './solucion-factible';
import { buildCfdiPdf } from './pdf-builder';
import { mapSfError } from './error-mapping';
import { isInvoicingDisabled } from './kill-switch';
import { sendEmail } from '@/lib/email/send';
import type { CfdiInput } from './provider';

export type EmitirOutcome =
  | { outcome: 'stamped'; uuid: string; xmlPath: string; pdfPath: string; folioCorto: string }
  | { outcome: 'failed'; error: string; retryable: false }
  | { outcome: 'retrying'; error: string };

export async function resolveInvoicingPath(
  orgEmail: string, supabase: SupabaseClient,
): Promise<'human' | 'auto'> {
  if (isInvoicingDisabled()) return 'human';
  const { data: org } = await supabase
    .from('organizations')
    .select('invoicing_provider, invoicing_csd_cer_path')
    .eq('portal_email', orgEmail)
    .single();
  if (!org?.invoicing_provider || !org.invoicing_csd_cer_path) return 'human';
  return 'auto';
}

export interface EmitirFacturaOptions {
  /** Cuando true, salta la evaluación de guardrails (uso exclusivo portal — humano ya autorizó). */
  bypassGuardrails?: boolean;
}

export async function emitirFacturaAuto(
  requestId: string, supabase: SupabaseClient, opts: EmitirFacturaOptions = {},
): Promise<EmitirOutcome> {
  const { data: req, error: reqErr } = await supabase
    .from('factura_requests')
    .select('*')
    .eq('id', requestId)
    .single();
  if (reqErr || !req) return { outcome: 'failed', error: 'request no encontrada', retryable: false };

  const { data: org } = await supabase
    .from('organizations')
    .select('*')
    .eq('portal_email', req.portal_email)
    .single();
  if (!org?.invoicing_provider) return { outcome: 'failed', error: 'org sin PAC', retryable: false };

  // Guardrails (skipped when bypassGuardrails=true — portal human override)
  if (!opts.bypassGuardrails) {
    const guard = await evaluateGuardrails(
      { total: req.total, uso_cfdi: req.uso_cfdi, cliente_rfc: req.cliente_rfc, portal_email: req.portal_email },
      (org.invoicing_limits ?? {
        monto_max_mxn: 100_000,
        blocked_uso_cfdi: [],
        max_stamps_per_day: 50,
        max_stamps_per_hour_per_rfc: 5,
      }) as GuardrailLimits,
      supabase,
    );
    if (!guard.pass) {
      await supabase.from('factura_requests').update({
        guardrail_reason: guard.reasons.join('; '),
      }).eq('id', requestId);
      return { outcome: 'failed', error: guard.reasons.join('; '), retryable: false };
    }
  }

  // Load CSD first (before incrementing stamp_attempts — no SF call yet)
  let csd: { cerPem: string; keyPem: string; noCertificado: string };
  try {
    const loaded = await getCsd(req.portal_email, supabase);
    if (!loaded) throw new Error('CSD no configurado');
    csd = loaded;
  } catch (e) {
    const msg = (e as Error).message;
    await supabase.from('factura_requests').update({
      status: 'stamp_failed', stamp_last_error: `CSD: ${msg}`, stamp_last_error_at: new Date().toISOString(),
    }).eq('id', requestId);
    return { outcome: 'failed', error: msg, retryable: false };
  }

  // Update to stamping (increment only after CSD confirmed)
  await supabase.from('factura_requests').update({
    status: 'stamping',
    stamp_attempts: (req.stamp_attempts ?? 0) + 1,
    provider: 'solucion_factible',
  }).eq('id', requestId);

  // Decrypt PAC creds
  const creds = JSON.parse(decryptString(org.invoicing_credentials_encrypted)) as { usuario: string; password: string };

  // I4 — guardrail: moneda != MXN requires tipoCambio
  const moneda = (req.currency ?? 'MXN') as string;
  const tipoCambio = req.tipo_cambio as number | undefined;
  if (moneda !== 'MXN' && !tipoCambio) {
    await supabase.from('factura_requests').update({
      guardrail_reason: 'currency_no_tipocambio',
    }).eq('id', requestId);
    return { outcome: 'failed', error: 'Moneda distinta a MXN requiere tipo_cambio', retryable: false };
  }

  // Build CFDI input
  const cfdi: CfdiInput = {
    emisor: {
      rfc: org.invoicing_rfc_emisor,
      regimenFiscal: org.invoicing_regimen_fiscal,
      nombre: org.invoicing_razon_social,
    },
    receptor: {
      rfc: req.cliente_rfc,
      nombre: req.cliente_nombre,
      usoCfdi: req.uso_cfdi,
      regimenFiscal: '616', // Sin obligaciones fiscales por default; ampliar si UI captura
      domicilioFiscal: req.cliente_direccion?.slice(0, 5) || org.invoicing_lugar_expedicion,
    },
    lugarExpedicion: org.invoicing_lugar_expedicion,
    formaPago: req.forma_pago,
    metodoPago: req.metodo_pago,
    moneda: moneda as 'MXN' | 'USD',
    tipoCambio,
    conceptos: (req.items as Array<{
      descripcion: string;
      cantidad: number;
      precio_unitario: number;
      clave_prodserv?: string;
      clave_unidad?: string;
    }>).map(i => ({
      claveProdServ: i.clave_prodserv ?? '01010101',
      claveUnidad: i.clave_unidad ?? 'E48',
      cantidad: i.cantidad,
      descripcion: i.descripcion,
      valorUnitario: i.precio_unitario,
      importe: +(i.cantidad * i.precio_unitario).toFixed(2),
      iva: req.iva > 0 ? +(i.cantidad * i.precio_unitario * 0.16).toFixed(2) : undefined,
    })),
    subtotal: req.subtotal, iva: req.iva, total: req.total,
    csd, pacCredentials: creds,
  };

  // Stamp
  const result = await solucionFactibleProvider.timbrar(cfdi, { testMode: org.invoicing_test_mode });

  if (!result.ok) {
    const info = mapSfError(result.code);
    await supabase.from('factura_requests').update({
      status: info.retryable ? 'stamping' : 'stamp_failed',
      stamp_last_error: `[${result.code}] ${result.message}`,
      stamp_last_error_at: new Date().toISOString(),
    }).eq('id', requestId);
    return info.retryable
      ? { outcome: 'retrying', error: result.message }
      : { outcome: 'failed', error: result.message, retryable: false };
  }

  // Upload to Storage (parallel; roll back to stamp_failed on any error)
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const base = `${req.portal_email}/${yyyy}/${mm}/${result.uuid}`;
  const xmlPath = `${base}.xml`;
  const pdfPath = `${base}.pdf`;
  const qrPath = `${base}.qr.png`;

  const pdfBuf = await buildCfdiPdf({
    emisor: { rfc: cfdi.emisor.rfc, nombre: cfdi.emisor.nombre, regimenFiscal: cfdi.emisor.regimenFiscal },
    receptor: { rfc: cfdi.receptor.rfc, nombre: cfdi.receptor.nombre, usoCfdi: cfdi.receptor.usoCfdi },
    conceptos: cfdi.conceptos.map(c => ({
      descripcion: c.descripcion,
      cantidad: c.cantidad,
      valorUnitario: c.valorUnitario,
      importe: c.importe,
    })),
    subtotal: req.subtotal, iva: req.iva, total: req.total,
    uuid: result.uuid, selloSat: result.selloSat, certificadoSat: result.certificadoSat,
    fechaTimbrado: result.fechaTimbrado, cadenaOriginal: result.cadenaOriginal, qrPng: result.qrPng,
  });

  const [xmlUp, qrUp, pdfUp] = await Promise.all([
    supabase.storage.from('cfdi').upload(xmlPath, result.xmlTimbrado, { contentType: 'application/xml', upsert: true }),
    supabase.storage.from('cfdi').upload(qrPath, result.qrPng, { contentType: 'image/png', upsert: true }),
    supabase.storage.from('cfdi').upload(pdfPath, pdfBuf, { contentType: 'application/pdf', upsert: true }),
  ]);

  const uploadErr = xmlUp.error ?? qrUp.error ?? pdfUp.error;
  if (uploadErr) {
    // SF already timbrated — log UUID for manual recovery; mark for infra-alerts via STORAGE: prefix
    console.error(`[emitirFacturaAuto] STORAGE upload failed uuid=${result.uuid}:`, uploadErr.message);
    await supabase.from('factura_requests').update({
      status: 'stamp_failed',
      stamp_last_error: `STORAGE: ${uploadErr.message} (uuid=${result.uuid})`,
      stamp_last_error_at: new Date().toISOString(),
    }).eq('id', requestId);
    return { outcome: 'failed', error: `Storage upload failed: ${uploadErr.message}`, retryable: false };
  }

  // Update request
  await supabase.from('factura_requests').update({
    status: 'stamped',
    uuid: result.uuid,
    sello_sat: result.selloSat,
    certificado_sat: result.certificadoSat,
    fecha_timbrado: result.fechaTimbrado,
    cadena_original: result.cadenaOriginal,
    xml_storage_path: xmlPath,
    pdf_storage_path: pdfPath,
    qr_storage_path: qrPath,
    stamp_last_error: null,
  }).eq('id', requestId);

  // Audit log
  if (req.agent_id) {
    await supabase.from('policy_audit_log').insert({
      agent_id: req.agent_id,
      capability: 'cfdi_timbrado',
      action: 'stamped',
      status: 'completed',
      details: {
        uuid: result.uuid,
        total: req.total,
        cliente_rfc: req.cliente_rfc,
        test_mode: org.invoicing_test_mode,
      },
    });
  }

  // Email al cliente (best effort)
  // sendEmail accepts content as base64 string — convert Buffers accordingly
  if (req.cliente_email) {
    void sendEmail({
      to: req.cliente_email,
      subject: `Tu factura · ${result.uuid.slice(-8)}`,
      html: `<p>Adjunto tu CFDI folio <strong>${result.uuid}</strong>.</p>`,
      from: `${org.invoicing_razon_social} <notificaciones@centinelia.mx>`,
      attachments: [
        { filename: `${result.uuid}.xml`, content: result.xmlTimbrado.toString('base64') },
        { filename: `${result.uuid}.pdf`, content: pdfBuf.toString('base64') },
      ],
    }).catch(err => console.error('[emitirFacturaAuto] email:', err));
  }

  return { outcome: 'stamped', uuid: result.uuid, xmlPath, pdfPath, folioCorto: result.uuid.slice(-8) };
}
