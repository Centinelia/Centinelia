/**
 * Repositorio de facturas emitidas por Centinelia. Extension de la tabla
 * event-sourced centinelia_billing (ver nala-billing-cycle) con soporte para:
 *
 *   1. Metadata fiscal estructurada (subtotal, iva, metodo_pago_cfdi, uso_cfdi,
 *      forma_pago_cfdi) para poder filtrar "PPDs sin pago" o "PPDs sin REP" en
 *      SQL sin parsear el XML cada vez.
 *   2. Flow del REP (Complemento de Pago): paid_at + rep_reminder_at.
 *      Cuando Nazre marca una factura como pagada, el helper agenda un
 *      recordatorio a paid_at + 5 dias (SAT permite 10 del mes siguiente al
 *      pago, buffer de 5).
 *   3. Archivos XML + PDF viven en el bucket `centinelia-clientes-docs` bajo
 *      el prefix `{clienteId}/facturas/{uuid_fiscal}/` para que la "carpeta
 *      por cliente" sea un simple list del prefix.
 *
 * Los REPs se registran como rows tipo `rep_emitido` en la misma tabla, con
 * `related_uuid = uuid del Ingreso padre` (patron ya existente).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/admin';

const TABLE = 'centinelia_billing';
const BUCKET = 'centinelia-clientes-docs';

/** Buffer para agendar recordatorio del REP (dias despues del pago). */
export const REP_REMINDER_BUFFER_DAYS = 5;

export type FacturaKind = 'xml' | 'pdf' | 'rep_xml' | 'rep_pdf';

/** Path del archivo en el bucket. Agrupa por cliente y UUID fiscal. */
export function storageKeyForFactura(input: {
  clienteId:  string;
  uuidFiscal: string;
  kind:       FacturaKind;
}): string {
  const uuid = input.uuidFiscal.toLowerCase();
  const prefix = `${input.clienteId}/facturas/${uuid}`;
  switch (input.kind) {
    case 'xml':     return `${prefix}/factura.xml`;
    case 'pdf':     return `${prefix}/factura.pdf`;
    case 'rep_xml': return `${prefix}/rep.xml`;
    case 'rep_pdf': return `${prefix}/rep.pdf`;
  }
}

export interface RegistrarCfdiEmitidoInput {
  clienteId:   string;
  cfdiUuid:    string;
  cicloKey?:   string;
  monto:       number;
  subtotal:    number;
  iva:         number;
  metodoPago:  'PUE' | 'PPD';
  formaPago:   string;
  usoCfdi:     string;
  moneda?:     string;
  providerRef?: string;
  sentToEmail?: string;
}

export type RegistrarResult =
  | { ok: true; factura: { id: string; cliente_id: string; cfdi_uuid: string; metodo_pago_cfdi: string } }
  | { ok: false; code: 'insert_failed'; message: string };

export async function registrarCfdiEmitido(
  input:    RegistrarCfdiEmitidoInput,
  supabase: SupabaseClient = createAdminClient(),
): Promise<RegistrarResult> {
  const row = {
    cliente_id:       input.clienteId,
    tipo:             'cfdi_emitido' as const,
    ciclo_key:        input.cicloKey ?? null,
    cfdi_uuid:        input.cfdiUuid,
    provider_ref:     input.providerRef ?? null,
    monto:            input.monto,
    moneda:           input.moneda ?? 'MXN',
    subtotal:         input.subtotal,
    iva:              input.iva,
    metodo_pago_cfdi: input.metodoPago,
    forma_pago_cfdi:  input.formaPago,
    uso_cfdi:         input.usoCfdi,
    sent_to_email:    input.sentToEmail ?? null,
    sent_at:          input.sentToEmail ? new Date().toISOString() : null,
  };

  const { data, error } = await supabase
    .from(TABLE)
    .insert(row)
    .select()
    .single();
  if (error || !data) {
    return { ok: false, code: 'insert_failed', message: error?.message ?? 'insert returned no data' };
  }
  return { ok: true, factura: data as RegistrarResult extends { ok: true; factura: infer T } ? T : never };
}

export interface UploadFacturaFilesInput {
  billingId:   string;
  clienteId:   string;
  uuidFiscal:  string;
  xmlContent:  Buffer;
  pdfContent:  Buffer;
  variant?:    'ingreso' | 'rep';
}

export type UploadFacturaResult =
  | { ok: true; xmlPath: string; pdfPath: string }
  | { ok: false; code: 'storage_error' | 'db_error'; message: string };

export async function uploadFacturaFiles(
  input:    UploadFacturaFilesInput,
  supabase: SupabaseClient = createAdminClient(),
): Promise<UploadFacturaResult> {
  const variant = input.variant ?? 'ingreso';
  const xmlKind: FacturaKind = variant === 'rep' ? 'rep_xml' : 'xml';
  const pdfKind: FacturaKind = variant === 'rep' ? 'rep_pdf' : 'pdf';

  const xmlPath = storageKeyForFactura({ clienteId: input.clienteId, uuidFiscal: input.uuidFiscal, kind: xmlKind });
  const pdfPath = storageKeyForFactura({ clienteId: input.clienteId, uuidFiscal: input.uuidFiscal, kind: pdfKind });

  const uploadedPaths: string[] = [];

  const xmlUp = await supabase.storage.from(BUCKET).upload(xmlPath, input.xmlContent, {
    contentType: 'application/xml',
    upsert:      true,
  });
  if (xmlUp.error) {
    return { ok: false, code: 'storage_error', message: `xml upload: ${xmlUp.error.message}` };
  }
  uploadedPaths.push(xmlPath);

  const pdfUp = await supabase.storage.from(BUCKET).upload(pdfPath, input.pdfContent, {
    contentType: 'application/pdf',
    upsert:      true,
  });
  if (pdfUp.error) {
    await supabase.storage.from(BUCKET).remove(uploadedPaths).catch(() => {});
    return { ok: false, code: 'storage_error', message: `pdf upload: ${pdfUp.error.message}` };
  }
  uploadedPaths.push(pdfPath);

  const { error: updateErr } = await supabase
    .from(TABLE)
    .update({ xml_path: xmlPath, pdf_path: pdfPath })
    .eq('id', input.billingId)
    .select()
    .single();
  if (updateErr) {
    await supabase.storage.from(BUCKET).remove(uploadedPaths).catch(() => {});
    return { ok: false, code: 'db_error', message: updateErr.message };
  }

  return { ok: true, xmlPath, pdfPath };
}

export interface MarcarPagadaInput {
  billingId: string;
  paidAt?:   Date;
}

export type MarcarPagadaResult =
  | { ok: true; billingId: string; repReminderAt: string | null }
  | { ok: false; code: 'not_found' | 'not_applicable' | 'update_failed'; message: string };

/**
 * Marca una factura emitida como pagada. Si el CFDI era PPD, agenda el
 * recordatorio del REP a paid_at + REP_REMINDER_BUFFER_DAYS. Si era PUE no
 * necesita REP y no se agenda nada.
 */
export async function marcarFacturaPagada(
  input:    MarcarPagadaInput,
  supabase: SupabaseClient = createAdminClient(),
): Promise<MarcarPagadaResult> {
  const paidAt = input.paidAt ?? new Date();

  const { data: existing, error: fetchErr } = await supabase
    .from(TABLE)
    .select('id, tipo, metodo_pago_cfdi, paid_at')
    .eq('id', input.billingId)
    .single();
  if (fetchErr || !existing) {
    return { ok: false, code: 'not_found', message: fetchErr?.message ?? `factura ${input.billingId} no existe` };
  }

  const row = existing as { tipo: string; metodo_pago_cfdi: string | null };
  if (row.tipo !== 'cfdi_emitido') {
    return { ok: false, code: 'not_applicable', message: `tipo=${row.tipo}, solo cfdi_emitido puede marcarse pagada` };
  }

  const patch: Record<string, string | null> = { paid_at: paidAt.toISOString() };
  let repReminderAt: string | null = null;
  if (row.metodo_pago_cfdi === 'PPD') {
    const reminder = new Date(paidAt.getTime());
    reminder.setUTCDate(reminder.getUTCDate() + REP_REMINDER_BUFFER_DAYS);
    repReminderAt = reminder.toISOString();
    patch.rep_reminder_at = repReminderAt;
  }

  const { error: updateErr } = await supabase
    .from(TABLE)
    .update(patch)
    .eq('id', input.billingId)
    .select()
    .single();
  if (updateErr) {
    return { ok: false, code: 'update_failed', message: updateErr.message };
  }

  return { ok: true, billingId: input.billingId, repReminderAt };
}

export interface RegistrarRepEmitidoInput {
  clienteId:    string;
  repUuid:      string;
  ingresoUuid:  string;
  monto:        number;
  subtotal:     number;
  iva:          number;
  formaPago:    string;
  moneda?:      string;
  providerRef?: string;
  cicloKey?:    string;
}

export async function registrarRepEmitido(
  input:    RegistrarRepEmitidoInput,
  supabase: SupabaseClient = createAdminClient(),
): Promise<RegistrarResult> {
  const row = {
    cliente_id:      input.clienteId,
    tipo:            'rep_emitido' as const,
    ciclo_key:       input.cicloKey ?? null,
    cfdi_uuid:       input.repUuid,
    related_uuid:    input.ingresoUuid,
    provider_ref:    input.providerRef ?? null,
    monto:           input.monto,
    moneda:          input.moneda ?? 'MXN',
    subtotal:        input.subtotal,
    iva:             input.iva,
    forma_pago_cfdi: input.formaPago,
    uso_cfdi:        'CP01',
  };

  const { data, error } = await supabase
    .from(TABLE)
    .insert(row)
    .select()
    .single();
  if (error || !data) {
    return { ok: false, code: 'insert_failed', message: error?.message ?? 'insert returned no data' };
  }
  return { ok: true, factura: data as RegistrarResult extends { ok: true; factura: infer T } ? T : never };
}
