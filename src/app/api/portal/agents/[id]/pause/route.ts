import { NextResponse } from 'next/server';
import { pauseVapiAgent, resumeVapiAgent } from '@/lib/vapi/control';
import { withPortalAuth } from '@/lib/portal/with-portal-auth';

interface AgentRow {
  id:                 string;
  phone_number:       string | null;
  vapi_agent_id:      string | null;
  active:             boolean | null;
  client_paused:      boolean | null;
  billing_status:     string | null;
  portal_email:       string | null;
}

export const POST = withPortalAuth<AgentRow>(
  async (req, { agent, supabase, agentId }) => {
    // Defense: never UPDATE with .eq('portal_email', null).
    if (!agent!.portal_email) {
      console.error('[pause] agent sin portal_email:', agentId);
      return NextResponse.json({ error: 'Agente sin dueño' }, { status: 500 });
    }

    const body = await req.json().catch(() => null) as { action?: unknown } | null;
    const action = body?.action;
    if (action !== 'pause' && action !== 'resume') {
      return NextResponse.json({ error: 'Acción inválida' }, { status: 400 });
    }

    // Idempotencia.
    const alreadyPaused = agent!.active === false && agent!.client_paused === true;
    if (action === 'pause' && alreadyPaused) {
      return NextResponse.json({ ok: true, noop: true });
    }
    if (action === 'resume' && agent!.active === true) {
      return NextResponse.json({ ok: true, noop: true });
    }

    if (action === 'pause') {
      if (!agent!.phone_number) {
        return NextResponse.json({ error: 'Agente sin número' }, { status: 400 });
      }
      try {
        await pauseVapiAgent(agent!.phone_number);
      } catch (err) {
        console.error('[pause] vapi pause failed:', err);
        return NextResponse.json({ error: 'No se pudo pausar en Vapi' }, { status: 502 });
      }
      const { error: updErr } = await supabase
        .from('voice_agents')
        .update({ active: false, client_paused: true, client_paused_at: new Date().toISOString() })
        .eq('id', agentId!)
        .eq('portal_email', agent!.portal_email);
      if (updErr) {
        console.error('[pause] db update failed after vapi pause:', updErr);
        return NextResponse.json({ error: 'Vapi pausado pero DB no se actualizó' }, { status: 500 });
      }
    } else {
      if (agent!.billing_status === 'pago_fallido') {
        return NextResponse.json({ error: 'No se puede reanudar: pago pendiente' }, { status: 403 });
      }
      if (!agent!.phone_number || !agent!.vapi_agent_id) {
        return NextResponse.json({ error: 'Agente sin número o vapi_agent_id' }, { status: 400 });
      }
      try {
        await resumeVapiAgent(agent!.phone_number, agent!.vapi_agent_id);
      } catch (err) {
        console.error('[pause] vapi resume failed:', err);
        return NextResponse.json({ error: 'No se pudo reanudar en Vapi' }, { status: 502 });
      }
      const { error: updErr } = await supabase
        .from('voice_agents')
        .update({ active: true, client_paused: false, client_paused_at: null })
        .eq('id', agentId!)
        .eq('portal_email', agent!.portal_email);
      if (updErr) {
        console.error('[pause] db update failed after vapi resume:', updErr);
        return NextResponse.json({ error: 'Vapi reanudado pero DB no se actualizó' }, { status: 500 });
      }
    }

    return NextResponse.json({ ok: true });
  },
  {
    scoping:         'session',
    agentIdParam:    'id',
    requireOwner:    true,
    loadAgent:       true,
    agentSelect:     'id, phone_number, vapi_agent_id, active, client_paused, billing_status, portal_email',
    rateLimit:       'configWrite',
    rateLimitPrefix: 'pause',
  },
);
