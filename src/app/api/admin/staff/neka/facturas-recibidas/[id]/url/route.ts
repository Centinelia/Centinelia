import { NextRequest, NextResponse } from 'next/server';
import { isAdmin } from '@/lib/admin/auth';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic     = 'force-dynamic';
export const maxDuration = 10;

/** GET — signed URL para descargar XML o PDF de una factura recibida. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!await isAdmin()) return NextResponse.json({ error: 'admin only' }, { status: 401 });
  const { id } = await params;

  const kind = new URL(req.url).searchParams.get('kind');
  if (kind !== 'xml' && kind !== 'pdf') {
    return NextResponse.json({ error: 'kind debe ser xml o pdf' }, { status: 400 });
  }

  const ttlRaw = Number(new URL(req.url).searchParams.get('ttl') ?? '600');
  const ttl = Math.min(3600, Math.max(60, isNaN(ttlRaw) ? 600 : ttlRaw));

  const supabase = createAdminClient();
  const { data: row, error: fetchErr } = await supabase
    .from('centinelia_facturas_recibidas')
    .select('xml_storage_path, pdf_storage_path')
    .eq('id', id)
    .single();
  if (fetchErr || !row) {
    return NextResponse.json({ error: `factura ${id} no existe` }, { status: 404 });
  }

  const path = kind === 'xml' ? (row as { xml_storage_path?: string }).xml_storage_path : (row as { pdf_storage_path?: string }).pdf_storage_path;
  if (!path) {
    return NextResponse.json({ error: `factura no tiene archivo ${kind}` }, { status: 404 });
  }

  const { data, error } = await supabase.storage.from('centinelia-clientes-docs').createSignedUrl(path, ttl);
  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? 'no url returned' }, { status: 500 });
  }

  const expiresAt = new Date(Date.now() + ttl * 1000).toISOString();
  return NextResponse.json({ url: data.signedUrl, expiresAt });
}
