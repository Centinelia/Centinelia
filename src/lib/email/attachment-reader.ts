import { parseFileToText } from '@/lib/connectors/parse';
import { createAdminClient } from '@/lib/supabase/admin';
import type { EmailAttachmentMeta, EmailConnector } from '@/lib/connectors/types';
import { createHash } from 'node:crypto';

export const SUPPORTED_IMAGE_MIMES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'] as const;
export type SupportedImageMime = typeof SUPPORTED_IMAGE_MIMES[number];

/**
 * Attachment "pesado" subido a Storage con signed URL para que las tools
 * (ej. inv_importar_backlog) puedan descargarlo directamente. Resuelve el
 * problema de que la tool necesita un pdf_url http descargable pero el PDF
 * llegó como attachment binario del correo.
 *
 * Default policy: upload de PDF/XML (no imágenes — esas ya van via vision).
 * TTL de la signed URL: 2h (cubre toda la vida del loop del LLM).
 * TTL del objeto físico: ~7 días (lifecycle cleanup cron).
 */
export interface UploadedAttachment {
  /** Nombre original del attachment (ej. "AC PROYECTOS.pdf"). */
  name:         string;
  /** MIME type original. */
  mimeType:     string;
  /** Tamaño en bytes del buffer. */
  size:         number;
  /** URL firmada descargable (válida 2h). El LLM la pasa como pdf_url a tools. */
  download_url: string;
  /** Path dentro del bucket, para debugging/cleanup. */
  storage_path: string;
}

export interface ProcessedAttachments {
  /** Bloques de texto por documento parseado (PDF/DOCX/XLSX/TXT/CSV). Ya vienen truncados. */
  docTextBlocks: string[];
  /** Imágenes listas para pasar como contenido multimodal a Claude vision. */
  images: Array<{ name: string; base64: string; mimeType: SupportedImageMime }>;
  /** Attachments pesados subidos a Storage con signed URL para tools (ej. inv_importar_backlog). */
  uploads: UploadedAttachment[];
  /** Nombres de attachments que no pudimos leer (formato no soportado, error de fetch, etc). */
  skipped: string[];
}

const MAX_TEXT_CHARS  = 5000;
const MAX_FILE_BYTES  = 10 * 1024 * 1024; // 10MB por archivo
const MAX_TOTAL_BYTES = 25 * 1024 * 1024; // 25MB total por email

export const OPS_ATTACHMENTS_BUCKET  = 'ops-attachments';
const SIGNED_URL_TTL_SECONDS  = 2 * 60 * 60;  // 2 horas
// MIME types que se suben para que tools los descarguen vía http. Imágenes NO
// — esas van por vision multimodal (initialUserContent).
const UPLOADABLE_MIMES = [
  'application/pdf',
  'application/xml',
  'application/soap+xml',
  'text/xml',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
] as const;

/**
 * Sube el buffer a Supabase Storage. Retorna null si falla (fail-safe).
 *
 * Dos modos de pathing:
 *  - DEFAULT (fecha + hash): `{portal}/{yyyymmdd}/{hash}-{filename}` — documentos
 *    únicos (facturas CFDI, hojas de salida, OCs) que vale la pena retener para
 *    reprocesabilidad. Lifecycle cron limpia >7d.
 *  - OVERWRITE (opts.singleStateKey): `{portal}/{singleStateKey}-latest{ext}` —
 *    documentos que SIEMPRE representan "último estado" (ej. backlog TRANE
 *    semanal: la versión anterior queda obsoleta al llegar la nueva, no sirve
 *    retener). Nazre 2026-10-07: "no sirve guardar tantas versiones del
 *    backlog, siempre cambia".
 */
export async function uploadAttachmentToStorage(
  portalEmail: string | null,
  buffer: Buffer,
  filename: string,
  mimeType: string,
  opts: { singleStateKey?: string } = {},
): Promise<UploadedAttachment | null> {
  try {
    const supabase = createAdminClient();
    const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 100);
    const safePortal = (portalEmail ?? 'unknown').replace(/[^a-zA-Z0-9._-]/g, '_');
    let path: string;
    if (opts.singleStateKey) {
      // Overwrite siempre al mismo path. Mantiene extensión original para que
      // signed URL + content-type coincidan con el formato real.
      const ext = /\.[a-z0-9]{2,5}$/i.test(filename) ? filename.match(/\.[a-z0-9]{2,5}$/i)![0] : '';
      path = `${safePortal}/${opts.singleStateKey}-latest${ext}`;
    } else {
      const hash = createHash('sha256').update(buffer).digest('hex').slice(0, 16);
      const yyyymmdd = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      path = `${safePortal}/${yyyymmdd}/${hash}-${safeName}`;
    }

    const up = await supabase.storage.from(OPS_ATTACHMENTS_BUCKET).upload(path, buffer, {
      contentType: mimeType,
      upsert:      true,
    });
    if (up.error) {
      console.warn('[attachment-reader] upload failed:', up.error.message);
      return null;
    }
    const signed = await supabase.storage.from(OPS_ATTACHMENTS_BUCKET).createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
    if (signed.error || !signed.data?.signedUrl) {
      console.warn('[attachment-reader] signed URL failed:', signed.error?.message);
      return null;
    }
    return {
      name:         filename,
      mimeType,
      size:         buffer.length,
      download_url: signed.data.signedUrl,
      storage_path: path,
    };
  } catch (err) {
    console.warn('[attachment-reader] upload exception:', err);
    return null;
  }
}

/**
 * Detecta si un attachment debe ir al slot "last state" (overwrite siempre al
 * mismo path, sin acumulación). Hoy solo el backlog TRANE. Para agregar más:
 * subject keyword + mime check + devolver el key del slot.
 */
function detectSingleStateKey(subject: string | undefined, filename: string, mime: string): string | undefined {
  const subj = subject ?? '';
  if (mime === 'application/pdf' && (/\bbacklog\b/i.test(subj) || /backlog/i.test(filename))) {
    return 'backlog';
  }
  return undefined;
}

/**
 * Descarga y procesa los attachments de un correo entrante:
 * - Documentos (PDF/DOCX/XLSX/TXT/CSV) → texto parseado
 * - Imágenes soportadas → base64 para multimodal vision
 * - Todo lo demás → skipped
 *
 * Diseñado para tolerar fallos: un attachment corrupto NO rompe el batch.
 */
/**
 * Variante para chat del portal: los attachments ya están subidos a Storage
 * (con signed URL), así que fetcheamos por HTTP en vez de pedirle al
 * connector el buffer. Mismo output que processIncomingAttachments para que
 * el caller pueda tratar email y chat uniforme.
 *
 * Input: cada attachment ya trae download_url (del endpoint /chat-attachment).
 * Las imágenes se incluyen como vision block + los uploads mantienen la URL
 * para que el LLM la pase a tools como pdf_url/xml_url.
 */
export async function processChatAttachments(
  attachments: Array<{ name: string; mimeType: string; size: number; download_url: string }>,
): Promise<ProcessedAttachments> {
  const result: ProcessedAttachments = { docTextBlocks: [], images: [], uploads: [], skipped: [] };
  if (!attachments || attachments.length === 0) return result;

  for (const att of attachments) {
    try {
      const mime = (att.mimeType ?? 'application/octet-stream').split(';')[0].trim().toLowerCase();

      // Descargar el buffer desde la signed URL (ya está en nuestro bucket).
      const res = await fetch(att.download_url);
      if (!res.ok) { result.skipped.push(`${att.name} (fetch ${res.status})`); continue; }
      const buffer = Buffer.from(await res.arrayBuffer());

      if ((SUPPORTED_IMAGE_MIMES as readonly string[]).includes(mime)) {
        result.images.push({
          name:     att.name,
          base64:   buffer.toString('base64'),
          mimeType: mime as SupportedImageMime,
        });
        continue;
      }

      // Para PDF/XML/XLSX también exponemos la URL (el LLM puede pasarla
      // directo a tools como inv_importar_backlog). El text parseado va al
      // body para que el LLM "vea" el contenido además.
      if ((UPLOADABLE_MIMES as readonly string[]).includes(mime)) {
        result.uploads.push({
          name:         att.name,
          mimeType:     mime,
          size:         att.size,
          download_url: att.download_url,
          storage_path: '',  // en chat ya viene subido, path interno no relevante
        });
      }

      const text = await parseFileToText(buffer, mime);
      if (text.startsWith('[Formato no soportado') || text.startsWith('[No pude')) {
        result.skipped.push(`${att.name} (${mime})`);
        continue;
      }
      const truncated = text.length > MAX_TEXT_CHARS
        ? text.slice(0, MAX_TEXT_CHARS) + `\n[...truncado a ${MAX_TEXT_CHARS} chars]`
        : text;
      result.docTextBlocks.push(`### Adjunto: ${att.name}\n${truncated}`);
    } catch (err) {
      result.skipped.push(`${att.name} (error: ${err instanceof Error ? err.message : String(err)})`);
    }
  }

  return result;
}

export async function processIncomingAttachments(
  connector: EmailConnector,
  messageId: string,
  metas: EmailAttachmentMeta[],
  opts: { portalEmail?: string | null; subject?: string } = {},
): Promise<ProcessedAttachments> {
  const result: ProcessedAttachments = { docTextBlocks: [], images: [], uploads: [], skipped: [] };

  if (!connector.fetchAttachment) return result;
  if (metas.length === 0) return result;

  let bytesConsumed = 0;

  for (const meta of metas) {
    try {
      if (meta.size > MAX_FILE_BYTES) {
        result.skipped.push(`${meta.name} (${(meta.size / 1024 / 1024).toFixed(1)}MB > 10MB)`);
        continue;
      }
      if (bytesConsumed + meta.size > MAX_TOTAL_BYTES) {
        result.skipped.push(`${meta.name} (cuota 25MB agotada)`);
        continue;
      }

      const buffer = await connector.fetchAttachment(messageId, meta.id);
      if (!buffer) { result.skipped.push(`${meta.name} (fetch failed)`); continue; }
      bytesConsumed += buffer.length;

      const mime = meta.mimeType.split(';')[0].trim().toLowerCase();

      if ((SUPPORTED_IMAGE_MIMES as readonly string[]).includes(mime)) {
        result.images.push({
          name:     meta.name,
          base64:   buffer.toString('base64'),
          mimeType: mime as SupportedImageMime,
        });
        continue;
      }

      // 2026-10-07 Fix sistémico (bug backlog): tools como inv_importar_backlog
      // esperan pdf_url http descargable para procesar el binario (parser PDF
      // con password, XML parser, etc.). Cuando el PDF/XML viene como
      // attachment del correo, Nami no tiene URL — solo el nombre del archivo.
      // Fix: subir PDFs/XMLs a Supabase Storage con signed URL 2h para que las
      // tools los descarguen directo. Imágenes NO suben (van por vision).
      if ((UPLOADABLE_MIMES as readonly string[]).includes(mime)) {
        const singleStateKey = detectSingleStateKey(opts.subject, meta.name, mime);
        const uploaded = await uploadAttachmentToStorage(opts.portalEmail ?? null, buffer, meta.name, mime, { singleStateKey });
        if (uploaded) result.uploads.push(uploaded);
        // Siguen cayendo al parser de texto abajo (los dos usos no son exclusivos:
        // el LLM lee el text parseado + puede invocar tool con download_url si
        // la operación requiere el binario).
      }

      const text = await parseFileToText(buffer, mime);
      if (text.startsWith('[Formato no soportado') || text.startsWith('[No pude')) {
        result.skipped.push(`${meta.name} (${mime})`);
        continue;
      }
      const truncated = text.length > MAX_TEXT_CHARS
        ? text.slice(0, MAX_TEXT_CHARS) + `\n[...truncado a ${MAX_TEXT_CHARS} chars]`
        : text;
      result.docTextBlocks.push(`### Adjunto: ${meta.name}\n${truncated}`);
    } catch (err) {
      result.skipped.push(`${meta.name} (error: ${err instanceof Error ? err.message : String(err)})`);
    }
  }

  return result;
}
