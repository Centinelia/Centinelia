import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';
import { getAgentAccess } from '@/lib/portal/agent-access';

interface Params { params: Promise<{ token: string }> }

export async function GET(req: NextRequest, { params }: Params) {
  const cookie = req.cookies.get(PORTAL_COOKIE)?.value ?? '';
  const auth   = await verifySession(cookie);
  if (!auth) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const { token } = await params;
  const since = req.nextUrl.searchParams.get('since');
  if (!since) return NextResponse.json({ calls: [] });

  const access = await getAgentAccess(token, req);
  if (!access) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (auth.portalEmail && access.portalEmail && auth.portalEmail !== access.portalEmail)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

  const { data: calls } = await createAdminClient()
    .from('voice_calls')
    .select('id, outcome, caller_number, created_at')
    .in('agent_id', access.ids)
    .gt('created_at', since)
    .order('created_at', { ascending: false })
    .limit(10);

  return NextResponse.json({ calls: calls ?? [] });
}
