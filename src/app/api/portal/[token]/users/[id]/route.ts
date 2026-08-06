import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifySession, PORTAL_COOKIE, hashPassword } from '@/lib/portal/auth';
import { cookies } from 'next/headers';

async function requireUsersAccess(token: string): Promise<
  | { accountId: string; isOwner: boolean; actorUserId?: string }
  | NextResponse
> {
  const supabase     = createAdminClient();
  const { data: ag } = await supabase
    .from('voice_agents').select('portal_email').eq('portal_token', token).single();
  const accountId = ag?.portal_email;
  if (!accountId) return NextResponse.json({ error: 'Token inválido' }, { status: 404 });

  if (process.env.NODE_ENV === 'development') {
    return { accountId, isOwner: true };
  }

  const cookieStore = await cookies();
  const session     = await verifySession(cookieStore.get(PORTAL_COOKIE)?.value ?? '');
  if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  if (session.portalEmail !== accountId)
    return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 });

  if (!session.isSubUser) return { accountId, isOwner: true };
  if (!(session.modules ?? []).includes('usuarios'))
    return NextResponse.json({ error: 'No tienes acceso al módulo Usuarios y permisos' }, { status: 403 });

  return { accountId, isOwner: false, actorUserId: session.userId };
}

// Validaciones extra que aplican solo a sub-usuarios delegados:
//   - No pueden modificar al owner
//   - No pueden modificarse a sí mismos (evita self-lockout)
async function assertCanModifyTarget(
  accountId: string,
  targetId: string,
  isOwner: boolean,
  actorUserId?: string,
): Promise<NextResponse | null> {
  if (isOwner) return null;

  const supabase = createAdminClient();
  const { data: target } = await supabase
    .from('portal_users')
    .select('id, is_owner')
    .eq('id', targetId)
    .eq('account_id', accountId)
    .maybeSingle();

  if (!target) return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 });
  if (target.is_owner)
    return NextResponse.json({ error: 'Solo el propietario puede modificar al propietario' }, { status: 403 });
  if (actorUserId && target.id === actorUserId)
    return NextResponse.json({ error: 'No puedes modificar tu propio acceso' }, { status: 403 });
  return null;
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ token: string; id: string }> },
) {
  const { token, id } = await params;
  const check = await requireUsersAccess(token);
  if (check instanceof NextResponse) return check;

  const forbid = await assertCanModifyTarget(check.accountId, id, check.isOwner, check.actorUserId);
  if (forbid) return forbid;

  const body = await req.json() as {
    name?:     string;
    modules?:  string[];
    password?: string;
  };

  const updates: Record<string, unknown> = {};
  if ('name'    in body) updates.name    = body.name?.trim() || null;
  if ('modules' in body) updates.modules = body.modules ?? [];
  if (body.password)     updates.password_hash = await hashPassword(body.password);

  if (Object.keys(updates).length === 0)
    return NextResponse.json({ error: 'Nada que actualizar' }, { status: 400 });

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('portal_users')
    .update(updates)
    .eq('id', id)
    .eq('account_id', check.accountId)
    .select('id, email, name, modules, is_owner')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 });
  return NextResponse.json({ user: data });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string; id: string }> },
) {
  const { token, id } = await params;
  const check = await requireUsersAccess(token);
  if (check instanceof NextResponse) return check;

  const forbid = await assertCanModifyTarget(check.accountId, id, check.isOwner, check.actorUserId);
  if (forbid) return forbid;

  const supabase = createAdminClient();
  const { error } = await supabase
    .from('portal_users')
    .delete()
    .eq('id', id)
    .eq('account_id', check.accountId)
    .eq('is_owner', false); // guardarraíl adicional: nunca borrar al owner

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return new NextResponse(null, { status: 204 });
}
