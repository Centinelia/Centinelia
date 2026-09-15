/**
 * GET /api/portal/[token]/social/templates
 *
 * Lista las plantillas de marca (brand_templates) de la org.
 * Filtros opcionales: ?category=post|reel|story|carousel, ?active=true
 *
 * Seguridad: session + IDOR + feature flag (via guardPortalSocialRequest).
 */
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { guardPortalSocialRequest, isNextResponse } from '@/lib/social/portal-guards';

interface Params { params: Promise<{ token: string }> }

export async function GET(req: NextRequest, { params }: Params) {
  const { token } = await params;

  const guard = await guardPortalSocialRequest(req, token);
  if (isNextResponse(guard)) return guard;
  const { resolved, supabase } = guard;

  const category = req.nextUrl.searchParams.get('category');
  const active   = req.nextUrl.searchParams.get('active');

  let q = supabase
    .from('brand_templates')
    .select('*')
    .eq('portal_email', resolved.portalEmail)
    .order('created_at', { ascending: false });

  if (category) {
    q = q.eq('category', category);
  }
  if (active === 'true') {
    q = q.eq('active', true);
  }

  const { data, error } = await q;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, data });
}
