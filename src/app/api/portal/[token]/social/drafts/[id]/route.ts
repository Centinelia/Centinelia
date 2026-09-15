/**
 * PATCH /api/portal/[token]/social/drafts/[id]
 *
 * Aprueba, rechaza o edita un borrador de contenido.
 *
 * Body: {
 *   action: 'approve' | 'reject' | 'edit',
 *   caption?: string,
 *   hashtags?: string[],
 *   scheduled_for?: string,   // ISO timestamp
 *   media_urls?: string[],
 * }
 *
 * Reglas de aprobación (R39):
 *   - approved_by = session.portalEmail (usuario real logueado, no org email)
 *   - Approve: status = 'scheduled' si scheduled_for existe, si no 'approved'
 *   - Reject: status = 'rejected'
 *   - Edit: actualiza campos proporcionados
 *
 * Seguridad: session + IDOR (guard + verificación row) + feature flag.
 */
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { guardPortalSocialRequest, isNextResponse } from '@/lib/social/portal-guards';

interface Params { params: Promise<{ token: string; id: string }> }

interface PatchBody {
  action: 'approve' | 'reject' | 'edit';
  caption?: string;
  hashtags?: string[];
  scheduled_for?: string;
  media_urls?: string[];
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const { token, id } = await params;

  const guard = await guardPortalSocialRequest(req, token);
  if (isNextResponse(guard)) return guard;
  const { resolved, session, supabase } = guard;

  // Verificar que el borrador pertenece a esta org (IDOR)
  const { data: draft, error: fetchErr } = await supabase
    .from('content_drafts')
    .select('*')
    .eq('id', id)
    .eq('portal_email', resolved.portalEmail)
    .maybeSingle();

  if (fetchErr) {
    return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  }
  if (!draft) {
    return NextResponse.json({ error: 'Borrador no encontrado o sin acceso' }, { status: 403 });
  }

  let body: PatchBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Body JSON inválido' }, { status: 400 });
  }

  if (!body.action || !['approve', 'reject', 'edit'].includes(body.action)) {
    return NextResponse.json(
      { error: 'action debe ser: approve, reject o edit' },
      { status: 400 },
    );
  }

  const now = new Date().toISOString();

  if (body.action === 'approve') {
    // approved_by = session.portalEmail (R39: usuario real logueado)
    const newStatus = draft.scheduled_for ? 'scheduled' : 'approved';
    const { error: updateErr } = await supabase
      .from('content_drafts')
      .update({
        status:       newStatus,
        approved_by:  session.portalEmail,
        approved_at:  now,
        updated_at:   now,
      })
      .eq('id', id)
      .eq('portal_email', resolved.portalEmail);

    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }
  } else if (body.action === 'reject') {
    const { error: updateErr } = await supabase
      .from('content_drafts')
      .update({ status: 'rejected', updated_at: now })
      .eq('id', id)
      .eq('portal_email', resolved.portalEmail);

    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }
  } else if (body.action === 'edit') {
    const updates: Record<string, unknown> = { updated_at: now };
    if (body.caption       !== undefined) updates.caption       = body.caption;
    if (body.hashtags      !== undefined) updates.hashtags      = body.hashtags;
    if (body.scheduled_for !== undefined) updates.scheduled_for = body.scheduled_for;
    if (body.media_urls    !== undefined) updates.media_urls    = body.media_urls;

    const { error: updateErr } = await supabase
      .from('content_drafts')
      .update(updates)
      .eq('id', id)
      .eq('portal_email', resolved.portalEmail);

    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }
  }

  // Devolver el row actualizado
  const { data: updated, error: refetchErr } = await supabase
    .from('content_drafts')
    .select('*')
    .eq('id', id)
    .eq('portal_email', resolved.portalEmail)
    .maybeSingle();

  if (refetchErr) {
    return NextResponse.json({ error: refetchErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, data: updated });
}
