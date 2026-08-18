import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';
import { getPrimaryAgentFromToken } from '@/lib/portal/org-token';
import { getOrgAgentIds } from '@/lib/portal/roster';

interface Params { params: Promise<{ token: string; id: string }> }

export async function PATCH(req: NextRequest, { params }: Params) {
  const cookie  = req.cookies.get(PORTAL_COOKIE)?.value ?? '';
  const session = await verifySession(cookie);
  if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const { token, id } = await params;
  const body = await req.json();
  const supabase = createAdminClient();

  const agent = await getPrimaryAgentFromToken<{ id: string; portal_email: string | null }>(token, 'id, portal_email', supabase);
  if (!agent || agent.portal_email !== session.portalEmail) return NextResponse.json({ error: 'No autorizado' }, { status: 403 });

  const allowed = ['status', 'nombre', 'telefono', 'items', 'tipo', 'direccion', 'notas'];
  const update = Object.fromEntries(Object.entries(body).filter(([k]) => allowed.includes(k)));

  // Org-scoped. Ver [[handoff-peer-discrimination-fix]] audit 2026-08-18.
  const roster = await getOrgAgentIds(supabase, agent.portal_email, agent.id);
  const { data, error } = await supabase
    .from('orders_voice').update(update).eq('id', id).in('agent_id', roster).select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
