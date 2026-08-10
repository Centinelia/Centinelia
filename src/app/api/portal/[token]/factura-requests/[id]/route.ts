import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';
import { getPrimaryAgentFromToken } from '@/lib/portal/org-token';

export const dynamic = 'force-dynamic';

interface Params { params: Promise<{ token: string; id: string }> }

async function ensureAccess(token: string, id: string, auth: { portalEmail?: string | null }) {
  const supabase = createAdminClient();
  const agent = await getPrimaryAgentFromToken<{ id: string; portal_email: string | null }>(token, 'id, portal_email', supabase);
  if (!agent) return { error: 'Not found' as const, status: 404 };
  if (agent.portal_email && auth.portalEmail && agent.portal_email !== auth.portalEmail) {
    return { error: 'Forbidden' as const, status: 403 };
  }
  const { data: siblings } = agent.portal_email
    ? await supabase.from('voice_agents').select('id').eq('portal_email', agent.portal_email)
    : { data: [{ id: agent.id }] };
  const agentIds = (siblings ?? [{ id: agent.id }]).map(a => a.id as string);
  const { data: fr } = await supabase
    .from('factura_requests')
    .select('*')
    .eq('id', id)
    .in('agent_id', agentIds)
    .single();
  if (!fr) return { error: 'Not found' as const, status: 404 };
  return { supabase, agent, fr };
}

export async function GET(req: NextRequest, { params }: Params) {
  const cookie = req.cookies.get(PORTAL_COOKIE)?.value ?? '';
  const auth   = await verifySession(cookie);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { token, id } = await params;
  const access = await ensureAccess(token, id, auth);
  if ('error' in access) return NextResponse.json({ error: access.error }, { status: access.status });

  return NextResponse.json({ request: access.fr });
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const cookie = req.cookies.get(PORTAL_COOKIE)?.value ?? '';
  const auth   = await verifySession(cookie);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { token, id } = await params;
  const access = await ensureAccess(token, id, auth);
  if ('error' in access) return NextResponse.json({ error: access.error }, { status: access.status });

  const body = await req.json() as {
    action:        'mark_issued' | 'mark_in_progress' | 'cancel';
    issued_uuid?:   string;
    issued_folio?:  string;
    issued_pdf_path?: string;
    issued_xml_path?: string;
    cancel_reason?: string;
  };

  const patch: Record<string, unknown> = {};
  if (body.action === 'mark_issued') {
    patch.status      = 'issued';
    patch.resolved_at = new Date().toISOString();
    patch.resolved_by = auth.portalEmail ?? 'portal';
    if (body.issued_uuid)     patch.issued_uuid     = body.issued_uuid;
    if (body.issued_folio)    patch.issued_folio    = body.issued_folio;
    if (body.issued_pdf_path) patch.issued_pdf_path = body.issued_pdf_path;
    if (body.issued_xml_path) patch.issued_xml_path = body.issued_xml_path;
  } else if (body.action === 'mark_in_progress') {
    patch.status = 'in_progress';
  } else if (body.action === 'cancel') {
    patch.status        = 'cancelled';
    patch.resolved_at   = new Date().toISOString();
    patch.resolved_by   = auth.portalEmail ?? 'portal';
    patch.cancel_reason = body.cancel_reason ?? null;
  } else {
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  }

  const { error } = await access.supabase
    .from('factura_requests')
    .update(patch)
    .eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
