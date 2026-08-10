export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';
import { resolveOrgFromToken } from '@/lib/portal/org-token';

interface Params { params: Promise<{ token: string; id: string }> }

// PATCH — mark recommendation as aplicada or descartada
export async function PATCH(req: NextRequest, { params }: Params) {
  const { token, id } = await params;
  const cookieStore = await cookies();
  const session = await verifySession(cookieStore.get(PORTAL_COOKIE)?.value ?? '');
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json() as { status?: string };
  if (!body.status || !['aplicada', 'descartada', 'nueva'].includes(body.status))
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 });

  const supabase = createAdminClient();
  const resolved = await resolveOrgFromToken(token);
  if (!resolved?.portalEmail) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const agent = { portal_email: resolved.portalEmail };
  if (session.portalEmail && agent.portal_email && session.portalEmail !== agent.portal_email)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

  const { error } = await supabase
    .from('agent_recommendations')
    .update({
      status:      body.status,
      resolved_at: body.status !== 'nueva' ? new Date().toISOString() : null,
    })
    .eq('id', id)
    .eq('org_id', agent.portal_email);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
