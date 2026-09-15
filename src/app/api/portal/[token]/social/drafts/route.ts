/**
 * GET /api/portal/[token]/social/drafts
 *
 * Lista los borradores de contenido (content_drafts) de la org.
 * Filtros opcionales:
 *   ?status=<status>           (default: 'pending_approval')
 *   ?agent_id=<uuid>
 *   ?target_account_id=<uuid>  (filtra por social_account_id)
 *
 * Incluye joins: brand_templates(name, category) y social_accounts(external_username).
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

  const status          = req.nextUrl.searchParams.get('status') ?? 'pending_approval';
  const agentId         = req.nextUrl.searchParams.get('agent_id');
  const targetAccountId = req.nextUrl.searchParams.get('target_account_id');

  let q = supabase
    .from('content_drafts')
    .select('*, brand_templates(name, category), social_accounts(external_username)')
    .eq('portal_email', resolved.portalEmail)
    .eq('status', status)
    .order('scheduled_for', { ascending: true, nullsFirst: false });

  if (agentId) {
    q = q.eq('agent_id', agentId);
  }
  if (targetAccountId) {
    q = q.eq('social_account_id', targetAccountId);
  }

  const { data, error } = await q;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, data });
}
