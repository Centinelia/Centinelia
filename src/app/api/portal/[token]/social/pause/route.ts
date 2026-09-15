/**
 * POST /api/portal/[token]/social/pause
 *
 * Pausa publicaciones sociales. Modo unificado en social_accounts.paused (R34):
 *
 *   Si body.social_account_id → verifica que pertenezca a esta org y pausa ESE row.
 *   Si body.agent_id → busca TODAS las social_accounts activas del agente en esta org
 *     y pausa todas (puede ser >1 en modo agencia).
 *   Si ninguno → 400.
 *
 * Body: { agent_id?: string, social_account_id?: string, reason?: string }
 *
 * Retorna: { ok: true, paused: N }  (N = número de rows pausados)
 *
 * Seguridad: session + IDOR + feature flag (via guardPortalSocialRequest).
 * NOTA: voice_agents.metadata NO existe — la pausa vive en social_accounts.paused.
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

  let body: { agent_id?: string; social_account_id?: string; reason?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Body JSON inválido' }, { status: 400 });
  }

  const { agent_id: agentId, social_account_id: socialAccountId, reason } = body;
  const now = new Date().toISOString();

  if (socialAccountId) {
    // Modo por cuenta individual: verificar ownership (IDOR) y pausar
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
      .update({ paused: true, paused_reason: reason ?? null, paused_at: now })
      .eq('id', socialAccountId)
      .eq('portal_email', resolved.portalEmail);

    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, paused: 1 });
  }

  if (agentId) {
    // Modo por agente: pausar todas las cuentas activas del agente en esta org
    const { data: accounts, error: fetchErr } = await supabase
      .from('social_accounts')
      .select('id')
      .eq('agent_id', agentId)
      .eq('portal_email', resolved.portalEmail)
      .eq('paused', false);

    if (fetchErr) {
      return NextResponse.json({ error: fetchErr.message }, { status: 500 });
    }

    const ids = (accounts ?? []).map((a: { id: string }) => a.id);
    if (ids.length === 0) {
      return NextResponse.json({ ok: true, paused: 0 });
    }

    const { error: updateErr } = await supabase
      .from('social_accounts')
      .update({ paused: true, paused_reason: reason ?? null, paused_at: now })
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
