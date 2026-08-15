// src/app/api/portal/[token]/cancellations/[id]/reject/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';
import { getPrimaryAgentFromToken } from '@/lib/portal/org-token';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, ctx: { params: Promise<{ token: string; id: string }> }) {
  const cookie = req.cookies.get(PORTAL_COOKIE)?.value ?? '';
  const auth   = await verifySession(cookie);
  if (!auth) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { token, id } = await ctx.params;
  const supabase = createAdminClient();

  const agent = await getPrimaryAgentFromToken<{ id: string; portal_email: string | null }>(
    token, 'id, portal_email', supabase,
  );
  if (!agent) return NextResponse.json({ error: 'not found' }, { status: 404 });
  if (agent.portal_email && auth.portalEmail && agent.portal_email !== auth.portalEmail) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const portalEmail = agent.portal_email ?? auth.portalEmail ?? null;
  if (!portalEmail) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({})) as { notes?: string };

  // Fetch and validate cancellation record — IDOR via organization_email
  const { data: cx } = await supabase
    .from('cfdi_cancellations')
    .select('id, factura_request_id, organization_email, status')
    .eq('id', id)
    .single();
  if (!cx || cx.organization_email !== portalEmail) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }
  if (cx.status === 'rejected') {
    return NextResponse.json({ error: 'ya rechazada' }, { status: 409 });
  }

  // Mark cancellation as rejected
  await supabase
    .from('cfdi_cancellations')
    .update({
      status: 'rejected',
      notes:  body.notes ?? 'Rechazado por humano',
    })
    .eq('id', id);

  // Revert factura_request back to stamped so it shows as active again
  if (cx.factura_request_id) {
    await supabase
      .from('factura_requests')
      .update({ status: 'stamped' })
      .eq('id', cx.factura_request_id);
  }

  // Audit log — best-effort
  void supabase.from('admin_access_log').insert({
    admin_email:           auth.portalEmail,
    endpoint:              '/api/portal/[token]/cancellations/[id]/reject',
    method:                'POST',
    affected_portal_email: portalEmail,
    query_type:            'modify',
    filters:               { cancellation_id: id, notes: body.notes ?? null },
  });

  return NextResponse.json({ ok: true });
}
