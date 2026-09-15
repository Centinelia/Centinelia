/**
 * POST /api/portal/[token]/agent-chat/upload
 *
 * Recibe un archivo multimedia enviado desde el chat del portal, lo sube
 * al bucket 'user-media' y devuelve el media_id para que el caller lo incluya
 * en el siguiente mensaje del chat.
 *
 * Guardas de seguridad (misma forma que upload-logo):
 *   - Session cookie obligatoria (verifySession)
 *   - Resolución de org desde token (resolveOrgFromToken)
 *   - IDOR: agent_id enviado en el form debe pertenecer a la misma org que la sesión
 *
 * Límites de tamaño: 100 MB video / 30 MB imagen.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';
import { resolveOrgFromToken } from '@/lib/portal/org-token';

export const runtime     = 'nodejs';
export const maxDuration = 60;

const MAX_VIDEO_BYTES = 100 * 1024 * 1024; // 100 MB
const MAX_IMAGE_BYTES =  30 * 1024 * 1024; //  30 MB

interface Params { params: Promise<{ token: string }> }

/**
 * Sanitiza el nombre de archivo para usarlo de forma segura en el path de storage.
 */
function sanitizeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 200);
}

export async function POST(req: NextRequest, { params }: Params) {
  const { token } = await params;

  // ── Autenticación ──────────────────────────────────────────────────────────
  const cookie  = req.cookies.get(PORTAL_COOKIE)?.value ?? '';
  const session = await verifySession(cookie);
  if (!session) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  }

  // ── Resolución de org ──────────────────────────────────────────────────────
  const resolved = await resolveOrgFromToken(token);
  if (!resolved) {
    return NextResponse.json({ error: 'Organización no encontrada' }, { status: 404 });
  }
  if (session.portalEmail !== resolved.portalEmail) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }

  // ── Lectura del multipart ──────────────────────────────────────────────────
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: 'Error al leer el formulario' }, { status: 400 });
  }

  const file        = formData.get('file') as File | null;
  const agentId     = formData.get('agent_id') as string | null;
  const clienteNote = (formData.get('cliente_note') as string | null) ?? null;

  if (!file || !agentId) {
    return NextResponse.json({ error: 'Faltan campos obligatorios: file, agent_id' }, { status: 400 });
  }

  // ── IDOR: agent_id debe pertenecer a esta org ──────────────────────────────
  const supabase = createAdminClient();
  const { data: agentRow } = await supabase
    .from('voice_agents')
    .select('id, portal_email')
    .eq('id', agentId)
    .eq('portal_email', resolved.portalEmail)
    .maybeSingle();

  if (!agentRow) {
    return NextResponse.json({ error: 'Agente no encontrado o sin acceso' }, { status: 403 });
  }

  // ── Validación de tipo y tamaño ────────────────────────────────────────────
  const isVideo = file.type.startsWith('video/');
  const isImage = file.type.startsWith('image/');

  if (!isVideo && !isImage) {
    return NextResponse.json(
      { error: `Tipo de archivo no permitido: ${file.type}. Solo se aceptan video e imagen.` },
      { status: 400 },
    );
  }

  const maxBytes = isVideo ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;
  if (file.size > maxBytes) {
    return NextResponse.json(
      { error: `El archivo supera el límite de ${maxBytes / 1024 / 1024} MB para ${isVideo ? 'video' : 'imagen'}.` },
      { status: 413 },
    );
  }

  // ── Upload a storage ───────────────────────────────────────────────────────
  const buffer      = Buffer.from(await file.arrayBuffer());
  const storagePath = `${resolved.portalEmail}/${agentId}/${Date.now()}-${sanitizeName(file.name)}`;

  const { error: uploadError } = await supabase.storage
    .from('user-media')
    .upload(storagePath, buffer, { contentType: file.type });

  if (uploadError) {
    return NextResponse.json({ error: `Error al subir archivo: ${uploadError.message}` }, { status: 500 });
  }

  // ── Signed URL 90 días ─────────────────────────────────────────────────────
  const ninetyDaysSeconds = 90 * 24 * 60 * 60;
  const { data: signedData, error: signedError } = await supabase.storage
    .from('user-media')
    .createSignedUrl(storagePath, ninetyDaysSeconds);

  if (signedError || !signedData?.signedUrl) {
    return NextResponse.json({ error: 'No se pudo generar la URL firmada' }, { status: 500 });
  }

  const expiresAt = new Date(Date.now() + ninetyDaysSeconds * 1000).toISOString();

  // ── Insert en user_media_uploads ───────────────────────────────────────────
  const { data: row, error: insertError } = await supabase
    .from('user_media_uploads')
    .insert({
      portal_email:    resolved.portalEmail,
      agent_id:        agentId,
      source:          'chat',
      file_url:        signedData.signedUrl,
      file_type:       file.type,
      file_size_bytes: buffer.length,
      cliente_note:    clienteNote,
      status:          'available',
      expires_at:      expiresAt,
      // duration_seconds y dimensions: null hasta que los pueble un cron
    })
    .select()
    .single();

  if (insertError || !row) {
    return NextResponse.json(
      { error: `Error al registrar archivo: ${insertError?.message ?? 'desconocido'}` },
      { status: 500 },
    );
  }

  // Devolvemos media_id para que el caller lo inyecte en el próximo mensaje de chat
  const rowRecord = row as Record<string, unknown>;
  return NextResponse.json({ ok: true, media_id: rowRecord.id, media: row });
}
