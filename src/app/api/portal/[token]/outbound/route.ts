import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';
import { getPrimaryAgentFromToken } from '@/lib/portal/org-token';

interface Params { params: Promise<{ token: string }> }

export async function POST(req: NextRequest, { params }: Params) {
  const { token } = await params;
  const supabase = createAdminClient();

  const cookie  = req.cookies.get(PORTAL_COOKIE)?.value ?? '';
  const session = await verifySession(cookie);
  if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

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
    triggerOutboundContacts(`portal outbound contact ${data!.id}`, session.portalEmail);
  }

  return NextResponse.json({ ok: true, contact: data });
}
