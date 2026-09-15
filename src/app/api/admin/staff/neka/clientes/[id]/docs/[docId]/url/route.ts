import { NextRequest, NextResponse } from 'next/server';
import { isAdmin } from '@/lib/admin/auth';
import { getClienteDocSignedUrl } from '@/lib/billing/centinelia-clientes-docs';

export const dynamic = 'force-dynamic';

/**
 * GET — regresa signed URL temporal (default 1h) para descargar el doc.
 * Query opcional: `ttl` en segundos, clamp [60, 3600].
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; docId: string }> },
) {
  if (!await isAdmin()) return NextResponse.json({ error: 'admin only' }, { status: 401 });

  const { id, docId } = await params;
  const ttlParam = req.nextUrl.searchParams.get('ttl');
  const ttl = Math.max(60, Math.min(3600, Number(ttlParam) || 3600));

  const result = await getClienteDocSignedUrl(id, docId, ttl);

  if (!result.ok) {
    const status = result.code === 'not_found' ? 404 : 500;
    return NextResponse.json({ error: result.message, code: result.code }, { status });
  }

  return NextResponse.json({ url: result.url, expiresAt: result.expiresAt });
}
