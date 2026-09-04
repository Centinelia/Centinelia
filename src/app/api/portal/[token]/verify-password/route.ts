import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifySession, verifyPassword, PORTAL_COOKIE } from '@/lib/portal/auth';
import { resolveOrgFromToken } from '@/lib/portal/org-token';
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
  const resolved = await resolveOrgFromToken(token);
  if (!resolved) return NextResponse.json({ error: 'Sin contraseña configurada' }, { status: 404 });

  if (!auth.portalEmail || auth.portalEmail !== resolved.portalEmail)
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });

  // Fuente de verdad: organizations.portal_password_hash. Fallback a voice_agents legacy.
  const { data: org } = await supabase
    .from('organizations').select('portal_password_hash').eq('portal_email', resolved.portalEmail).maybeSingle() as { data: { portal_password_hash: string | null } | null };

  let hash: string | null = org?.portal_password_hash ?? null;
  if (!hash) {
    const { data: agent } = await supabase
      .from('voice_agents').select('portal_password_hash')
      .eq('portal_email', resolved.portalEmail)
      .not('portal_password_hash', 'is', null).limit(1).maybeSingle() as { data: { portal_password_hash: string | null } | null };
    hash = agent?.portal_password_hash ?? null;
  }

  if (!hash) return NextResponse.json({ error: 'Sin contraseña configurada' }, { status: 404 });

  const ok = await verifyPassword(password, hash);
  if (!ok) return NextResponse.json({ error: 'Contraseña incorrecta' }, { status: 403 });

  return NextResponse.json({ ok: true });
}
