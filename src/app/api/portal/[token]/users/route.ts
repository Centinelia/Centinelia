import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifySession, PORTAL_COOKIE, hashPassword } from '@/lib/portal/auth';
import { cookies } from 'next/headers';

async function getOwnerEmail(token: string): Promise<string | null> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from('voice_agents').select('portal_email').eq('portal_token', token).single();
  return data?.portal_email ?? null;
}

async function requireUsersAccess(token: string): Promise<
  | { accountId: string; isOwner: boolean; actorUserId?: string }
  | NextResponse
> {
  const cookieStore   = await cookies();
  const sessionCookie = cookieStore.get(PORTAL_COOKIE)?.value ?? '';
  const session       = await verifySession(sessionCookie);

  const accountId = await getOwnerEmail(token);
  if (!accountId) return NextResponse.json({ error: 'Token inválido' }, { status: 404 });

  if (process.env.NODE_ENV === 'development') {
    return { accountId, isOwner: true };
  }

  if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  if (session.portalEmail !== accountId)
    return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 });

  if (!session.isSubUser) return { accountId, isOwner: true };
  if (!(session.modules ?? []).includes('usuarios'))
    return NextResponse.json({ error: 'No tienes acceso al módulo Usuarios y permisos' }, { status: 403 });

  return { accountId, isOwner: false, actorUserId: session.userId };
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const check     = await requireUsersAccess(token);
  if (check instanceof NextResponse) return check;

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('portal_users')
    .select('id, email, name, modules, agent_ids, is_owner, created_at')
    .eq('account_id', check.accountId)
    .order('created_at', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ users: data ?? [] });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const check     = await requireUsersAccess(token);
  if (check instanceof NextResponse) return check;

  const body = await req.json() as {
    email?:    string;
    name?:     string;
    password?: string;
    modules?:  string[];
  };

  if (!body.email || !body.password)
    return NextResponse.json({ error: 'Email y contraseña son requeridos' }, { status: 400 });

  const email = body.email.toLowerCase().trim();
  if (email === check.accountId)
    return NextResponse.json({ error: 'No puedes crear un sub-usuario con el mismo correo del propietario' }, { status: 400 });

  const passwordHash = await hashPassword(body.password);
  const supabase     = createAdminClient();

  const { data, error } = await supabase
    .from('portal_users')
    .insert({
      account_id:    check.accountId,
      email,
      name:          body.name?.trim() || null,
      password_hash: passwordHash,
      modules:       body.modules ?? [],
      is_owner:      false,
    })
    .select('id, email, name, modules, created_at')
    .single();

  if (error) {
    if (error.code === '23505')
      return NextResponse.json({ error: 'Este correo ya está registrado' }, { status: 409 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Sync a organizations.directory (fuente única de humanos de la org).
  if (data?.id) {
    const { upsertPortalUserInDirectory } = await import('@/lib/portal/directory');
    await upsertPortalUserInDirectory(check.accountId, data.id as string, (data.name as string | null) ?? null, supabase);
  }

  return NextResponse.json({ user: data }, { status: 201 });
}
