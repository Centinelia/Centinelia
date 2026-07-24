import { NextRequest, NextResponse } from 'next/server';
import { getAgentAccess } from '@/lib/portal/agent-access';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';

export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const session = await verifySession(req.cookies.get(PORTAL_COOKIE)?.value ?? '');
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { token } = await params;
  const access    = await getAgentAccess(token, req);
  if (!access) return NextResponse.json({ call: null });
  if (session.portalEmail && access.portalEmail !== session.portalEmail)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

  const itemDate = req.nextUrl.searchParams.get('date');
  if (!itemDate) return NextResponse.json({ call: null });

  const date = new Date(itemDate);
  const from = new Date(date.getTime() - 120000).toISOString();
  const to   = new Date(date.getTime() + 120000).toISOString();

  const { data: call } = await createAdminClient()
    .from('voice_calls')
    .select('id, recording_url, created_at, duration_seconds, caller_number, outcome')
    .in('agent_id', access.ids)
    .gte('created_at', from)
    .lte('created_at', to)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  return NextResponse.json({ call: call ?? null });
}
