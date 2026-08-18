export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';
import { resolveOrgFromToken } from '@/lib/portal/org-token';

interface Params { params: Promise<{ token: string }> }

// GET — config actual del pack dropbox_catalog
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
  const { data } = await supabase
    .from('organizations')
    .select('dropbox_catalog_config, features')
    .eq('portal_email', resolved.portalEmail)
    .maybeSingle();

  const features = (data?.features as Record<string, unknown>) ?? {};
  return NextResponse.json({
    enabled: !!features.dropbox_catalog,
    config:  data?.dropbox_catalog_config ?? null,
  });
}

// PATCH — actualizar config { doc_path, sku_column, desc_column, price_column? }
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
    doc_path?: string;
    sku_column?: string;
    desc_column?: string;
    price_column?: string | null;
  };

  const docPath = String(body.doc_path ?? '').trim();
  const skuCol  = String(body.sku_column ?? '').trim();
  const descCol = String(body.desc_column ?? '').trim();
  if (!docPath || !skuCol || !descCol) {
    return NextResponse.json({ error: 'doc_path, sku_column y desc_column son requeridos' }, { status: 400 });
  }
  if (!docPath.startsWith('/')) {
    return NextResponse.json({ error: 'doc_path debe iniciar con /' }, { status: 400 });
  }

  const config = {
    doc_path:     docPath,
    sku_column:   skuCol,
    desc_column:  descCol,
    price_column: body.price_column ? String(body.price_column).trim() : null,
  };

  const supabase = createAdminClient();
  const { error } = await supabase
    .from('organizations')
    .update({ dropbox_catalog_config: config })
    .eq('portal_email', resolved.portalEmail);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, config });
}
