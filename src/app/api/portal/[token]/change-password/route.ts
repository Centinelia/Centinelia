import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifySession, verifyPassword, hashPassword, PORTAL_COOKIE } from '@/lib/portal/auth';
import { resolveOrgFromToken } from '@/lib/portal/org-token';
import { rateLimit, limiters } from '@/lib/ratelimit';

interface Params { params: Promise<{ token: string }> }

export async function POST(req: NextRequest, { params }: Params) {
  const limited = await rateLimit(req, limiters.auth);
  if (limited) return limited;

  const cookie = req.cookies.get(PORTAL_COOKIE)?.value ?? '';
  const auth   = await verifySession(cookie);
  if (!auth) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  if (auth.isSubUser) return NextResponse.json({ error: 'Solo el dueño puede cambiar la contraseña de la cuenta.' }, { status: 403 });

  const { token } = await params;
  const { current_password, new_password } = await req.json() as {
    current_password?: string;
    new_password?:     string;
  };

  if (!current_password) return NextResponse.json({ error: 'Falta la contraseña actual.' }, { status: 400 });
  if (!new_password)     return NextResponse.json({ error: 'Falta la contraseña nueva.'  }, { status: 400 });
  if (new_password.length < 8)
    return NextResponse.json({ error: 'La contraseña nueva debe tener al menos 8 caracteres.' }, { status: 400 });
  if (new_password === current_password)
    return NextResponse.json({ error: 'La contraseña nueva debe ser distinta de la actual.' }, { status: 400 });

  const resolved = await resolveOrgFromToken(token);
  if (!resolved) return NextResponse.json({ error: 'Token inválido.' }, { status: 401 });

  if (!auth.portalEmail || auth.portalEmail !== resolved.portalEmail)
    return NextResponse.json({ error: 'No autorizado.' }, { status: 403 });

  const supabase = createAdminClient();

  // Cargar hash actual desde organizations, fallback a voice_agents legacy (mismo patrón que verify-password)
  const { data: org } = await supabase
    .from('organizations').select('portal_password_hash').eq('portal_email', resolved.portalEmail).maybeSingle() as { data: { portal_password_hash: string | null } | null };

  let currentHash: string | null = org?.portal_password_hash ?? null;
  if (!currentHash) {
    const { data: legacy } = await supabase
      .from('voice_agents').select('portal_password_hash')
      .eq('portal_email', resolved.portalEmail)
      .not('portal_password_hash', 'is', null).limit(1).maybeSingle() as { data: { portal_password_hash: string | null } | null };
    currentHash = legacy?.portal_password_hash ?? null;
  }

  if (!currentHash) return NextResponse.json({ error: 'Sin contraseña configurada — usa el flujo de setup.' }, { status: 404 });

  const currentOk = await verifyPassword(current_password, currentHash);
  if (!currentOk) return NextResponse.json({ error: 'La contraseña actual no es correcta.' }, { status: 403 });

  const newHash = await hashPassword(new_password);

  // Dual-write: organizations (fuente de verdad) + voice_agents (retrocompat)
  const { error: orgErr } = await supabase
    .from('organizations')
    .update({ portal_password_hash: newHash })
    .eq('portal_email', resolved.portalEmail);
  if (orgErr) return NextResponse.json({ error: orgErr.message }, { status: 500 });

  await supabase
    .from('voice_agents')
    .update({ portal_password_hash: newHash })
    .eq('portal_email', resolved.portalEmail)
    .not('portal_password_hash', 'is', null);

  return NextResponse.json({ ok: true });
}
