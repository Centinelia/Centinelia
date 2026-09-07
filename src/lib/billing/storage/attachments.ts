/**
 * Storage per-email de attachments para billing pipeline.
 *
 * Motivación: los tools LLM `extract_note_from_image` / `extract_remisiones_from_image`
 * requieren bytes de imagen. Sin este layer, `billing_incoming_emails` solo
 * guarda metadata y los bytes se pierden después del IMAP fetch → el LLM
 * hallucinaba base64 y las fotos nunca se procesaban. Descubierto dry run
 * FASE 4 (2026-09-07).
 *
 * Key scheme: `{email_id}/{index-padded}-{safe-filename}`
 *   - email_id: UUID del row de billing_incoming_emails
 *   - index padded: 00, 01, 02... para orden estable
 *   - safe filename: espacios → _, acentos → ASCII, max 100 chars
 *
 * Bucket: `billing-attachments` (privado, solo service_role).
 */
import { createAdminClient } from '@/lib/supabase/admin';

const BUCKET = 'billing-attachments';

export interface StoredAttachment {
  index:       number;
  filename:    string;
  contentType: string;
  size:        number;
  storageKey:  string;
}

/** Sanitiza filename: quita acentos, espacios → _, max 100 chars. Preserva ext. */
function safeFilename(name: string): string {
  const clean = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\w.-]/g, '_')
    .slice(0, 100);
  return clean || 'attachment';
}

function keyFor(emailId: string, index: number, filename: string): string {
  const idx = String(index).padStart(2, '0');
  return `${emailId}/${idx}-${safeFilename(filename)}`;
}

/**
 * Sube los N buffers de attachments para un email. Idempotente por email_id +
 * index (upsert). Retorna las keys guardadas para almacenar en attachments_meta.
 */
export async function uploadBillingAttachments(
  emailId: string,
  attachments: Array<{ filename: string; contentType: string; content: Buffer; size: number }>,
): Promise<StoredAttachment[]> {
  const supabase = createAdminClient();
  const out: StoredAttachment[] = [];
  for (let i = 0; i < attachments.length; i++) {
    const att = attachments[i];
    const key = keyFor(emailId, i, att.filename);
    const { error } = await supabase.storage.from(BUCKET).upload(key, att.content, {
      contentType: att.contentType,
      upsert:      true,
    });
    if (error) {
      throw new Error(`uploadBillingAttachments: ${error.message} (${key})`);
    }
    out.push({
      index:       i,
      filename:    att.filename,
      contentType: att.contentType,
      size:        att.size,
      storageKey:  key,
    });
  }
  return out;
}

/**
 * Carga buffers de attachments guardados previamente. Retorna en el mismo orden
 * que fueron subidos (por index). Skipea silenciosamente los que no encuentra
 * (logueando warning) — el pipeline puede seguir con lo que sí cargó.
 */
export async function loadBillingAttachments(
  storedList: Pick<StoredAttachment, 'index' | 'filename' | 'contentType' | 'storageKey'>[],
): Promise<Array<{ filename: string; contentType: string; buffer: Buffer }>> {
  const supabase = createAdminClient();
  const sorted = [...storedList].sort((a, b) => a.index - b.index);
  const out: Array<{ filename: string; contentType: string; buffer: Buffer }> = [];
  for (const meta of sorted) {
    const { data, error } = await supabase.storage.from(BUCKET).download(meta.storageKey);
    if (error || !data) {
      console.warn(`[billing/attachments] miss ${meta.storageKey}: ${error?.message ?? 'no data'}`);
      continue;
    }
    const arrBuf = await data.arrayBuffer();
    out.push({
      filename:    meta.filename,
      contentType: meta.contentType,
      buffer:      Buffer.from(arrBuf),
    });
  }
  return out;
}

/**
 * Borra todos los attachments de un email. Se llama al cerrar el ciclo
 * (job done + retention window pasado). No falla si no encuentra archivos.
 */
export async function deleteBillingAttachments(emailId: string): Promise<void> {
  const supabase = createAdminClient();
  const { data: list } = await supabase.storage.from(BUCKET).list(emailId);
  if (!list || list.length === 0) return;
  const keys = list.map(item => `${emailId}/${item.name}`);
  await supabase.storage.from(BUCKET).remove(keys);
}
