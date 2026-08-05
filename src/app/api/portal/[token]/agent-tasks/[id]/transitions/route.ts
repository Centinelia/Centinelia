import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';

export const dynamic = 'force-dynamic';

interface Params { params: Promise<{ token: string; id: string }> }

export async function GET(req: NextRequest, { params }: Params) {
  const cookie = req.cookies.get(PORTAL_COOKIE)?.value ?? '';
  const auth   = await verifySession(cookie);
  if (!auth) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const { token, id } = await params;
  const supabase = createAdminClient();

  // Verify org access
  const { data: acct } = await supabase
    .from('voice_agents')
    .select('portal_email')
    .eq('portal_token', token)
    .single();
  if (!acct?.portal_email) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Verify task belongs to this org
  const { data: task } = await supabase
    .from('agent_tasks')
    .select('portal_email')
    .eq('id', id)
    .single();
  if (!task || task.portal_email !== acct.portal_email) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const { data: transitions } = await supabase
    .from('task_state_transitions')
    .select('id, from_status, to_status, actor, reason, metadata, transitioned_at')
    .eq('task_id', id)
    .order('transitioned_at', { ascending: true });

  return NextResponse.json({ transitions: transitions ?? [] });
}
