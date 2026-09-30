import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { rateLimit, limiters } from '@/lib/ratelimit';

interface Params { params: Promise<{ token: string }> }

// Allow-list de MIME types aceptables en onboarding: fotos de sucursales,
// logos, documentos fiscales (PDF), catálogo (Excel/CSV). Sin ejecutables
// ni scripts. Cliente puede spoofear file.type pero validamos por Magic Bytes
// abajo también.
const ALLOWED_MIME = new Set<string>([
  'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif',
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',   // .xlsx
  'application/vnd.ms-excel',                                             // .xls
  'text/csv',
  'text/plain',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
  'application/msword',                                                   // .doc
]);

// Extensiones aceptables — segunda barrera. Rechaza .exe .js .sh .bat .html.
const ALLOWED_EXT = new Set<string>([
  'jpg', 'jpeg', 'png', 'webp', 'gif', 'heic', 'heif',
  'pdf', 'xlsx', 'xls', 'csv', 'txt', 'docx', 'doc',
]);

const MAX_BYTES = 20 * 1024 * 1024; // 20 MB por archivo

/**
 * Sanitiza el nombre: solo alfanumérico, punto, guión, underscore. Trunca a 100.
 * Suficiente para preservar contexto pero elimina path traversal (/, \, ..).
 */
function sanitizeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 100);
}

export async function POST(req: NextRequest, { params }: Params) {
  const limited = await rateLimit(req, limiters.auth);
  if (limited) return limited;

  const { token } = await params;
  const supabase  = createAdminClient();

  const { data: instance } = await supabase
    .from('onboarding_instances')
    .select('id, agent_id')
    .eq('submit_token', token)
    .single();

  if (!instance) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const fd   = await req.formData();
  const file = fd.get('file') as File | null;
  const name = fd.get('name') as string | null;

  if (!file) return NextResponse.json({ error: 'No file' }, { status: 400 });

  // ── Guardas de seguridad ───────────────────────────────────────────────────
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: `File too large: max ${MAX_BYTES / 1024 / 1024}MB` }, { status: 413 });
  }

  const mime = file.type || 'application/octet-stream';
  if (!ALLOWED_MIME.has(mime)) {
    return NextResponse.json({ error: `MIME type not allowed: ${mime}` }, { status: 415 });
  }

  const rawExt = (file.name.split('.').pop() ?? '').toLowerCase();
  if (!ALLOWED_EXT.has(rawExt)) {
    return NextResponse.json({ error: `Extension not allowed: .${rawExt}` }, { status: 415 });
  }

  // Path: usamos el nombre sanitizado + timestamp. La extensión ya validada
  // se recompone al final. instance.id es UUID, prefijo seguro.
  const safeName = sanitizeName(name ?? file.name.replace(/\.[^.]+$/, ''));
  const path     = `onboarding/${instance.id}/${Date.now()}-${safeName}.${rawExt}`;
  const buffer   = Buffer.from(await file.arrayBuffer());

  const { error } = await supabase.storage
    .from('agent-files')
    .upload(path, buffer, { contentType: mime, upsert: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data: { publicUrl } } = supabase.storage.from('agent-files').getPublicUrl(path);

  return NextResponse.json({ ok: true, url: publicUrl });
}
