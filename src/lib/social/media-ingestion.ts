/**
 * Ingesta de media multimedia para empleados Navi / Navi Agencia.
 *
 * Solo se activa cuando el agente destino tiene role='navi' o 'navi_agencia'.
 * Descarga bytes desde el EmailConnector, sube al bucket 'user-media' y
 * registra la fila en user_media_uploads con una signed URL de 90 días.
 *
 * Tolerante a fallos: errores individuales de attachment se registran en
 * skipped[] sin interrumpir el resto del batch.
 */
import type { EmailConnector, EmailAttachmentMeta } from '@/lib/connectors/types';
import { createAdminClient } from '@/lib/supabase/admin';
import type { SupabaseClient } from '@supabase/supabase-js';

export interface NaviIngestionAgent {
  id:           string;
  role:         string | null;
  portal_email: string;
}

export interface NaviIngestionResult {
  ingested: number;
  skipped:  Array<{ name: string; reason: string }>;
}

/** Patrones de mime que se consideran media para Navi. */
const MEDIA_MIME_PATTERNS = [/^video\//, /^image\//];

/** Máximo de bytes permitidos por attachment antes de intentar descarga. */
const MAX_MEDIA_BYTES = 100 * 1024 * 1024; // 100 MB

/** Roles que activan la ingesta de media. */
const NAVI_ROLES = new Set(['navi', 'navi_agencia']);

/**
 * Informa si el mime dado es media (video o imagen).
 */
function isMediaMime(mimeType: string): boolean {
  return MEDIA_MIME_PATTERNS.some(p => p.test(mimeType));
}

/**
 * Sanitiza el nombre de archivo para usarlo como path en storage.
 * Elimina caracteres problemáticos y acota la longitud.
 */
export function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 200);
}

/**
 * Ingest media attachments de un correo hacia el bucket 'user-media'.
 *
 * @param connector EmailConnector con fetchAttachment implementado.
 * @param agent     Agente destino — debe tener role navi o navi_agencia.
 * @param msg       Mensaje recibido con metadatos de adjuntos.
 * @param supabase  Cliente de Supabase (inyectable para tests). Crea uno si no se provee.
 */
export async function ingestNaviMediaFromEmail(
  connector: EmailConnector,
  agent:     NaviIngestionAgent,
  msg: {
    id:           string;
    text?:        string;
    attachments?: EmailAttachmentMeta[];
  },
  supabase?: SupabaseClient,
): Promise<NaviIngestionResult> {
  // Solo Navi y Navi Agencia persisten media
  if (!NAVI_ROLES.has(agent.role ?? '')) {
    return { ingested: 0, skipped: [] };
  }

  const db = supabase ?? createAdminClient();
  const result: NaviIngestionResult = { ingested: 0, skipped: [] };
  const attachments = msg.attachments ?? [];

  for (const att of attachments) {
    const mime = att.mimeType.split(';')[0].trim().toLowerCase();

    // Filtrar silenciosamente los adjuntos que no son media (PDF, DOCX, etc.)
    if (!isMediaMime(mime)) continue;

    // Verificar límite de tamaño antes de descargar
    if (att.size > MAX_MEDIA_BYTES) {
      result.skipped.push({
        name:   att.name,
        reason: `El archivo supera el límite de ${MAX_MEDIA_BYTES / 1024 / 1024} MB (tamaño: ${(att.size / 1024 / 1024).toFixed(1)} MB)`,
      });
      continue;
    }

    // Descargar bytes del attachment
    let buffer: Buffer | null = null;
    try {
      buffer = connector.fetchAttachment
        ? await connector.fetchAttachment(msg.id, att.id)
        : null;
    } catch {
      buffer = null;
    }

    if (!buffer) {
      result.skipped.push({ name: att.name, reason: 'No se pudo descargar el archivo (fetch-failed)' });
      continue;
    }

    // Path en storage: portalEmail/agentId/timestamp-nombreSanitizado
    const storagePath = `${agent.portal_email}/${agent.id}/${Date.now()}-${sanitizeFilename(att.name)}`;

    const { error: uploadError } = await db.storage
      .from('user-media')
      .upload(storagePath, buffer, { contentType: mime });

    if (uploadError) {
      result.skipped.push({ name: att.name, reason: `Error al subir: ${uploadError.message}` });
      continue;
    }

    // Signed URL con vigencia de 90 días
    const ninetyDaysSeconds = 90 * 24 * 60 * 60; // 7 776 000 s
    const { data: signedData, error: signedError } = await db.storage
      .from('user-media')
      .createSignedUrl(storagePath, ninetyDaysSeconds);

    if (signedError || !signedData?.signedUrl) {
      result.skipped.push({ name: att.name, reason: 'No se pudo generar la URL firmada' });
      continue;
    }

    const expiresAt = new Date(Date.now() + ninetyDaysSeconds * 1000).toISOString();

    const { error: insertError } = await db.from('user_media_uploads').insert({
      portal_email:      agent.portal_email,
      agent_id:          agent.id,
      source:            'email',
      source_message_id: msg.id,
      file_url:          signedData.signedUrl,
      file_type:         mime,
      file_size_bytes:   buffer.length,
      status:            'available',
      expires_at:        expiresAt,
      // cliente_note: primeros 2000 caracteres del cuerpo del mensaje
      cliente_note:      msg.text ? msg.text.slice(0, 2000) : null,
      // duration_seconds y dimensions se dejan null hasta que un cron los pueble
    });

    if (insertError) {
      result.skipped.push({ name: att.name, reason: `Error al registrar en BD: ${insertError.message}` });
      continue;
    }

    result.ingested++;
  }

  return result;
}
