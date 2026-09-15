/**
 * GET /api/portal/[token]/social/accounts
 *
 * Lista las cuentas sociales (social_accounts) de la org.
 * Filtros opcionales: ?agent_id=<uuid>
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

  const agentId = req.nextUrl.searchParams.get('agent_id');

  let q = supabase
    .from('social_accounts')
    .select('id, provider, external_username, page_id, paused, status, created_at, agent_id')
    .eq('portal_email', resolved.portalEmail)
    .order('created_at', { ascending: false });

  if (agentId) {
    q = q.eq('agent_id', agentId);
  }

  const { data, error } = await q;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, data });
}
