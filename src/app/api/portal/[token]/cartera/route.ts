// Portal Cartera de Contactos — POST (upload CSV/Excel).
//
// POST /api/portal/[token]/cartera   (multipart/form-data)
//   Recibe:
//     - file: CSV o XLSX/XLS con la cartera
//     - mapping: JSON con column mapping (ver ColumnMapping en import.ts)
//   Ejecuta importCarteraContactos → upsert masivo en contactos_vivos,
//   auto-activa perfiles_vivos si es primera cartera, cobra 1 op por
//   contacto (batched).

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';
import { resolveOrgFromToken, getPrimaryAgentFromToken } from '@/lib/portal/org-token';
import { importCarteraContactos, type ColumnMapping } from '@/lib/perfiles-vivos/import';

interface Params { params: Promise<{ token: string }> }

const MAX_FILE_BYTES = 50 * 1024 * 1024; // 50 MB (cartera puede ser grande)

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
  if (file.size > MAX_FILE_BYTES) {
    return NextResponse.json({ error: `Archivo excede el límite de ${MAX_FILE_BYTES / (1024 * 1024)} MB` }, { status: 413 });
  }
  if (file.size === 0) {
    return NextResponse.json({ error: 'El archivo está vacío' }, { status: 400 });
  }

  const mappingRaw = formData.get('mapping');
  if (typeof mappingRaw !== 'string') {
    return NextResponse.json({ error: 'Campo "mapping" faltante (JSON con column mapping)' }, { status: 400 });
  }

  let mapping: ColumnMapping;
  try {
    mapping = JSON.parse(mappingRaw) as ColumnMapping;
  } catch {
    return NextResponse.json({ error: 'Mapping no es JSON válido' }, { status: 400 });
  }
  if (!mapping.nombre) {
    return NextResponse.json({ error: 'El mapping debe especificar la columna "nombre" (obligatoria).' }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  try {
    const result = await importCarteraContactos(buffer, {
      portalEmail:   resolved.portalEmail,
      filename:      file.name,
      columnMapping: mapping,
      uploadedBy:    session.portalEmail,
      agentId:       agent.id,
    });
    return NextResponse.json({ ok: true, ...result }, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
