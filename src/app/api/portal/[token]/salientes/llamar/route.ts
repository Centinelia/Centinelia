import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';
import { triggerOutboundCall } from '@/lib/vapi/outbound';

interface Params { params: Promise<{ token: string }> }

export async function POST(req: NextRequest, { params }: Params) {
  const cookie  = req.cookies.get(PORTAL_COOKIE)?.value ?? '';
  const session = await verifySession(cookie);
  if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const { token } = await params;
  const supabase  = createAdminClient();

  // Verify the portal token belongs to this session
  const { data: portalAgent } = await supabase
    .from('voice_agents')
    .select('id, portal_email')
    .eq('portal_token', token)
    .eq('portal_email', session.portalEmail)
    .single();

  if (!portalAgent) return NextResponse.json({ error: 'No autorizado' }, { status: 403 });

  const body = await req.json() as { contactIds: string[]; agentId?: string };
  const { contactIds, agentId } = body;
  if (!contactIds?.length) return NextResponse.json({ error: 'Se requieren contactIds' }, { status: 400 });

  // Resolve which agent makes the calls:
  // if agentId is provided and belongs to the same client, use it; otherwise use the portal agent
  const targetId = agentId ?? portalAgent.id;
  const { data: agent } = await supabase
    .from('voice_agents')
    .select('*')
    .eq('id', targetId)
    .eq('portal_email', session.portalEmail)
    .single();

  if (!agent) return NextResponse.json({ error: 'Agente no encontrado o no autorizado' }, { status: 403 });
  if (!agent.features?.outbound_calls) {
    return NextResponse.json({ error: 'Este agente no tiene llamadas salientes activas' }, { status: 403 });
  }
  if (!agent.vapi_agent_id) {
    return NextResponse.json({ error: 'El agente no está sincronizado con Vapi' }, { status: 400 });
  }

  // Contacts must belong to the portal's own agent (where they were captured)
  const { data: contacts } = await supabase
    .from('outbound_contacts')
    .select('*')
    .eq('agent_id', portalAgent.id)
    .in('id', contactIds);

  if (!contacts?.length) return NextResponse.json({ error: 'Contactos no encontrados' }, { status: 404 });

  const results: Array<{ id: string; ok: boolean; error?: string }> = [];

  for (const contact of contacts) {
    const result = await triggerOutboundCall({
      agent:          agent as any,
      customerNumber: contact.telefono,
      customerName:   contact.nombre ?? undefined,
      motivo:         contact.motivo ?? undefined,
    });

    results.push({ id: contact.id, ...result });

    if (result.ok) {
      await supabase
        .from('outbound_contacts')
        .update({ status: 'calling' })
        .eq('id', contact.id);

      await supabase.from('outbound_calls').insert({
        agent_id:     agent.id,
        contact_id:   contact.id,
        telefono:     contact.telefono,
        nombre:       contact.nombre ?? null,
        motivo:       contact.motivo ?? null,
        vapi_call_id: result.callId ?? null,
        status:       'calling',
        called_at:    new Date().toISOString(),
      });
    } else {
      await supabase
        .from('outbound_contacts')
        .update({ status: 'failed' })
        .eq('id', contact.id);
    }
  }

  const triggered = results.filter(r => r.ok).length;
  const failed    = results.filter(r => !r.ok).length;

  return NextResponse.json({ ok: true, triggered, failed, results });
}
