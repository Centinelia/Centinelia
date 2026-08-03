/**
 * Public upload endpoint — ciudadano sube foto de su reporte identificándolo
 * por folio. Sin auth, con rate limit por IP y validación de folio + MIME.
 */
export const dynamic     = 'force-dynamic';
export const maxDuration = 30;

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { rateLimit, limiters } from '@/lib/ratelimit';
import { uploadCivicAttachment, findReportByFolio, ALLOWED_MIME, MAX_FILE_BYTES } from '@/lib/civic/attachments';

function callerIp(req: NextRequest): string | null {
  return req.headers.get('x-forwarded-for')?.split(',')[0].trim()
      ?? req.headers.get('x-real-ip')
      ?? null;
}

export async function POST(req: NextRequest) {
  const rl = await rateLimit(req, limiters.civicUpload);
  if (rl) return rl;

  const contentType = req.headers.get('content-type') ?? '';
  if (!contentType.startsWith('multipart/form-data')) {
    return NextResponse.json({ error: 'Content-Type debe ser multipart/form-data' }, { status: 400 });
  }

  let form: FormData;
  try { form = await req.formData(); }
  catch { return NextResponse.json({ error: 'Cuerpo inválido' }, { status: 400 }); }

  const folio = String(form.get('folio') ?? '').trim();
  const file  = form.get('file');
  if (!folio) return NextResponse.json({ error: 'Falta folio' }, { status: 400 });
  if (!(file instanceof File)) return NextResponse.json({ error: 'Falta archivo' }, { status: 400 });
  if (!ALLOWED_MIME.has(file.type)) return NextResponse.json({ error: 'Formato no permitido' }, { status: 400 });
  if (file.size > MAX_FILE_BYTES)   return NextResponse.json({ error: 'Archivo demasiado grande' }, { status: 413 });

  const supabase = createAdminClient();
  const report   = await findReportByFolio(folio, supabase);
  if (!report) return NextResponse.json({ error: 'Folio no encontrado' }, { status: 404 });

  const bytes = Buffer.from(await file.arrayBuffer());
  const result = await uploadCivicAttachment({
    reportId:  report.id,
    fileName:  file.name,
    mimeType:  file.type,
    bytes,
    ip:        callerIp(req),
    supabase,
  });

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ ok: true, id: result.id, folio: report.folio });
}
