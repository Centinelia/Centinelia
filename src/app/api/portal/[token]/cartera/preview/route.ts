// Portal Cartera de Contactos — POST preview (headers + sample rows para
// que el UI arme el column mapping antes de commitear el import completo).
//
// POST /api/portal/[token]/cartera/preview   (multipart/form-data)
//   Recibe: file (CSV o XLSX).
//   Devuelve: headers[], sample_rows (primeras 5), total_rows_leidas.

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import * as XLSX from 'xlsx';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';
import { resolveOrgFromToken } from '@/lib/portal/org-token';

interface Params { params: Promise<{ token: string }> }

const MAX_FILE_BYTES = 50 * 1024 * 1024;

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

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: 'No se pudo leer el formulario' }, { status: 400 });
  }

  const file = formData.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'Campo "file" faltante' }, { status: 400 });
  }
  if (file.size > MAX_FILE_BYTES) {
    return NextResponse.json({ error: `Archivo excede ${MAX_FILE_BYTES / (1024 * 1024)} MB` }, { status: 413 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const ext    = file.name.toLowerCase().split('.').pop() ?? '';
  const isXlsx = ext === 'xlsx' || ext === 'xls' || ext === 'ods';

  try {
    const wb    = XLSX.read(buffer, { type: 'buffer', codepage: isXlsx ? undefined : 65001, cellDates: false });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    if (!sheet) return NextResponse.json({ error: 'El archivo no tiene hojas legibles' }, { status: 400 });

    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '', raw: false });
    if (rows.length === 0) return NextResponse.json({ error: 'El archivo está vacío o sin filas de datos' }, { status: 400 });

    const headers = Object.keys(rows[0]);
    const sample  = rows.slice(0, 5);

    return NextResponse.json({
      filename:          file.name,
      total_rows_leidas: rows.length,
      headers,
      sample_rows:       sample,
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
