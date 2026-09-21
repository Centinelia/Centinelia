import { NextRequest, NextResponse } from 'next/server';
import { isAdmin } from '@/lib/admin/auth';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic     = 'force-dynamic';
export const maxDuration = 10;

/**
 * GET — genera signed URL temporal para descargar el XML o PDF de una factura.
 * Query: ?kind=xml|pdf   (rep XML/PDF viven en el mismo row, path esta en xml_path/pdf_path)
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; billingId: string }> },
) {
  if (!await isAdmin()) return NextResponse.json({ error: 'admin only' }, { status: 401 });
  const { billingId } = await params;

  const kind = new URL(req.url).searchParams.get('kind');
  if (kind !== 'xml' && kind !== 'pdf') {
    return NextResponse.json({ error: 'kind debe ser xml o pdf' }, { status: 400 });
  }

  const ttlSecondsRaw = Number(new URL(req.url).searchParams.get('ttl') ?? '600');
  const ttlSeconds = Math.min(3600, Math.max(60, isNaN(ttlSecondsRaw) ? 600 : ttlSecondsRaw));

  const supabase = createAdminClient();
  const { data: row, error: fetchErr } = await supabase
    .from('centinelia_billing')
    .select('xml_path, pdf_path')
    .eq('id', billingId)
    .single();
  if (fetchErr || !row) {
    return NextResponse.json({ error: `factura ${billingId} no existe` }, { status: 404 });
  }

  const path = kind === 'xml' ? (row as { xml_path?: string }).xml_path : (row as { pdf_path?: string }).pdf_path;
  if (!path) {
    return NextResponse.json({ error: `factura no tiene archivo ${kind} subido` }, { status: 404 });
  }

  const { data, error } = await supabase.storage
    .from('centinelia-clientes-docs')
    .createSignedUrl(path, ttlSeconds);
  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? 'no url returned' }, { status: 500 });
  }

  const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();
  return NextResponse.json({ url: data.signedUrl, expiresAt });
}
