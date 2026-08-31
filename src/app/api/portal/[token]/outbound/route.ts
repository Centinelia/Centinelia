import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requirePortalAccess } from '@/lib/portal/access';
import { getPrimaryAgentFromToken } from '@/lib/portal/org-token';

interface Params { params: Promise<{ token: string }> }

export async function POST(req: NextRequest, { params }: Params) {
  const { token } = await params;
  const supabase = createAdminClient();

  // Gate llamadas salientes — vacía el pool del owner. Sub-user necesita
  // módulo 'llamadas' o 'campanas'. Ver Scope D3 CRIT-3.
  const gate = await requirePortalAccess(req, { module: ['llamadas', 'campanas'] });
  if (!gate.ok) return gate.response;
  const session = gate.session;

  const agent = await getPrimaryAgentFromToken<{ id: string; features: Record<string, unknown> | null; portal_email: string | null }>(token, 'id, features, portal_email', supabase);
  if (!agent || agent.portal_email !== session.portalEmail) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const features = (agent.features ?? {}) as Record<string, boolean>;
  if (!features.outbound_calls) {
    return NextResponse.json({ error: 'Función no habilitada en este plan' }, { status: 403 });
  }

  const body = await req.json() as {
    telefono?: string;
    nombre?: string;
    motivo?: string;
    scheduled_at?: string;
  };

  const { telefono, nombre, motivo, scheduled_at } = body;

  if (!telefono || !motivo || !scheduled_at) {
    return NextResponse.json(
      { error: 'Se requieren: telefono, motivo y scheduled_at' },
      { status: 400 },
    );
  }

  const { data, error } = await supabase
    .from('outbound_contacts')
    .insert({
      agent_id:     agent.id,
      telefono:     telefono.trim(),
      nombre:       nombre?.trim() || null,
      motivo:       motivo.trim(),
      scheduled_at,
      status:       'pending',
    })
    .select('*')
    .single();

  if (error) {
    console.error('[portal/outbound] insert error:', error.message);
    return NextResponse.json({ error: 'Error al programar la llamada' }, { status: 500 });
  }

  const { recordOutboundCreation } = await import('@/lib/state-machines/outbound-contact');
  await recordOutboundCreation({
    supabase,
    contactId: data!.id as string,
    actor:     'user',
    reason:    'portal_manual_add',
    metadata:  { agent_id: agent.id, telefono },
  });

  // Event-driven: si scheduled_at ya venció (o es "ya"), dispara el runner.
  // Si está en el futuro, cron horario lo agarra.
  if (new Date(scheduled_at) <= new Date()) {
    const { triggerOutboundContacts } = await import('@/lib/outbound/outbound-trigger');
    triggerOutboundContacts(`portal outbound contact ${data!.id}`, agent.id);
  }

  return NextResponse.json({ ok: true, contact: data });
}
