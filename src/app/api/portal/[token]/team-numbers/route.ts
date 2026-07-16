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
    .select('id, team_numbers')
    .eq('portal_token', token)
    .single();
  if (!agent) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });

  return NextResponse.json({ team_numbers: (agent as any).team_numbers ?? [] });
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const cookie = req.cookies.get(PORTAL_COOKIE)?.value ?? '';
  const auth   = await verifySession(cookie);
  if (!auth) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const { token } = await params;
  const supabase  = createAdminClient();
  const body      = await req.json() as { team_numbers?: { number: string; name?: string; is_owner?: boolean }[] };

  const teamNumbers = (body.team_numbers ?? [])
    .filter(t => typeof t.number === 'string' && t.number.trim())
    .slice(0, 50)
    .map(t => ({ number: t.number.trim(), name: t.name?.trim() || undefined, ...(t.is_owner ? { is_owner: true } : {}) }));

  const { error } = await supabase
    .from('voice_agents')
    .update({ team_numbers: teamNumbers } as any)
    .eq('portal_token', token);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
