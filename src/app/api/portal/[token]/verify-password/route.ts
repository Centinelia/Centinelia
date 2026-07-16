import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifySession, verifyPassword, PORTAL_COOKIE } from '@/lib/portal/auth';
import { rateLimit, limiters } from '@/lib/ratelimit';

interface Params { params: Promise<{ token: string }> }

export async function POST(req: NextRequest, { params }: Params) {
  const limited = await rateLimit(req, limiters.auth);
  if (limited) return limited;

  const cookie = req.cookies.get(PORTAL_COOKIE)?.value ?? '';
  const auth   = await verifySession(cookie);
  if (!auth || auth.isSubUser) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const { token }    = await params;
  const { password } = await req.json() as { password?: string };
  if (!password)     return NextResponse.json({ error: 'Falta la contraseña' }, { status: 400 });

  const supabase = createAdminClient();
  const { data: agent } = await supabase
    .from('voice_agents')
    .select('portal_password_hash')
    .eq('portal_token', token)
    .single();

  if (!agent?.portal_password_hash)
    return NextResponse.json({ error: 'Sin contraseña configurada' }, { status: 404 });

  const ok = await verifyPassword(password, agent.portal_password_hash);
  if (!ok) return NextResponse.json({ error: 'Contraseña incorrecta' }, { status: 403 });

  return NextResponse.json({ ok: true });
}
