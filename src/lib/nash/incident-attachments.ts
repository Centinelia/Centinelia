/**
 * Attachments para platform_incidents (screenshots que suben admin/meerkats a Nash).
 *
 * Bucket privado `incident-attachments`. Metadata vive en `platform_incidents.meta.attachments`
 * como `[{ storage_path, file_name, mime_type, size_bytes, uploaded_at }]`.
 *
 * Nash NO carga las imágenes en su loop (evita re-cobro de ~2k tokens/img por cada ciclo cron).
 * Solo pasa URLs firmadas a `enviar_a_claude_code`, donde Claude Code las inspecciona en el issue.
 */
import { createAdminClient } from '@/lib/supabase/admin';
import { randomUUID } from 'crypto';

type SupabaseClient = ReturnType<typeof createAdminClient>;

export const BUCKET = 'incident-attachments';

export const ALLOWED_MIME = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'image/gif',
]);

export const MAX_FILE_BYTES = 8 * 1024 * 1024;   // 8 MB
export const MAX_ATTACHMENTS = 5;
export const SIGNED_URL_TTL_PORTAL_SEC   = 24 * 60 * 60;         // 24h
export const SIGNED_URL_TTL_GH_ISSUE_SEC = 365 * 24 * 60 * 60;   // 1yr (GH issues persisten)

export interface StoredAttachment {
  storage_path: string;
  file_name:    string;
  mime_type:    string;
  size_bytes:   number;
  uploaded_at:  string;
}

export interface AttachmentInput {
  file_name: string;
  mime_type: string;
  /** Contenido en base64 (sin prefijo data:). */
  base64:    string;
}

function safeFileName(raw: string): string {
  const base = raw.split(/[\\/]/).pop() ?? 'file';
  return base.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-80);
}

export interface UploadArgs {
  scope:     string;          // ej: `incident/${id}` o `tool-call/${logId}`
  inputs:    AttachmentInput[];
  supabase:  SupabaseClient;
}

export interface UploadResult {
  ok:          boolean;
  error?:      string;
  attachments: StoredAttachment[];
}

export async function uploadIncidentAttachments(args: UploadArgs): Promise<UploadResult> {
  const { scope, inputs, supabase } = args;
  if (!inputs?.length) return { ok: true, attachments: [] };
  if (inputs.length > MAX_ATTACHMENTS) {
    return { ok: false, error: `Máximo ${MAX_ATTACHMENTS} imágenes por reporte.`, attachments: [] };
  }

  const stored: StoredAttachment[] = [];
  for (const inp of inputs) {
    if (!ALLOWED_MIME.has(inp.mime_type)) {
      return { ok: false, error: `Formato no permitido: ${inp.mime_type}. Solo JPG/PNG/WEBP/HEIC/GIF.`, attachments: stored };
    }
    let bytes: Buffer;
    try {
      bytes = Buffer.from(inp.base64, 'base64');
    } catch {
      return { ok: false, error: 'Base64 inválido.', attachments: stored };
    }
    if (bytes.length === 0) return { ok: false, error: 'Archivo vacío.', attachments: stored };
    if (bytes.length > MAX_FILE_BYTES) {
      return { ok: false, error: `Archivo mayor a ${MAX_FILE_BYTES / 1024 / 1024} MB.`, attachments: stored };
    }

    const safe = safeFileName(inp.file_name || 'screenshot.png');
    const key  = `${scope}/${randomUUID()}-${safe}`;
    const { error: upErr } = await supabase.storage.from(BUCKET).upload(key, bytes, {
      contentType: inp.mime_type,
      upsert:      false,
    });
    if (upErr) {
      return { ok: false, error: `Error subiendo ${safe}: ${upErr.message}`, attachments: stored };
    }
    stored.push({
      storage_path: key,
      file_name:    safe,
      mime_type:    inp.mime_type,
      size_bytes:   bytes.length,
      uploaded_at:  new Date().toISOString(),
    });
  }
  return { ok: true, attachments: stored };
}

export interface SignedAttachment extends StoredAttachment {
  signedUrl: string;
}

export async function signAttachments(
  atts:     StoredAttachment[],
  supabase: SupabaseClient,
  ttlSec:   number = SIGNED_URL_TTL_PORTAL_SEC,
): Promise<SignedAttachment[]> {
  if (!atts?.length) return [];
  const paths = atts.map(a => a.storage_path);
  const { data: signed } = await supabase.storage.from(BUCKET).createSignedUrls(paths, ttlSec);
  const urlByPath = new Map<string, string>();
  for (const s of signed ?? []) if (s.path && s.signedUrl) urlByPath.set(s.path, s.signedUrl);
  return atts.map(a => ({ ...a, signedUrl: urlByPath.get(a.storage_path) ?? '' }));
}

/** Type guard para leer attachments desde meta/input_json JSONB. */
export function parseStoredAttachments(raw: unknown): StoredAttachment[] {
  if (!Array.isArray(raw)) return [];
  const out: StoredAttachment[] = [];
  for (const r of raw) {
    if (!r || typeof r !== 'object') continue;
    const obj = r as Record<string, unknown>;
    if (typeof obj.storage_path !== 'string') continue;
    out.push({
      storage_path: obj.storage_path,
      file_name:    typeof obj.file_name === 'string' ? obj.file_name : 'file',
      mime_type:    typeof obj.mime_type === 'string' ? obj.mime_type : 'application/octet-stream',
      size_bytes:   typeof obj.size_bytes === 'number' ? obj.size_bytes : 0,
      uploaded_at:  typeof obj.uploaded_at === 'string' ? obj.uploaded_at : new Date(0).toISOString(),
    });
  }
  return out;
}
