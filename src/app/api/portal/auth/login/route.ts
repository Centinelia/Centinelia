import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifyPassword, createSession, createSubUserSession, PORTAL_COOKIE } from '@/lib/portal/auth';
import { rateLimit, limiters } from '@/lib/ratelimit';

const COOKIE_OPTS = (res: NextResponse, value: string) =>
  res.cookies.set(PORTAL_COOKIE, value, {
    httpOnly: true,
    secure:   process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path:     '/',
    maxAge:   60 * 60 * 24 * 7,
    domain:   process.env.NODE_ENV === 'production' ? '.centinelia.mx' : undefined,
  });

export async function POST(req: NextRequest) {
  const limited = await rateLimit(req, limiters.auth);
  if (limited) return limited;

  const { email, password } = await req.json() as { email?: string; password?: string };
  if (!email || !password) return NextResponse.json({ error: 'Credenciales requeridas' }, { status: 400 });

  const supabase        = createAdminClient();
  const normalizedEmail = email.toLowerCase().trim();

  // ── 1. Check portal_users (sub-users + owner mirrors) ───────────────────
  const { data: subUser } = await supabase
    .from('portal_users')
    .select('id, account_id, password_hash, modules, is_owner, agent_ids')
    .eq('email', normalizedEmail)
    .maybeSingle();

  if (subUser?.password_hash) {
    const ok = await verifyPassword(password, subUser.password_hash);
    if (!ok) return NextResponse.json({ error: 'Credenciales incorrectas' }, { status: 401 });

    // Route to the agent(s) the sub-user has access to.
    // If agent_ids is set, only their assigned agents are valid targets.
    let agentQuery = supabase.from('voice_agents').select('portal_token').eq('portal_email', subUser.account_id).limit(1);
    const agentIds: string[] = (subUser as Record<string, unknown>).agent_ids as string[] ?? [];
    if (agentIds.length > 0) agentQuery = agentQuery.in('id', agentIds);

    const { data: targetAgent } = await agentQuery.maybeSingle();
    if (!targetAgent?.portal_token)
      return NextResponse.json({ error: 'Cuenta no encontrada' }, { status: 404 });

    const sessionToken = subUser.is_owner
      ? await createSession(subUser.account_id)
      : await createSubUserSession(subUser.account_id, subUser.id, subUser.modules ?? []);

    const res = NextResponse.json({ token: targetAgent.portal_token });
    COOKIE_OPTS(res, sessionToken);
    return res;
  }

  // ── 2. Fall back to voice_agents owner login ────────────────────────────
  const { data: agents } = await supabase
    .from('voice_agents')
    .select('id, portal_token, portal_password_hash')
    .eq('portal_email', normalizedEmail)
    .limit(1);

  const agent = agents?.[0];
  if (!agent?.portal_password_hash)
    return NextResponse.json({ error: 'Credenciales incorrectas' }, { status: 401 });

  const ok = await verifyPassword(password, agent.portal_password_hash);
  if (!ok) return NextResponse.json({ error: 'Credenciales incorrectas' }, { status: 401 });

  const sessionToken = await createSession(normalizedEmail);
  const res = NextResponse.json({ token: agent.portal_token });
  COOKIE_OPTS(res, sessionToken);
  return res;
}
