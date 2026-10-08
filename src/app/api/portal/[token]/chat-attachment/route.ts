import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { uploadAttachmentToStorage } from '@/lib/email/attachment-reader';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

// Límites iguales al pipeline email para consistencia.
const MAX_FILE_BYTES = 10 * 1024 * 1024;  // 10MB por archivo
const MAX_TOTAL_BYTES = 25 * 1024 * 1024; // 25MB por mensaje

const ALLOWED_MIMES = new Set([
  // Imágenes (vision multimodal)
  'image/jpeg', 'image/png', 'image/gif', 'image/webp',
  // Documentos
  'application/pdf',
  'application/xml', 'text/xml', 'application/soap+xml',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',       // xlsx
  'application/vnd.ms-excel',                                                 // xls
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',  // docx
  'application/msword',                                                       // doc
  'text/plain', 'text/csv', 'text/html', 'text/markdown',
  'application/json',
]);

/**
 * Sube uno o varios attachments para una sesión de chat del portal. Cada
 * archivo se sube a Supabase Storage (bucket ops-attachments) con signed URL
 * 2h — igual que el pipeline de email. El cliente luego envía el mensaje de
 * chat con los metadata para que el LLM los procese.
 *
 * Nazre 2026-10-07: habilitar upload de files por chat para TODOS los
 * empleados. Soporta todos los tipos que acepta el pipeline email.
 *
 * Request: multipart/form-data con field "files" (puede repetirse).
 * Response: { ok: true, attachments: [{ name, mimeType, size, download_url }] }
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!token) return NextResponse.json({ error: 'missing_token' }, { status: 400 });

  // Verificar que el token corresponde a un agente activo (gating simple).
  const supabase = createAdminClient();
  const { data: agent } = await supabase
    .from('voice_agents')
    .select('id, portal_email, active')
    .eq('portal_token', token)
    .maybeSingle();
  if (!agent || !(agent as { active: boolean }).active) {
    return NextResponse.json({ error: 'invalid_token' }, { status: 401 });
  }
  const portalEmail = (agent as { portal_email: string | null }).portal_email;

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch (err) {
    return NextResponse.json({ error: 'invalid_form_data', detail: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }

  const files = formData.getAll('files').filter((f): f is File => f instanceof File);
  if (files.length === 0) return NextResponse.json({ error: 'no_files' }, { status: 400 });

  const uploaded: Array<{ name: string; mimeType: string; size: number; download_url: string }> = [];
  const rejected: Array<{ name: string; reason: string }> = [];
  let totalBytes = 0;

  for (const file of files) {
    const mime = (file.type || 'application/octet-stream').toLowerCase().split(';')[0].trim();
    if (!ALLOWED_MIMES.has(mime)) {
      rejected.push({ name: file.name, reason: `tipo no permitido (${mime})` });
      continue;
    }
    if (file.size > MAX_FILE_BYTES) {
      rejected.push({ name: file.name, reason: `tamaño ${(file.size / 1024 / 1024).toFixed(1)}MB > 10MB` });
      continue;
    }
    if (totalBytes + file.size > MAX_TOTAL_BYTES) {
      rejected.push({ name: file.name, reason: 'cuota 25MB agotada' });
      continue;
    }
    totalBytes += file.size;

    const buffer = Buffer.from(await file.arrayBuffer());
    const result = await uploadAttachmentToStorage(portalEmail, buffer, file.name, mime);
    if (!result) {
      rejected.push({ name: file.name, reason: 'fallo al subir a Storage' });
      continue;
    }
    uploaded.push({
      name:         result.name,
      mimeType:     result.mimeType,
      size:         result.size,
      download_url: result.download_url,
    });
  }

  return NextResponse.json({ ok: true, attachments: uploaded, rejected });
}
