import { NextRequest, NextResponse } from 'next/server';
import { isAdmin } from '@/lib/admin/auth';
import { uploadClienteDoc, DOC_TIPOS } from '@/lib/billing/centinelia-clientes-docs';
import type { DocTipo } from '@/lib/billing/centinelia-clientes';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const MAX_LABEL_LEN = 120;

/**
 * POST — sube un archivo al bucket y lo agrega al array docs del cliente.
 *
 * Body: multipart/form-data con campos:
 *   - file:  el archivo binario
 *   - tipo:  uno de DOC_TIPOS
 *   - label: string (max 120 chars)
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!await isAdmin()) return NextResponse.json({ error: 'admin only' }, { status: 401 });

  const { id } = await params;

  let form: FormData;
  try {
    form = await req.formData();
  } catch (e) {
    return NextResponse.json({ error: `formData invalido: ${(e as Error).message}` }, { status: 400 });
  }

  const file  = form.get('file');
  const tipo  = String(form.get('tipo') ?? '').trim();
  const label = String(form.get('label') ?? '').trim();

  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'campo file requerido' }, { status: 400 });
  }
  if (!DOC_TIPOS.includes(tipo as DocTipo)) {
    return NextResponse.json({ error: `tipo invalido. Permitidos: ${DOC_TIPOS.join(', ')}` }, { status: 400 });
  }
  if (!label || label.length > MAX_LABEL_LEN) {
    return NextResponse.json({ error: `label requerido, max ${MAX_LABEL_LEN} chars` }, { status: 400 });
  }

  const content = Buffer.from(await file.arrayBuffer());
  const uploadedBy = process.env.NAZRE_ADMIN_EMAIL ?? 'nazre20@gmail.com';

  const result = await uploadClienteDoc({
    clienteId:   id,
    tipo:        tipo as DocTipo,
    label,
    filename:    file.name,
    contentType: file.type,
    content,
    uploadedBy,
  });

  if (!result.ok) {
    const status = result.code === 'invalid_mime' || result.code === 'too_large' ? 400 : 500;
    return NextResponse.json({ error: result.message, code: result.code }, { status });
  }

  return NextResponse.json({ doc: result.doc });
}
