import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';

interface Params { params: Promise<{ token: string }> }

export async function GET(req: NextRequest, { params }: Params) {
  const cookie = req.cookies.get(PORTAL_COOKIE)?.value ?? '';
  const auth   = await verifySession(cookie);
  if (!auth) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const { token } = await params;
  const supabase = createAdminClient();

  const { data: agent } = await supabase
    .from('voice_agents').select('portal_email').eq('portal_token', token).single();
  if (!agent?.portal_email) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });

  const { data } = await supabase
    .from('agent_messages')
    .select(`
      id, type, content, metadata, created_at, from_agent_id, to_agent_id,
      from_agent:voice_agents!from_agent_id(agent_name, business_name, role),
      to_agent:voice_agents!to_agent_id(agent_name, business_name, role)
    `)
    .eq('portal_email', agent.portal_email)
    .order('created_at', { ascending: false })
    .limit(60);

  return NextResponse.json(data ?? []);
}
