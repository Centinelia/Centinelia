/**
 * Storage helper para docs de clientes de Centinelia.
 *
 * Cada cliente en `centinelia_clientes` puede tener docs (CSF PDF, contrato,
 * comprobantes de pago, poderes) subidos al bucket privado
 * `centinelia-clientes-docs`. La metadata vive en la columna JSONB `docs` de
 * la misma tabla; los bytes viven en Storage.
 *
 * Key scheme: `{cliente_id}/{doc_id}-{safe_filename}`
 *   - cliente_id: UUID del row (permite RLS per-cliente si algun dia se abre
 *     a self-service; hoy todo pasa por API admin)
 *   - doc_id: UUID nuevo por doc (permite reemplazos sin sobreescribir path)
 *   - safe filename: espacios → _, acentos → ASCII, max 100 chars, preserva ext
 *
 * Los archivos son privados. Para descargar, la UI pide un signed URL via
 * getClienteDocSignedUrl (TTL 1 hora).
 */
import { randomUUID } from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/admin';
import type { ClienteDoc, DocTipo } from './centinelia-clientes';

const BUCKET = 'centinelia-clientes-docs';

/** 10 MB por archivo. Match el file_size_limit del bucket. */
export const MAX_DOC_BYTES = 10 * 1024 * 1024;

/** Tipos MIME aceptados. Match el allowed_mime_types del bucket. */
export const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
] as const;

export const DOC_TIPOS: readonly DocTipo[] = [
  'csf', 'contrato', 'comprobante_pago', 'poder_notarial', 'otro',
];

/** Sanitiza filename: acentos → ASCII, chars no seguros → _, max 100. */
export function safeFilename(name: string): string {
  const clean = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\w.-]/g, '_')
    .slice(0, 100);
  return clean || 'documento';
}

export function storageKeyFor(clienteId: string, docId: string, filename: string): string {
  return `${clienteId}/${docId}-${safeFilename(filename)}`;
}

export interface UploadClienteDocInput {
  clienteId:    string;
  tipo:         DocTipo;
  label:        string;
  filename:     string;
  contentType:  string;
  content:      Buffer;
  uploadedBy?:  string;
}

export interface UploadResult {
  ok:    true;
  doc:   ClienteDoc;
}

export interface UploadError {
  ok:      false;
  code:    'invalid_mime' | 'too_large' | 'storage_error' | 'db_error';
  message: string;
}

/**
 * Sube un archivo al bucket y agrega su metadata al JSONB `docs` del cliente.
 *
 * Validaciones (fallar rapido):
 *   - contentType debe estar en ALLOWED_MIME_TYPES
 *   - size <= MAX_DOC_BYTES
 *
 * Si el upload al storage falla, la DB no se toca. Si el update del JSONB
 * falla, se intenta borrar el archivo del storage (best effort) para no dejar
 * bytes huerfanos.
 */
export async function uploadClienteDoc(
  input: UploadClienteDocInput,
  supabase: SupabaseClient = createAdminClient(),
): Promise<UploadResult | UploadError> {
  if (!(ALLOWED_MIME_TYPES as readonly string[]).includes(input.contentType)) {
    return {
      ok: false, code: 'invalid_mime',
      message: `MIME "${input.contentType}" no aceptado. Permitidos: ${ALLOWED_MIME_TYPES.join(', ')}`,
    };
  }
  if (input.content.byteLength > MAX_DOC_BYTES) {
    return {
      ok: false, code: 'too_large',
      message: `Archivo ${input.content.byteLength} bytes excede el maximo ${MAX_DOC_BYTES}`,
    };
  }

  const docId = randomUUID();
  const storagePath = storageKeyFor(input.clienteId, docId, input.filename);

  const uploadRes = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, input.content, {
      contentType: input.contentType,
      upsert:      false,
    });
  if (uploadRes.error) {
    return { ok: false, code: 'storage_error', message: uploadRes.error.message };
  }

  const doc: ClienteDoc = {
    id:           docId,
    tipo:         input.tipo,
    label:        input.label,
    storage_path: storagePath,
    mime_type:    input.contentType,
    size_bytes:   input.content.byteLength,
    uploaded_at:  new Date().toISOString(),
    ...(input.uploadedBy ? { uploaded_by: input.uploadedBy } : {}),
  };

  const { data: existing, error: fetchErr } = await supabase
    .from('centinelia_clientes')
    .select('docs')
    .eq('id', input.clienteId)
    .single();
  if (fetchErr) {
    await supabase.storage.from(BUCKET).remove([storagePath]).catch(() => {});
    return { ok: false, code: 'db_error', message: fetchErr.message };
  }

  const nextDocs = [ ...((existing?.docs as ClienteDoc[] | null) ?? []), doc ];
  const { error: updateErr } = await supabase
    .from('centinelia_clientes')
    .update({ docs: nextDocs })
    .eq('id', input.clienteId);
  if (updateErr) {
    await supabase.storage.from(BUCKET).remove([storagePath]).catch(() => {});
    return { ok: false, code: 'db_error', message: updateErr.message };
  }

  return { ok: true, doc };
}

export interface DeleteResult {
  ok:      true;
  deleted: ClienteDoc;
}

export interface DeleteError {
  ok:      false;
  code:    'not_found' | 'storage_error' | 'db_error';
  message: string;
}

/**
 * Quita un doc del array `docs` del cliente y borra el archivo del storage.
 * Si el archivo no existe en storage, el borrado del array sigue adelante
 * (best effort — el estado inconsistente ya existia, no lo empeoramos).
 */
export async function deleteClienteDoc(
  clienteId: string,
  docId:     string,
  supabase:  SupabaseClient = createAdminClient(),
): Promise<DeleteResult | DeleteError> {
  const { data: cliente, error: fetchErr } = await supabase
    .from('centinelia_clientes')
    .select('docs')
    .eq('id', clienteId)
    .single();
  if (fetchErr) return { ok: false, code: 'db_error', message: fetchErr.message };

  const docs = (cliente?.docs as ClienteDoc[] | null) ?? [];
  const target = docs.find(d => d.id === docId);
  if (!target) return { ok: false, code: 'not_found', message: `doc ${docId} no existe en cliente ${clienteId}` };

  await supabase.storage.from(BUCKET).remove([target.storage_path]).catch(() => { /* best effort */ });

  const nextDocs = docs.filter(d => d.id !== docId);
  const { error: updateErr } = await supabase
    .from('centinelia_clientes')
    .update({ docs: nextDocs })
    .eq('id', clienteId);
  if (updateErr) return { ok: false, code: 'db_error', message: updateErr.message };

  return { ok: true, deleted: target };
}

/**
 * Genera signed URL temporal para descarga del archivo. TTL default 1 hora.
 * No revela el archivo publicamente — solo quien recibe la URL puede acceder,
 * y solo mientras dura el TTL.
 */
export async function getClienteDocSignedUrl(
  clienteId: string,
  docId:     string,
  ttlSeconds = 3600,
  supabase:  SupabaseClient = createAdminClient(),
): Promise<{ ok: true; url: string; expiresAt: string } | { ok: false; code: 'not_found' | 'storage_error'; message: string }> {
  const { data: cliente, error: fetchErr } = await supabase
    .from('centinelia_clientes')
    .select('docs')
    .eq('id', clienteId)
    .single();
  if (fetchErr) return { ok: false, code: 'not_found', message: fetchErr.message };

  const docs = (cliente?.docs as ClienteDoc[] | null) ?? [];
  const target = docs.find(d => d.id === docId);
  if (!target) return { ok: false, code: 'not_found', message: `doc ${docId} no existe en cliente ${clienteId}` };

  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(target.storage_path, ttlSeconds);
  if (error || !data) return { ok: false, code: 'storage_error', message: error?.message ?? 'no url returned' };

  const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();
  return { ok: true, url: data.signedUrl, expiresAt };
}
