import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requirePortalAccess } from '@/lib/portal/access';
import { getAgentAccess } from '@/lib/portal/agent-access';
import { triggerOutboundCall } from '@/lib/vapi/outbound';
import { checkAccount } from '@/lib/compliance/account-guard';

interface Params { params: Promise<{ token: string }> }

export async function POST(req: NextRequest, { params }: Params) {
  // Gate llamadas bulk (bulk=500 contactos con 1 request). Ver Scope D3 CRIT-3.
  const gate = await requirePortalAccess(req, { module: ['llamadas', 'campanas'] });
  if (!gate.ok) return gate.response;
  const session = gate.session;

  const { token } = await params;
  const supabase  = createAdminClient();

  const access = await getAgentAccess(token, req);
  if (!access || access.portalEmail !== session.portalEmail) return NextResponse.json({ error: 'No autorizado' }, { status: 403 });

  // Account guard
  const guard = await checkAccount(access.portalEmail, supabase);
  if (!guard.canOperate) {
    return NextResponse.json({ error: `Cuenta ${guard.status}. No se pueden hacer llamadas salientes.` }, { status: 403 });
  }

  const body = await req.json() as { contactIds: string[]; agentId?: string };
  const { contactIds, agentId } = body;
  if (!contactIds?.length) return NextResponse.json({ error: 'Se requieren contactIds' }, { status: 400 });

  // Resolve which agent makes the calls:
  // si agentId viene del body, debe estar dentro del roster accesible;
  // si no, se usa el primer meerkat activo del roster (fallback determinístico).
  const targetId = agentId ?? access.primaryId;
  if (!access.ids.includes(targetId)) {
    return NextResponse.json({ error: 'Empleado no válido para este portal' }, { status: 403 });
  }
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

  // Contacts pueden pertenecer a cualquier peer del org, no solo al primary.
  // El agente que ejecuta la llamada sí es targetId (elegido por el usuario).
  const { data: contacts } = await supabase
    .from('outbound_contacts')
    .select('*')
    .in('agent_id', access.ids)
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
        .update({ status: 'failed', fail_count: (contact.fail_count ?? 0) + 1 })
        .eq('id', contact.id);
    }
  }

  const triggered = results.filter(r => r.ok).length;
  const failed    = results.filter(r => !r.ok).length;

  return NextResponse.json({ ok: true, triggered, failed, results });
}
