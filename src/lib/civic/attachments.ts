/**
 * Civic report attachments — upload y lectura desde Supabase Storage.
 *
 * Bucket: `civic-attachments` (privado). Cada archivo se guarda como
 *   {report_id}/{uuid}-{safe_filename}
 * Firmamos URLs por 24h cuando el portal las pide para render.
 */
import { createAdminClient } from '@/lib/supabase/admin';
import { randomUUID } from 'crypto';

type SupabaseClient = ReturnType<typeof createAdminClient>;

export const BUCKET = 'civic-attachments';

export const ALLOWED_MIME = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'image/gif',
]);

export const MAX_FILE_BYTES         = 8 * 1024 * 1024;   // 8 MB por archivo
export const MAX_ATTACHMENTS_PER_REPORT = 5;

function safeFileName(raw: string): string {
  const base = raw.split(/[\\/]/).pop() ?? 'file';
  return base
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .slice(-80);
}

export interface UploadArgs {
  reportId:    string;
  fileName:    string;
  mimeType:    string;
  bytes:       Buffer;
  ip?:         string | null;
  supabase:    SupabaseClient;
}

export interface UploadResult {
  ok:       boolean;
  error?:   string;
  id?:      string;
  path?:    string;
}

export async function uploadCivicAttachment(args: UploadArgs): Promise<UploadResult> {
  const { reportId, fileName, mimeType, bytes, ip, supabase } = args;

  if (!ALLOWED_MIME.has(mimeType)) return { ok: false, error: 'Formato no permitido. Solo imágenes JPG/PNG/WEBP/HEIC/GIF.' };
  if (bytes.length > MAX_FILE_BYTES) return { ok: false, error: `Archivo demasiado grande. Máximo ${MAX_FILE_BYTES / 1024 / 1024} MB.` };
  if (bytes.length === 0)          return { ok: false, error: 'Archivo vacío.' };

  const { count } = await supabase
    .from('civic_report_attachments')
    .select('id', { count: 'exact', head: true })
    .eq('report_id', reportId);
  if ((count ?? 0) >= MAX_ATTACHMENTS_PER_REPORT) {
    return { ok: false, error: `Máximo ${MAX_ATTACHMENTS_PER_REPORT} archivos por reporte.` };
  }

  const safe = safeFileName(fileName);
  const key  = `${reportId}/${randomUUID()}-${safe}`;
  const { error: upErr } = await supabase.storage.from(BUCKET).upload(key, bytes, {
    contentType: mimeType,
    upsert:      false,
  });
  if (upErr) return { ok: false, error: `Error subiendo archivo: ${upErr.message}` };

  const { data: row, error: rowErr } = await supabase.from('civic_report_attachments').insert({
    report_id:    reportId,
    storage_path: key,
    file_name:    safe,
    mime_type:    mimeType,
    size_bytes:   bytes.length,
    uploaded_ip:  ip ?? null,
  }).select('id').single();
  if (rowErr) {
    // Rollback storage upload on DB failure
    await supabase.storage.from(BUCKET).remove([key]).catch(() => { /* ignore */ });
    return { ok: false, error: `Error registrando adjunto: ${rowErr.message}` };
  }

  return { ok: true, id: row.id as string, path: key };
}

export interface AttachmentEntry {
  id:            string;
  file_name:     string;
  mime_type:     string;
  size_bytes:    number;
  uploaded_at:   string;
  signedUrl:     string;
}

export async function listCivicAttachments(reportId: string, supabase: SupabaseClient): Promise<AttachmentEntry[]> {
  const { data } = await supabase
    .from('civic_report_attachments')
    .select('id, storage_path, file_name, mime_type, size_bytes, uploaded_at')
    .eq('report_id', reportId)
    .order('uploaded_at', { ascending: true });
  if (!data?.length) return [];

  const paths = data.map(a => a.storage_path as string);
  const { data: signed } = await supabase.storage.from(BUCKET).createSignedUrls(paths, 24 * 60 * 60);
  const urlByPath = new Map<string, string>();
  for (const s of signed ?? []) if (s.path && s.signedUrl) urlByPath.set(s.path, s.signedUrl);

  return data.map(a => ({
    id:          a.id as string,
    file_name:   a.file_name as string,
    mime_type:   a.mime_type as string,
    size_bytes:  a.size_bytes as number,
    uploaded_at: a.uploaded_at as string,
    signedUrl:   urlByPath.get(a.storage_path as string) ?? '',
  }));
}

export async function findReportByFolio(folio: string, supabase: SupabaseClient) {
  const { data } = await supabase
    .from('civic_reports')
    .select('id, folio, agent_id, description, status')
    .eq('folio', folio.toUpperCase().trim())
    .maybeSingle();
  return data as { id: string; folio: string; agent_id: string; description: string | null; status: string } | null;
}
