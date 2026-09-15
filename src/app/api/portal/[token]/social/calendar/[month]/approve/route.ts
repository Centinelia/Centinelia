/**
 * POST /api/portal/[token]/social/calendar/[month]/approve
 *
 * Aprueba el calendario editorial del mes, marcando:
 *   status = 'approved'
 *   approved_by = session.portalEmail
 *   approved_at = now()
 *
 * El parámetro [month] tiene formato 'YYYY-MM'. Se convierte a 'YYYY-MM-01'.
 *
 * Seguridad: session + IDOR + feature flag (via guardPortalSocialRequest).
 */
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { guardPortalSocialRequest, isNextResponse } from '@/lib/social/portal-guards';

interface Params { params: Promise<{ token: string; month: string }> }

export async function POST(req: NextRequest, { params }: Params) {
  const { token, month } = await params;

  const guard = await guardPortalSocialRequest(req, token);
  if (isNextResponse(guard)) return guard;
  const { resolved, session, supabase } = guard;

  const monthDate = `${month}-01`;

  // Verificar que el calendario existe y pertenece a esta org
  const { data: calendar, error: fetchErr } = await supabase
    .from('editorial_calendars')
    .select('id, portal_email, status')
    .eq('portal_email', resolved.portalEmail)
    .eq('month', monthDate)
    .maybeSingle();

  if (fetchErr) {
    return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  }
  if (!calendar) {
    return NextResponse.json(
      { error: `No existe calendario para el mes ${month}` },
      { status: 404 },
    );
  }

  const now = new Date().toISOString();

  const { data: updated, error: updateErr } = await supabase
    .from('editorial_calendars')
    .update({
      status:      'approved',
      approved_by: session.portalEmail,
      approved_at: now,
      updated_at:  now,
    })
    .eq('id', calendar.id)
    .eq('portal_email', resolved.portalEmail)
    .select()
    .single();

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, data: updated });
}
