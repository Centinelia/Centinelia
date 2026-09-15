/**
 * POST /api/portal/[token]/social/resume
 *
 * Reanuda publicaciones sociales pausadas. Simétrico a /pause.
 * Limpia paused, paused_reason y paused_at en social_accounts.
 *
 *   Si body.social_account_id → verifica ownership y reactiva ESE row.
 *   Si body.agent_id → reactiva TODAS las cuentas pausadas del agente en esta org.
 *   Si ninguno → 400.
 *
 * Body: { agent_id?: string, social_account_id?: string }
 *
 * Retorna: { ok: true, paused: N }  (N = número de rows reactivados)
 *
 * Seguridad: session + IDOR + feature flag (via guardPortalSocialRequest).
 */
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { guardPortalSocialRequest, isNextResponse } from '@/lib/social/portal-guards';

interface Params { params: Promise<{ token: string }> }

export async function POST(req: NextRequest, { params }: Params) {
  const { token } = await params;

  const guard = await guardPortalSocialRequest(req, token);
  if (isNextResponse(guard)) return guard;
  const { resolved, supabase } = guard;

  let body: { agent_id?: string; social_account_id?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Body JSON inválido' }, { status: 400 });
  }

  const { agent_id: agentId, social_account_id: socialAccountId } = body;

  if (socialAccountId) {
    // Modo por cuenta individual: verificar ownership (IDOR) y reactivar
    const { data: account, error: fetchErr } = await supabase
      .from('social_accounts')
      .select('id, portal_email')
      .eq('id', socialAccountId)
      .eq('portal_email', resolved.portalEmail)
      .maybeSingle();

    if (fetchErr) {
      return NextResponse.json({ error: fetchErr.message }, { status: 500 });
    }
    if (!account) {
      return NextResponse.json(
        { error: 'Cuenta social no encontrada o sin acceso' },
        { status: 403 },
      );
    }

    const { error: updateErr } = await supabase
      .from('social_accounts')
      .update({ paused: false, paused_reason: null, paused_at: null })
      .eq('id', socialAccountId)
      .eq('portal_email', resolved.portalEmail);

    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, paused: 1 });
  }

  if (agentId) {
    // Modo por agente: reactivar todas las cuentas pausadas del agente en esta org
    const { data: accounts, error: fetchErr } = await supabase
      .from('social_accounts')
      .select('id')
      .eq('agent_id', agentId)
      .eq('portal_email', resolved.portalEmail)
      .eq('paused', true);

    if (fetchErr) {
      return NextResponse.json({ error: fetchErr.message }, { status: 500 });
    }

    const ids = (accounts ?? []).map((a: { id: string }) => a.id);
    if (ids.length === 0) {
      return NextResponse.json({ ok: true, paused: 0 });
    }

    const { error: updateErr } = await supabase
      .from('social_accounts')
      .update({ paused: false, paused_reason: null, paused_at: null })
      .in('id', ids)
      .eq('portal_email', resolved.portalEmail);

    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, paused: ids.length });
  }

  return NextResponse.json(
    { error: 'Se requiere agent_id o social_account_id' },
    { status: 400 },
  );
}
