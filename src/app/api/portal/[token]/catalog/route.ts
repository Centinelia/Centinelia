export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';
import { resolveOrgFromToken, getPrimaryAgentFromToken } from '@/lib/portal/org-token';

interface Params { params: Promise<{ token: string }> }

// GET — config actual del pack cloud_catalog + estado feature
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
  const [{ data: orgRow }, agent] = await Promise.all([
    supabase.from('organizations').select('catalog_config').eq('portal_email', resolved.portalEmail).maybeSingle(),
    getPrimaryAgentFromToken<{ features: Record<string, unknown> | null }>(token, 'features', supabase),
  ]);

  const features = (agent?.features as Record<string, unknown> | null | undefined) ?? {};
  return NextResponse.json({
    enabled: !!features.cloud_catalog,
    config:  orgRow?.catalog_config ?? null,
  });
}

// PATCH — actualizar config { provider, doc_path, sku_column, desc_column, price_column? }
export async function PATCH(req: NextRequest, { params }: Params) {
  const { token } = await params;
  const cookieStore = await cookies();
  const session = await verifySession(cookieStore.get(PORTAL_COOKIE)?.value ?? '');
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const resolved = await resolveOrgFromToken(token);
  if (!resolved) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (session.portalEmail !== resolved.portalEmail) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  const body = await req.json() as {
    provider?: 'dropbox' | 'google' | 'microsoft';
    doc_path?: string;
    sku_column?: string;
    desc_column?: string;
    price_column?: string | null;
  };

  const provider = body.provider;
  if (!provider || !['dropbox', 'google', 'microsoft'].includes(provider)) {
    return NextResponse.json({ error: 'provider debe ser dropbox, google o microsoft' }, { status: 400 });
  }
  const docPath = String(body.doc_path ?? '').trim();
  const skuCol  = String(body.sku_column ?? '').trim();
  const descCol = String(body.desc_column ?? '').trim();
  if (!docPath || !skuCol || !descCol) {
    return NextResponse.json({ error: 'doc_path, sku_column y desc_column son requeridos' }, { status: 400 });
  }
  // Dropbox usa path que inicia con /. Google/Microsoft usan fileId opaco (sin /).
  if (provider === 'dropbox' && !docPath.startsWith('/')) {
    return NextResponse.json({ error: 'Para Dropbox, doc_path debe iniciar con /' }, { status: 400 });
  }

  const config = {
    provider,
    doc_path:     docPath,
    sku_column:   skuCol,
    desc_column:  descCol,
    price_column: body.price_column ? String(body.price_column).trim() : null,
  };

  const supabase = createAdminClient();
  const { error } = await supabase
    .from('organizations')
    .update({ catalog_config: config })
    .eq('portal_email', resolved.portalEmail);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, config });
}
