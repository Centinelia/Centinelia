import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';
import { getAgentAccess } from '@/lib/portal/agent-access';

interface Params { params: Promise<{ token: string }> }

export async function GET(req: NextRequest, { params }: Params) {
  const { token } = await params;
  const supabase  = createAdminClient();
  const access    = await getAgentAccess(token, req);
  if (!access) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const [{ data: primaryAgent }, { data: messages }] = await Promise.all([
    supabase.from('voice_agents').select('teams_user_email').eq('id', access.primaryId).single(),
    supabase
      .from('teams_messages')
      .select('id, conversation_id, sender_name, sender_email, chat_type, message, reply, created_at')
      .in('agent_id', access.ids)
      .order('created_at', { ascending: false })
      .limit(50),
  ]);

  return NextResponse.json({
    teams_user_email: (primaryAgent as any)?.teams_user_email ?? null,
    messages:         messages ?? [],
  });
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const cookie = req.cookies.get(PORTAL_COOKIE)?.value ?? '';
  const auth   = await verifySession(cookie);
  if (!auth) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const { token } = await params;
  const supabase  = createAdminClient();
  const body      = await req.json();

  const { error } = await supabase
    .from('voice_agents')
    .update({ teams_user_email: body.teams_user_email ?? null })
    .eq('portal_token', token);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
