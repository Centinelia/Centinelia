// Portal Fichas Informativas — GET (list) + POST (upload).
//
// GET  /api/portal/[token]/fichas
//   Lista las fichas activas del org, con sus contactos, sección count y
//   estado del feature flag. Sin descarga del PDF (solo metadata).
//
// POST /api/portal/[token]/fichas   (multipart/form-data)
//   Recibe un PDF, ejecuta ingestFicha (parser LLM + storage upload +
//   chunkeo + auto-activación de feature). Cobra 1 op al primary agent
//   del portal por ficha subida. Devuelve el metadata de la ficha creada.

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';
import { resolveOrgFromToken, getPrimaryAgentFromToken } from '@/lib/portal/org-token';
import { ingestFicha } from '@/lib/rag/ingest';

interface Params { params: Promise<{ token: string }> }

const MAX_PDF_BYTES = 20 * 1024 * 1024; // 20 MB (mismo límite del bucket)

// ─── GET ────────────────────────────────────────────────────────────────────
export async function GET(_req: NextRequest, { params }: Params) {
  const { token } = await params;
  const cookieStore = await cookies();
  const session = await verifySession(cookieStore.get(PORTAL_COOKIE)?.value ?? '');
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const resolved = await resolveOrgFromToken(token);
  if (!resolved) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (session.portalEmail !== resolved.portalEmail) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  const supabase = createAdminClient();
  const [{ data: fichas, error }, { data: orgRow }] = await Promise.all([
    supabase
      .from('fichas_informativas')
      .select('id, codigo, titulo, dependencia, unidad_administrativa, contacto_nombre, contacto_puesto, contacto_correo, contacto_telefono, contacto_extension, liga_en_linea, direccion, horario, costo_descripcion, plazo_respuesta, storage_path, parsed_at, updated_at')
      .eq('portal_email', resolved.portalEmail)
      .order('titulo', { ascending: true }),
    supabase
      .from('organizations')
      .select('features')
      .eq('portal_email', resolved.portalEmail)
      .maybeSingle(),
  ]);
  if (error) return NextResponse.json({ error: `List error: ${error.message}` }, { status: 500 });

  const features = (orgRow?.features as Record<string, unknown> | null | undefined) ?? {};

  // Contar chunks por ficha (single query agrupado)
  const fichaIds = (fichas ?? []).map((f) => f.id);
  let chunkCounts = new Map<string, number>();
  if (fichaIds.length > 0) {
    const { data: chunks } = await supabase
      .from('fichas_informativas_chunks')
      .select('ficha_id')
      .in('ficha_id', fichaIds);
    for (const c of chunks ?? []) {
      chunkCounts.set(c.ficha_id, (chunkCounts.get(c.ficha_id) ?? 0) + 1);
    }
  }

  return NextResponse.json({
    enabled: features.fichas_informativas === true,
    mode:    (features.fichas_informativas_mode as string | undefined) ?? 'stuffed',
    fichas: (fichas ?? []).map((f) => ({
      ...f,
      chunks_count: chunkCounts.get(f.id) ?? 0,
    })),
  });
}

// ─── POST ───────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest, { params }: Params) {
  const { token } = await params;
  const cookieStore = await cookies();
  const session = await verifySession(cookieStore.get(PORTAL_COOKIE)?.value ?? '');
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const resolved = await resolveOrgFromToken(token);
  if (!resolved) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (session.portalEmail !== resolved.portalEmail) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  const supabase = createAdminClient();
  const agent = await getPrimaryAgentFromToken<{ id: string }>(token, 'id', supabase);
  if (!agent?.id) {
    return NextResponse.json({ error: 'No hay empleado principal asociado a este portal.' }, { status: 400 });
  }

  const contentType = req.headers.get('content-type') ?? '';
  if (!contentType.includes('multipart/form-data')) {
    return NextResponse.json({ error: 'Content-Type debe ser multipart/form-data' }, { status: 400 });
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: 'No se pudo leer el formulario' }, { status: 400 });
  }

  const file = formData.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'Campo "file" faltante o no es un archivo' }, { status: 400 });
  }
  if (file.type !== 'application/pdf') {
    return NextResponse.json({ error: 'Solo se aceptan archivos PDF' }, { status: 400 });
  }
  if (file.size > MAX_PDF_BYTES) {
    return NextResponse.json({ error: `Archivo excede el límite de ${MAX_PDF_BYTES / (1024 * 1024)} MB` }, { status: 413 });
  }
  if (file.size === 0) {
    return NextResponse.json({ error: 'El archivo está vacío' }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  // Leer tags opcionales que el cliente ya aprobó desde el modal (Fase 5.4).
  // Si el modal envió tags → manual_override. Si no → autotag síncrono.
  const tagsRaw = formData.get('tags');
  let clientTags: string[] | undefined;
  if (typeof tagsRaw === 'string' && tagsRaw.trim().length > 0) {
    try {
      const parsed = JSON.parse(tagsRaw);
      if (Array.isArray(parsed) && parsed.every(s => typeof s === 'string')) {
        clientTags = parsed as string[];
      }
    } catch { /* ignorar tags malformados */ }
  }

  try {
    const result = await ingestFicha(buffer, {
      portalEmail:   resolved.portalEmail,
      filename:      file.name,
      uploadedBy:    session.portalEmail,
      parser:        'llm',
      agentId:       agent.id,
      enableAutotag: true,
      tags:          clientTags,
    });
    return NextResponse.json({ ok: true, ...result }, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
