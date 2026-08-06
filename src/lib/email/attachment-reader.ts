import { parseFileToText } from '@/lib/connectors/parse';
import type { EmailAttachmentMeta, EmailConnector } from '@/lib/connectors/types';

export const SUPPORTED_IMAGE_MIMES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'] as const;
export type SupportedImageMime = typeof SUPPORTED_IMAGE_MIMES[number];

export interface ProcessedAttachments {
  /** Bloques de texto por documento parseado (PDF/DOCX/XLSX/TXT/CSV). Ya vienen truncados. */
  docTextBlocks: string[];
  /** Imágenes listas para pasar como contenido multimodal a Claude vision. */
  images: Array<{ name: string; base64: string; mimeType: SupportedImageMime }>;
  /** Nombres de attachments que no pudimos leer (formato no soportado, error de fetch, etc). */
  skipped: string[];
}

const MAX_TEXT_CHARS  = 5000;
const MAX_FILE_BYTES  = 10 * 1024 * 1024; // 10MB por archivo
const MAX_TOTAL_BYTES = 25 * 1024 * 1024; // 25MB total por email

/**
 * Descarga y procesa los attachments de un correo entrante:
 * - Documentos (PDF/DOCX/XLSX/TXT/CSV) → texto parseado
 * - Imágenes soportadas → base64 para multimodal vision
 * - Todo lo demás → skipped
 *
 * Diseñado para tolerar fallos: un attachment corrupto NO rompe el batch.
 */
export async function processIncomingAttachments(
  connector: EmailConnector,
  messageId: string,
  metas: EmailAttachmentMeta[],
): Promise<ProcessedAttachments> {
  const result: ProcessedAttachments = { docTextBlocks: [], images: [], skipped: [] };

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
