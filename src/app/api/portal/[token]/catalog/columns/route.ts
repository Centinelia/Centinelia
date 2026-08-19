export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';
import { resolveOrgFromToken } from '@/lib/portal/org-token';
import { getCatalogHeaders, type CatalogProvider } from '@/lib/catalog/lookup';

interface Params { params: Promise<{ token: string }> }

// POST { provider, doc_path } — descarga el doc y devuelve headers para
// poblar los dropdowns de config en portal.
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

  const { provider, doc_path } = await req.json() as { provider?: CatalogProvider; doc_path?: string };
  if (!provider || !['dropbox', 'google', 'microsoft'].includes(provider)) {
    return NextResponse.json({ error: 'provider debe ser dropbox, google o microsoft' }, { status: 400 });
  }
  const path = String(doc_path ?? '').trim();
  if (!path) {
    return NextResponse.json({ error: 'doc_path requerido' }, { status: 400 });
  }
  if (provider === 'dropbox' && !path.startsWith('/')) {
    return NextResponse.json({ error: 'Para Dropbox, doc_path debe iniciar con /' }, { status: 400 });
  }

  try {
    const supabase = createAdminClient();
    const res = await getCatalogHeaders(resolved.portalEmail, provider, path, supabase);
    if (!Array.isArray(res)) {
      return NextResponse.json({ error: res.error }, { status: 400 });
    }
    return NextResponse.json({ headers: res });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown error';
    return NextResponse.json({ error: `No se pudo leer ${path}: ${msg}` }, { status: 500 });
  }
}
