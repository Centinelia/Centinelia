import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';

interface Params { params: Promise<{ token: string }> }

export async function GET(req: NextRequest, { params }: Params) {
  const cookie = req.cookies.get(PORTAL_COOKIE)?.value ?? '';
  const auth   = await verifySession(cookie);
  if (!auth) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const { token } = await params;
  const supabase  = createAdminClient();

  const { data: agent } = await supabase
    .from('voice_agents')
    .select('id, teams_user_email')
    .eq('portal_token', token)
    .single();
  if (!agent) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });

  const { data: messages } = await supabase
    .from('teams_messages')
    .select('id, conversation_id, sender_name, sender_email, chat_type, message, reply, created_at')
    .eq('agent_id', agent.id)
    .order('created_at', { ascending: false })
    .limit(50);

  return NextResponse.json({
    teams_user_email: (agent as any).teams_user_email ?? null,
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
