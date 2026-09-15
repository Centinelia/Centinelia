/**
 * DELETE /api/portal/[token]/social/accounts/[id]
 *
 * Elimina una cuenta social verificando que pertenece a la org del portal.
 *
 * Seguridad: session + IDOR (guard + verificación del row) + feature flag.
 */
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { guardPortalSocialRequest, isNextResponse } from '@/lib/social/portal-guards';

interface Params { params: Promise<{ token: string; id: string }> }

export async function DELETE(req: NextRequest, { params }: Params) {
  const { token, id } = await params;

  const guard = await guardPortalSocialRequest(req, token);
  if (isNextResponse(guard)) return guard;
  const { resolved, supabase } = guard;

  // Verificar que la cuenta pertenece a esta org (IDOR)
  const { data: account, error: fetchErr } = await supabase
    .from('social_accounts')
    .select('id, portal_email')
    .eq('id', id)
    .eq('portal_email', resolved.portalEmail)
    .maybeSingle();

  if (fetchErr) {
    return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  }
  if (!account) {
    return NextResponse.json({ error: 'Cuenta no encontrada o sin acceso' }, { status: 403 });
  }

  const { error: deleteErr } = await supabase
    .from('social_accounts')
    .delete()
    .eq('id', id)
    .eq('portal_email', resolved.portalEmail);

  if (deleteErr) {
    return NextResponse.json({ error: deleteErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
