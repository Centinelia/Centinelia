import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';
import { getPrimaryAgentFromToken } from '@/lib/portal/org-token';

export const dynamic = 'force-dynamic';

interface Params { params: Promise<{ token: string; id: string }> }

export async function GET(req: NextRequest, { params }: Params) {
  const cookie = req.cookies.get(PORTAL_COOKIE)?.value ?? '';
  const auth   = await verifySession(cookie);
  if (!auth) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const { token, id } = await params;
  const supabase = createAdminClient();

  // Verify org access via portal_token → agent → agent's org
  const acct = await getPrimaryAgentFromToken<{ portal_email: string | null }>(token, 'portal_email', supabase);
  if (!acct?.portal_email) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Verify inbox item belongs to an agent in this org
  const { data: item } = await supabase
    .from('ops_inbox')
    .select('agent_id, voice_agents!inner(portal_email)')
    .eq('id', id)
    .single();
  const itemPortalEmail = (item as unknown as { voice_agents?: { portal_email?: string } })?.voice_agents?.portal_email;
  if (!item || itemPortalEmail !== acct.portal_email) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const { data: transitions } = await supabase
    .from('inbox_state_transitions')
    .select('id, from_status, to_status, actor, reason, metadata, transitioned_at')
    .eq('inbox_id', id)
    .order('transitioned_at', { ascending: true });

  return NextResponse.json({ transitions: transitions ?? [] });
}
