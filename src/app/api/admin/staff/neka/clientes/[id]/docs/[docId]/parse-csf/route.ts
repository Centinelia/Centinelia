import { NextRequest, NextResponse } from 'next/server';
import { isAdmin } from '@/lib/admin/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { parseCsfPdf } from '@/lib/billing/csf-parser';
import type { ClienteDoc } from '@/lib/billing/centinelia-clientes';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const BUCKET = 'centinelia-clientes-docs';

/**
 * POST — parsea un doc tipo csf del cliente y regresa los campos fiscales
 * detectados. NO aplica los cambios al cliente — solo lee. La UI muestra
 * lo detectado y llama PATCH /clientes/[id] si el humano decide aplicar.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; docId: string }> },
) {
  if (!await isAdmin()) return NextResponse.json({ error: 'admin only' }, { status: 401 });

  const { id, docId } = await params;
  const supabase = createAdminClient();

  const { data: cliente, error: fetchErr } = await supabase
    .from('centinelia_clientes')
    .select('docs')
    .eq('id', id)
    .single();
  if (fetchErr) return NextResponse.json({ error: fetchErr.message, code: 'not_found' }, { status: 404 });

  const docs = (cliente?.docs ?? []) as ClienteDoc[];
  const target = docs.find(d => d.id === docId);
  if (!target) return NextResponse.json({ error: `doc ${docId} no encontrado`, code: 'not_found' }, { status: 404 });

  if (target.tipo !== 'csf') {
    return NextResponse.json({ error: 'solo docs tipo=csf se pueden parsear', code: 'wrong_tipo' }, { status: 400 });
  }
  if (target.mime_type !== 'application/pdf') {
    return NextResponse.json({ error: 'el parseo requiere PDF, no imagen', code: 'wrong_mime' }, { status: 400 });
  }

  const { data: blob, error: dlErr } = await supabase.storage.from(BUCKET).download(target.storage_path);
  if (dlErr || !blob) {
    return NextResponse.json({ error: dlErr?.message ?? 'download vacio', code: 'storage_error' }, { status: 500 });
  }

  const buffer = Buffer.from(await blob.arrayBuffer());
  const extracted = await parseCsfPdf(buffer);

  if (!extracted) {
    return NextResponse.json({
      error: 'No se pudo extraer texto del PDF. Puede estar escaneado o corrupto.',
      code:  'parse_failed',
    }, { status: 422 });
  }

  return NextResponse.json({ extracted });
}
