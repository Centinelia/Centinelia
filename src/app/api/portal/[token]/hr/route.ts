// A-D2: portal API para hr_records (Naia viewer + approve/reject).
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requirePortalAccess } from '@/lib/portal/access';
import { resolveOrgFromToken } from '@/lib/portal/org-token';

interface Params { params: Promise<{ token: string }> }

export async function GET(req: NextRequest, { params }: Params) {
  const { token } = await params;
  const gate = await requirePortalAccess(req, { module: 'of_bandeja' });
  if (!gate.ok) return gate.response;

  const supabase = createAdminClient();
  const resolved = await resolveOrgFromToken(token);
  if (!resolved || resolved.portalEmail !== gate.session.portalEmail) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }

  const recordType = req.nextUrl.searchParams.get('type');
  let q = supabase
    .from('hr_records')
    .select('id, employee_name, record_type, start_date, end_date, reason, status, approved_by, notes, created_at')
    .eq('portal_email', resolved.portalEmail)
    .order('start_date', { ascending: false })
    .limit(200);
  if (recordType && ['falta','vacaciones','permiso','incidencia'].includes(recordType)) {
    q = q.eq('record_type', recordType);
  }
  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ records: data ?? [] });
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const { token } = await params;
  const gate = await requirePortalAccess(req, { module: 'of_bandeja' });
  if (!gate.ok) return gate.response;

  const supabase = createAdminClient();
  const resolved = await resolveOrgFromToken(token);
  if (!resolved || resolved.portalEmail !== gate.session.portalEmail) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }

  const body = await req.json() as { id?: string; status?: string; notes?: string };
  if (!body.id) return NextResponse.json({ error: 'id requerido' }, { status: 400 });
  if (body.status && !['registrada','aprobada','rechazada','cancelada'].includes(body.status)) {
    return NextResponse.json({ error: 'status inválido' }, { status: 400 });
  }

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.status) {
    patch.status = body.status;
    if (['aprobada','rechazada'].includes(body.status)) {
      patch.approved_by = gate.session.userId ?? gate.session.portalEmail;
    }
  }
  if (body.notes !== undefined) patch.notes = body.notes?.trim() || null;

  const { error } = await supabase
    .from('hr_records')
    .update(patch)
    .eq('id', body.id)
    .eq('portal_email', resolved.portalEmail);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
