export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';

interface Params { params: Promise<{ token: string; id: string }> }

// PATCH — mark recommendation as aplicada or descartada
export async function PATCH(req: NextRequest, { params }: Params) {
  const { token, id } = await params;
  const cookieStore = await cookies();
  if (!await verifySession(cookieStore.get(PORTAL_COOKIE)?.value ?? ''))
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json() as { status?: string };
  if (!body.status || !['aplicada', 'descartada', 'nueva'].includes(body.status))
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 });

  const supabase = createAdminClient();
  const { data: agent } = await supabase
    .from('voice_agents')
    .select('portal_email')
    .eq('portal_token', token)
    .single();
  if (!agent?.portal_email) return NextResponse.json({ error: 'Not found' }, { status: 404 });

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
