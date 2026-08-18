export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';
import { resolveOrgFromToken } from '@/lib/portal/org-token';
import { getCatalogHeaders } from '@/lib/dropbox/catalog';

interface Params { params: Promise<{ token: string }> }

// POST { doc_path } — descarga el doc de Dropbox y devuelve los headers (columnas)
// para poblar los dropdowns de config en portal.
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

  const { doc_path } = await req.json() as { doc_path?: string };
  const path = String(doc_path ?? '').trim();
  if (!path || !path.startsWith('/')) {
    return NextResponse.json({ error: 'doc_path debe iniciar con /' }, { status: 400 });
  }

  try {
    const supabase = createAdminClient();
    const headers = await getCatalogHeaders(resolved.portalEmail, path, supabase);
    if (headers === null) {
      return NextResponse.json({ error: 'Dropbox no conectado o token invalido' }, { status: 400 });
    }
    return NextResponse.json({ headers });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown error';
    return NextResponse.json({ error: `No se pudo leer ${path}: ${msg}` }, { status: 500 });
  }
}
