// A-D1: portal API para dispatch_assignments (Nova viewer + status updates).
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

  const status = req.nextUrl.searchParams.get('status');
  let q = supabase
    .from('dispatch_assignments')
    .select('id, service_description, location, priority, unidad_nombre, unidad_telefono, status, requested_by_name, requested_by_phone, eta_minutes, notes, created_at, updated_at')
    .eq('portal_email', resolved.portalEmail)
    .order('created_at', { ascending: false })
    .limit(100);
  if (status && ['pendiente','asignado','en_ruta','completado','cancelado'].includes(status)) {
    q = q.eq('status', status);
  }
  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ assignments: data ?? [] });
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

  const body = await req.json() as { id?: string; status?: string; unidad_nombre?: string; unidad_telefono?: string; eta_minutes?: number; notes?: string };
  if (!body.id) return NextResponse.json({ error: 'id requerido' }, { status: 400 });

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.status && ['pendiente','asignado','en_ruta','completado','cancelado'].includes(body.status)) patch.status = body.status;
  if (body.unidad_nombre !== undefined) patch.unidad_nombre = body.unidad_nombre?.trim() || null;
  if (body.unidad_telefono !== undefined) patch.unidad_telefono = body.unidad_telefono?.trim() || null;
  if (typeof body.eta_minutes === 'number') patch.eta_minutes = body.eta_minutes;
  if (body.notes !== undefined) patch.notes = body.notes?.trim() || null;

  const { error } = await supabase
    .from('dispatch_assignments')
    .update(patch)
    .eq('id', body.id)
    .eq('portal_email', resolved.portalEmail);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
