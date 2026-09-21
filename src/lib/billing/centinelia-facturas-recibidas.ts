/**
 * Repositorio de facturas RECIBIDAS por Centinelia (proveedor a Centinelia,
 * gastos deducibles). Tabla dedicada centinelia_facturas_recibidas: el emisor
 * (proveedor) no vive en centinelia_clientes, se guarda inline (rfc_emisor,
 * razon_social_emisor).
 *
 * Archivos XML+PDF viven en el bucket compartido `centinelia-clientes-docs`
 * bajo el prefix `recibidas/{id}/`, para que la exploracion de storage por
 * cliente (que hoy usa el prefix `{clienteId}/`) no se contamine.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/admin';
import { parseCfdiXml } from './centinelia-cfdi-parser';

const TABLE  = 'centinelia_facturas_recibidas';
const BUCKET = 'centinelia-clientes-docs';

export interface FacturaRecibida {
  id:                    string;
  rfc_emisor:            string;
  razon_social_emisor:   string;
  regimen_fiscal_emisor: string | null;
  uuid_fiscal:           string | null;
  serie:                 string | null;
  folio:                 string | null;
  fecha_emision:         string;
  tipo_comprobante:      'I' | 'E' | 'P' | 'N' | 'T';
  uso_cfdi:              string | null;
  metodo_pago:           'PUE' | 'PPD' | null;
  forma_pago:            string | null;
  moneda:                string;
  subtotal:              number;
  iva:                   number;
  total:                 number;
  xml_storage_path:      string | null;
  pdf_storage_path:      string | null;
  categoria_gasto:       string | null;
  deducible:             boolean;
  notas:                 string | null;
  uploaded_by:           string | null;
  created_at:            string;
  updated_at:            string;
}

export type RecibidaKind = 'xml' | 'pdf';

export function storageKeyForRecibida(input: { facturaId: string; kind: RecibidaKind }): string {
  return `recibidas/${input.facturaId}/factura.${input.kind}`;
}

export interface CreateFacturaRecibidaInput {
  xmlContent:     string;
  uploadedBy:     string;
  categoriaGasto?: string;
  deducible?:     boolean;
  notas?:         string;
}

export type CreateResult =
  | { ok: true; factura: FacturaRecibida }
  | { ok: false; code: 'xml_invalido' | 'insert_failed'; message: string };

export async function createFacturaRecibida(
  input:    CreateFacturaRecibidaInput,
  supabase: SupabaseClient = createAdminClient(),
): Promise<CreateResult> {
  const parsed = parseCfdiXml(input.xmlContent);
  if (!parsed.ok) {
    return { ok: false, code: 'xml_invalido', message: parsed.error };
  }

  const row = {
    rfc_emisor:            parsed.data.emisor.rfc,
    razon_social_emisor:   parsed.data.emisor.nombre,
    regimen_fiscal_emisor: parsed.data.emisor.regimenFiscal || null,
    uuid_fiscal:           parsed.data.uuid,
    serie:                 parsed.data.serie ?? null,
    folio:                 parsed.data.folio ?? null,
    fecha_emision:         parsed.data.fechaEmision,
    tipo_comprobante:      parsed.data.tipoComprobante,
    uso_cfdi:              parsed.data.receptor.usoCfdi || null,
    metodo_pago:           parsed.data.metodoPago,
    forma_pago:            parsed.data.formaPago || null,
    moneda:                parsed.data.moneda,
    subtotal:              parsed.data.subtotal,
    iva:                   parsed.data.iva,
    total:                 parsed.data.total,
    categoria_gasto:       input.categoriaGasto ?? null,
    deducible:             input.deducible ?? true,
    notas:                 input.notas ?? null,
    uploaded_by:           input.uploadedBy,
  };

  const { data, error } = await supabase
    .from(TABLE)
    .insert(row)
    .select()
    .single();
  if (error || !data) {
    return { ok: false, code: 'insert_failed', message: error?.message ?? 'insert returned no data' };
  }
  return { ok: true, factura: data as FacturaRecibida };
}

export interface UploadRecibidaInput {
  facturaId:  string;
  xmlContent: Buffer;
  pdfContent: Buffer;
}

export type UploadResult =
  | { ok: true; xmlPath: string; pdfPath: string }
  | { ok: false; code: 'storage_error' | 'db_error'; message: string };

export async function uploadRecibidaFiles(
  input:    UploadRecibidaInput,
  supabase: SupabaseClient = createAdminClient(),
): Promise<UploadResult> {
  const xmlPath = storageKeyForRecibida({ facturaId: input.facturaId, kind: 'xml' });
  const pdfPath = storageKeyForRecibida({ facturaId: input.facturaId, kind: 'pdf' });
  const uploadedPaths: string[] = [];

  const xmlUp = await supabase.storage.from(BUCKET).upload(xmlPath, input.xmlContent, {
    contentType: 'application/xml',
    upsert:      true,
  });
  if (xmlUp.error) {
    return { ok: false, code: 'storage_error', message: `xml: ${xmlUp.error.message}` };
  }
  uploadedPaths.push(xmlPath);

  const pdfUp = await supabase.storage.from(BUCKET).upload(pdfPath, input.pdfContent, {
    contentType: 'application/pdf',
    upsert:      true,
  });
  if (pdfUp.error) {
    await supabase.storage.from(BUCKET).remove(uploadedPaths).catch(() => {});
    return { ok: false, code: 'storage_error', message: `pdf: ${pdfUp.error.message}` };
  }
  uploadedPaths.push(pdfPath);

  const { error: updateErr } = await supabase
    .from(TABLE)
    .update({ xml_storage_path: xmlPath, pdf_storage_path: pdfPath })
    .eq('id', input.facturaId)
    .select()
    .single();
  if (updateErr) {
    await supabase.storage.from(BUCKET).remove(uploadedPaths).catch(() => {});
    return { ok: false, code: 'db_error', message: updateErr.message };
  }

  return { ok: true, xmlPath, pdfPath };
}

export interface UpdateInput {
  categoriaGasto?: string | null;
  deducible?:     boolean;
  notas?:         string | null;
}

export type UpdateResult =
  | { ok: true; factura: FacturaRecibida }
  | { ok: false; code: 'not_found' | 'update_failed'; message: string };

export async function updateFacturaRecibida(
  id:       string,
  patch:    UpdateInput,
  supabase: SupabaseClient = createAdminClient(),
): Promise<UpdateResult> {
  const dbPatch: Record<string, unknown> = {};
  if (patch.categoriaGasto !== undefined) dbPatch.categoria_gasto = patch.categoriaGasto;
  if (patch.deducible      !== undefined) dbPatch.deducible       = patch.deducible;
  if (patch.notas          !== undefined) dbPatch.notas           = patch.notas;

  const { data, error } = await supabase
    .from(TABLE)
    .update(dbPatch)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    const code = error.message.toLowerCase().includes('no rows') ? 'not_found' : 'update_failed';
    return { ok: false, code, message: error.message };
  }
  if (!data) return { ok: false, code: 'not_found', message: `factura ${id} no existe` };
  return { ok: true, factura: data as FacturaRecibida };
}

export type DeleteResult =
  | { ok: true; deletedId: string }
  | { ok: false; code: 'not_found' | 'db_error'; message: string };

export async function deleteFacturaRecibida(
  id:       string,
  supabase: SupabaseClient = createAdminClient(),
): Promise<DeleteResult> {
  const { data: existing, error: fetchErr } = await supabase
    .from(TABLE)
    .select('xml_storage_path, pdf_storage_path')
    .eq('id', id)
    .single();
  if (fetchErr || !existing) {
    return { ok: false, code: 'not_found', message: fetchErr?.message ?? `factura ${id} no existe` };
  }

  const paths: string[] = [];
  const row = existing as { xml_storage_path?: string | null; pdf_storage_path?: string | null };
  if (row.xml_storage_path) paths.push(row.xml_storage_path);
  if (row.pdf_storage_path) paths.push(row.pdf_storage_path);
  if (paths.length > 0) {
    await supabase.storage.from(BUCKET).remove(paths).catch(() => { /* best effort */ });
  }

  const { error: delErr } = await supabase.from(TABLE).delete().eq('id', id);
  if (delErr) return { ok: false, code: 'db_error', message: delErr.message };
  return { ok: true, deletedId: id };
}
