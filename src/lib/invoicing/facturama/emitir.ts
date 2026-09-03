// Orchestrator Facturama: timbra + descarga XML/PDF + sube a Supabase Storage
// + envía por correo al receptor. Reemplaza el mega-show manual con una sola
// llamada de función. Sirve como base tanto para CLIs (nazre corre a mano)
// como para Nala meerkat (Fase 2, agente autónomo).
//
// Diferencia vs `emitir-factura.ts` del subsistema invoicing:
// - No requiere factura_requests row en DB (payload-driven)
// - Skip CSD vault (Facturama lo tiene server-side)
// - Storage upload opcional (permite dry-run local)
// - Email opcional
// - Devuelve todos los artefactos para debugging o guardado local

import type { SupabaseClient } from '@supabase/supabase-js';
import type { CfdiInput, PagoInput, StampResult } from '../provider';
import { facturamaProvider } from './index';
import { basicAuthHeader, facturamaFetchPdf } from './api-client';
import { sendEmail } from '@/lib/email/send';

/**
 * Sender custom para el correo del CFDI. Cuando se pasa, se usa en vez de
 * Resend (el default). Típicamente: Titan SMTP desde hola@centinelia.mx con
 * firma Nala para que aparezca como si Nala hubiera mandado el correo.
 * Debe retornar true si el envío fue exitoso.
 */
export type CfdiSender = (input: {
  to: string;
  subject: string;
  html: string;
  attachments: Array<{ filename: string; content: Buffer; contentType: string }>;
}) => Promise<boolean>;

export interface EmitirOpts {
  testMode: boolean;
  timeoutMs?: number;
  supabase?: SupabaseClient;
  storageBucket?: string;
  storagePrefix?: string;
  sendToEmail?: string;
  emailSubject?: string;
  emailBody?: string;
  emailFrom?: string;
  /** Sender custom. Si se omite, cae a Resend con from=emailFrom o default. */
  sender?: CfdiSender;
}

export interface EmitirResult {
  ok: true;
  uuid: string;
  fechaTimbrado: string;
  selloSat: string;
  certificadoSat: string;
  xml: Buffer;
  pdf: Buffer | null;
  qr: Buffer;
  storagePaths?: { xml: string; pdf: string; qr: string };
  emailSent?: boolean;
}

export interface EmitirFailure {
  ok: false;
  code: number;
  message: string;
  retryable: boolean;
}

async function fetchPdfFromFacturama(
  stamp: StampResult, creds: { usuario: string; password: string }, opts: EmitirOpts,
): Promise<Buffer | null> {
  if (!stamp.ok || !stamp.providerRef) return null;
  const auth = basicAuthHeader(creds.usuario, creds.password);
  try {
    return await facturamaFetchPdf(stamp.providerRef, auth, opts.testMode, opts.timeoutMs ?? 30000);
  } catch {
    return null;
  }
}

async function uploadToStorage(
  supabase: SupabaseClient, bucket: string, prefix: string, uuid: string,
  files: { xml: Buffer; pdf: Buffer | null; qr: Buffer },
): Promise<{ xml: string; pdf: string; qr: string }> {
  const xmlPath = `${prefix}/${uuid}.xml`;
  const qrPath  = `${prefix}/${uuid}.qr.png`;
  const pdfPath = `${prefix}/${uuid}.pdf`;
  const CACHE_1Y = '31536000, immutable';

  const uploads: Promise<unknown>[] = [
    supabase.storage.from(bucket).upload(xmlPath, files.xml, {
      contentType: 'application/xml', upsert: true, cacheControl: CACHE_1Y,
    }),
    supabase.storage.from(bucket).upload(qrPath, files.qr, {
      contentType: 'image/png', upsert: true, cacheControl: CACHE_1Y,
    }),
  ];
  if (files.pdf) {
    uploads.push(
      supabase.storage.from(bucket).upload(pdfPath, files.pdf, {
        contentType: 'application/pdf', upsert: true, cacheControl: CACHE_1Y,
      }),
    );
  }
  await Promise.all(uploads);
  return { xml: xmlPath, pdf: files.pdf ? pdfPath : '', qr: qrPath };
}

function fmtMoney(n: number): string {
  return `$${n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MXN`;
}

async function deliverByEmail(
  to: string, subject: string, html: string, from: string | undefined,
  uuid: string, xml: Buffer, pdf: Buffer | null,
  sender?: CfdiSender,
): Promise<boolean> {
  if (sender) {
    // Sender custom (típicamente Titan SMTP desde hola@centinelia.mx con firma Nala)
    const attachments: Array<{ filename: string; content: Buffer; contentType: string }> = [
      { filename: `${uuid}.xml`, content: xml, contentType: 'application/xml' },
    ];
    if (pdf) attachments.push({ filename: `${uuid}.pdf`, content: pdf, contentType: 'application/pdf' });
    return sender({ to, subject, html, attachments });
  }
  // Fallback Resend
  const attachments = [{ filename: `${uuid}.xml`, content: xml.toString('base64') }];
  if (pdf) attachments.push({ filename: `${uuid}.pdf`, content: pdf.toString('base64') });
  return sendEmail({ to, subject, html, from, attachments });
}

function defaultEmailBody(uuid: string, tipo: 'CFDI' | 'REP', total: number, emisorNombre: string, hasCustomSender: boolean, relatedUuid?: string): string {
  // Cuerpo cálido con personalidad Nala. Concreto, útil, sin frases genéricas
  // tipo "cualquier duda respondemos por este mismo correo" (que suena a
  // plantilla). El cliente ya sabe que puede responder — no hay que decirlo.
  const cuerpo = tipo === 'CFDI'
    ? `<p>Hola,</p>
<p>Aquí va tu factura por <strong>${fmtMoney(total)}</strong>. Adjunto el XML y el PDF para que puedas cargarla en tu contabilidad.</p>
<p>Cuando programes el pago, mándame el comprobante SPEI a este mismo correo y te emito el complemento al momento.</p>
<p><span style="color:#8C7FB8;font-size:11px">UUID: <code>${uuid}</code></span></p>`
    : `<p>Hola,</p>
<p>Ya llegó tu pago, gracias. Aquí va el complemento por <strong>${fmtMoney(total)}</strong>${relatedUuid ? ` correspondiente a la factura <code>...${relatedUuid.slice(-8)}</code>` : ''}. Con esto ya queda cerrado el ciclo.</p>
<p>Nos vemos en el próximo corte.</p>
<p><span style="color:#8C7FB8;font-size:11px">UUID: <code>${uuid}</code></span></p>`;

  // Solo agregamos firma emisor cuando NO hay sender custom (Resend fallback).
  // Cuando hay sender custom (Titan+Nala), el sender agrega su propia firma.
  if (hasCustomSender) return cuerpo;
  return `${cuerpo}\n<p>Saludos,<br/>${emisorNombre}</p>`;
}

export async function emitirIngresoFacturama(
  cfdi: CfdiInput, opts: EmitirOpts,
): Promise<EmitirResult | EmitirFailure> {
  const stamp = await facturamaProvider.timbrar(cfdi, { testMode: opts.testMode, timeoutMs: opts.timeoutMs });
  if (!stamp.ok) return { ok: false, code: stamp.code, message: stamp.message, retryable: stamp.retryable };

  const pdf = await fetchPdfFromFacturama(stamp, cfdi.pacCredentials, opts);

  let storagePaths: { xml: string; pdf: string; qr: string } | undefined;
  if (opts.supabase && opts.storageBucket) {
    const prefix = opts.storagePrefix ?? `${cfdi.emisor.rfc}/${new Date().getUTCFullYear()}/${String(new Date().getUTCMonth() + 1).padStart(2, '0')}`;
    storagePaths = await uploadToStorage(opts.supabase, opts.storageBucket, prefix, stamp.uuid, {
      xml: stamp.xmlTimbrado, pdf, qr: stamp.qrPng,
    });
  }

  let emailSent: boolean | undefined;
  if (opts.sendToEmail) {
    const subject = opts.emailSubject ?? `Factura CFDI - ${stamp.uuid.slice(-8)} - ${fmtMoney(cfdi.total)}`;
    const html = opts.emailBody ?? defaultEmailBody(stamp.uuid, 'CFDI', cfdi.total, cfdi.emisor.nombre, !!opts.sender);
    emailSent = await deliverByEmail(opts.sendToEmail, subject, html, opts.emailFrom, stamp.uuid, stamp.xmlTimbrado, pdf, opts.sender);
  }

  return {
    ok: true,
    uuid: stamp.uuid,
    fechaTimbrado: stamp.fechaTimbrado,
    selloSat: stamp.selloSat,
    certificadoSat: stamp.certificadoSat,
    xml: stamp.xmlTimbrado,
    pdf,
    qr: stamp.qrPng,
    storagePaths,
    emailSent,
  };
}

export async function emitirPagoFacturama(
  pago: PagoInput, opts: EmitirOpts,
): Promise<EmitirResult | EmitirFailure> {
  const stamp = await facturamaProvider.timbrarPago(pago, { testMode: opts.testMode, timeoutMs: opts.timeoutMs });
  if (!stamp.ok) return { ok: false, code: stamp.code, message: stamp.message, retryable: stamp.retryable };

  const pdf = await fetchPdfFromFacturama(stamp, pago.pacCredentials, opts);

  let storagePaths: { xml: string; pdf: string; qr: string } | undefined;
  if (opts.supabase && opts.storageBucket) {
    const prefix = opts.storagePrefix ?? `${pago.emisor.rfc}/${new Date().getUTCFullYear()}/${String(new Date().getUTCMonth() + 1).padStart(2, '0')}`;
    storagePaths = await uploadToStorage(opts.supabase, opts.storageBucket, prefix, stamp.uuid, {
      xml: stamp.xmlTimbrado, pdf, qr: stamp.qrPng,
    });
  }

  let emailSent: boolean | undefined;
  if (opts.sendToEmail) {
    const subject = opts.emailSubject ?? `Complemento de Pago - ${stamp.uuid.slice(-8)} - ${fmtMoney(pago.pago.monto)}`;
    const html = opts.emailBody ?? defaultEmailBody(stamp.uuid, 'REP', pago.pago.monto, pago.emisor.nombre, !!opts.sender, pago.pago.documentosRelacionados[0]?.uuid);
    emailSent = await deliverByEmail(opts.sendToEmail, subject, html, opts.emailFrom, stamp.uuid, stamp.xmlTimbrado, pdf, opts.sender);
  }

  return {
    ok: true,
    uuid: stamp.uuid,
    fechaTimbrado: stamp.fechaTimbrado,
    selloSat: stamp.selloSat,
    certificadoSat: stamp.certificadoSat,
    xml: stamp.xmlTimbrado,
    pdf,
    qr: stamp.qrPng,
    storagePaths,
    emailSent,
  };
}
