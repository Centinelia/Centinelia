import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';
import { computeNextRunAt } from '@/lib/voice/campaign-scheduler';
import type { ScheduleType } from '@/lib/voice/campaign-scheduler';
import { triggerOutboundCall } from '@/lib/vapi/outbound';
import { checkAccount } from '@/lib/compliance/account-guard';
import { canRunOutboundCampaign } from '@/lib/portal/outbound-gate';
import type { VoiceAgent } from '@/types/agent';

interface Params { params: Promise<{ token: string; id: string }> }

async function getAgentAndCampaign(token: string, portalEmail: string, campaignId: string) {
  const supabase = createAdminClient();
  const { data: agent } = await supabase
    .from('voice_agents')
    .select('id, timezone, vapi_agent_id, phone_number, active, outbound_calls, features')
    .eq('portal_token', token)
    .eq('portal_email', portalEmail)
    .single();
  if (!agent) return { agent: null, campaign: null };

  const { data: campaign } = await supabase
    .from('outbound_campaigns')
    .select('*')
    .eq('id', campaignId)
    .eq('agent_id', agent.id)
    .single();

  return { agent, campaign };
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const cookie  = req.cookies.get(PORTAL_COOKIE)?.value ?? '';
  const session = await verifySession(cookie);
  if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const { token, id } = await params;
  const { agent, campaign } = await getAgentAndCampaign(token, session.portalEmail, id);
  if (!agent || !campaign) return NextResponse.json({ error: 'No encontrado' }, { status: 404 });

  const body  = await req.json();
  const patch: Record<string, unknown> = {};

  const fields = ['nombre','instrucciones','motivo','schedule_type','run_at_time','run_on_days','run_at_date','contact_filter','tag_filter','status','capability'] as const;
  for (const f of fields) {
    if (f in body) patch[f] = body[f];
  }

  // Gate: si cambian capability o activan una campaña, revalidar
  if ('capability' in patch || patch.status === 'active') {
    const cap = (patch.capability ?? campaign.capability ?? 'custom') as string;
    const gate = canRunOutboundCampaign(agent as any, cap);
    if (!gate.ok) {
      return NextResponse.json({ error: gate.reason ?? 'Campaña no permitida' }, { status: 403 });
    }
  }

  // Recompute next_run_at if schedule changed
  const schedType = (patch.schedule_type ?? campaign.schedule_type) as ScheduleType;
  const schedTime = (patch.run_at_time  ?? campaign.run_at_time)  as string;
  const schedDays = (patch.run_on_days  ?? campaign.run_on_days)  as number[];

  if ('schedule_type' in patch || 'run_at_time' in patch || 'run_on_days' in patch) {
    const tz = agent.timezone ?? 'America/Monterrey';
    const next = computeNextRunAt(tz, schedTime, schedType, schedDays);
    patch.next_run_at = next?.toISOString() ?? null;
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('outbound_campaigns')
    .update(patch)
    .eq('id', id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const cookie  = req.cookies.get(PORTAL_COOKIE)?.value ?? '';
  const session = await verifySession(cookie);
  if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const { token, id } = await params;
  const { agent, campaign } = await getAgentAndCampaign(token, session.portalEmail, id);
  if (!agent || !campaign) return NextResponse.json({ error: 'No encontrado' }, { status: 404 });

  const supabase = createAdminClient();
  const { error } = await supabase
    .from('outbound_campaigns')
    .delete()
    .eq('id', id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

// POST /[id]/ejecutar — trigger campaign immediately (manual run)
export async function POST(req: NextRequest, { params }: Params) {
  const cookie  = req.cookies.get(PORTAL_COOKIE)?.value ?? '';
  const session = await verifySession(cookie);
  if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const { token, id } = await params;
  const { agent, campaign } = await getAgentAndCampaign(token, session.portalEmail, id);
  if (!agent || !campaign) return NextResponse.json({ error: 'No encontrado' }, { status: 404 });
  if (!agent.vapi_agent_id) return NextResponse.json({ error: 'El agente no está sincronizado con Vapi' }, { status: 400 });

  const supabase = createAdminClient();

  // Account guard — same check as salientes/llamar
  const guard = await checkAccount(session.portalEmail, supabase);
  if (!guard.canOperate) {
    return NextResponse.json({ error: `Cuenta ${guard.status}. No se pueden ejecutar campañas.` }, { status: 403 });
  }

  // Capability gate: defensa en profundidad. Bloquea disparar campañas
  // cuyo tipo no cabe en las capabilities del empleado (ej. si el rol cambió
  // después de crear la campaña).
  const capGate = canRunOutboundCampaign(agent as any, (campaign.capability ?? 'custom') as string);
  if (!capGate.ok) {
    return NextResponse.json({ error: capGate.reason ?? 'Campaña no permitida' }, { status: 403 });
  }

  let contactsQuery = supabase
    .from('outbound_contacts')
    .select('id, nombre, telefono, motivo, tags')
    .eq('agent_id', agent.id)
    .eq('status', 'pending');

  if (campaign.contact_filter?.length) {
    contactsQuery = contactsQuery.in('source', campaign.contact_filter);
  }

  const campTagFilter = ((campaign as any).tag_filter as string[] | null) ?? [];
  if (campTagFilter.length > 0) {
    contactsQuery = contactsQuery.contains('tags', campTagFilter);
  }

  const { data: contacts } = await contactsQuery.limit(100);
  if (!contacts?.length) return NextResponse.json({ ok: true, triggered: 0, message: 'No hay contactos pendientes para esta campaña' });

  // Fetch full agent for outbound call
  const { data: fullAgent } = await supabase
    .from('voice_agents')
    .select('*')
    .eq('id', agent.id)
    .single();

  let triggered = 0;
  let failed    = 0;

  for (const contact of contacts) {
    const result = await triggerOutboundCall({
      agent:                fullAgent as VoiceAgent,
      customerNumber:       contact.telefono,
      customerName:         contact.nombre ?? undefined,
      motivo:               campaign.motivo ?? contact.motivo ?? undefined,
      campaignInstructions: campaign.instrucciones ?? undefined,
    });

    if (result.ok) {
      triggered++;
      const { transitionOutboundContact } = await import('@/lib/state-machines/outbound-contact');
      await transitionOutboundContact({
        supabase, contactId: contact.id,
        toStatus: 'calling',
        actor:    'user',
        reason:   'campaign_manual_trigger',
        metadata: { campaign_id: id, vapi_call_id: result.callId },
      });
      await supabase.from('outbound_calls').insert({
        agent_id:     agent.id,
        contact_id:   contact.id,
        campaign_id:  id,
        telefono:     contact.telefono,
        nombre:       contact.nombre   ?? null,
        motivo:       campaign.motivo  ?? contact.motivo ?? null,
        vapi_call_id: result.callId    ?? null,
        status:       'calling',
        called_at:    new Date().toISOString(),
      });
    } else {
      failed++;
    }
  }

  await supabase.from('outbound_campaigns').update({ last_run_at: new Date().toISOString() }).eq('id', id);

  return NextResponse.json({ ok: true, triggered, failed });
}
