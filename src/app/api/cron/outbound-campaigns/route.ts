import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { triggerOutboundCall } from '@/lib/vapi/outbound';
import { computeNextRunAt } from '@/lib/voice/campaign-scheduler';
import type { ScheduleType } from '@/lib/voice/campaign-scheduler';
import type { VoiceAgent } from '@/types/agent';
import { verifyCronAuth } from '@/lib/auth/cron-auth';
import { canRunOutboundCampaign } from '@/lib/portal/outbound-gate';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  if (!verifyCronAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createAdminClient();
  const now = new Date().toISOString();

  // ATOMIC CLAIM: deploy race Vercel HH:00 doblaba llamadas Vapi (usuarios
  // recibían 2 llamadas idénticas, cargos duplicados). El UPDATE...RETURNING
  // marca last_run_at=now como "in-progress" antes de iterar contactos; una
  // segunda invocación concurrente no matchea porque last_run_at ya está fresh.
  // Ver Scope C2 CRIT-1.
  const claimCutoff = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  const { data: dueCampaigns } = await supabase
    .from('outbound_campaigns')
    .update({ last_run_at: now })
    .eq('status', 'active')
    .lte('next_run_at', now)
    .not('next_run_at', 'is', null)
    .or(`last_run_at.is.null,last_run_at.lt.${claimCutoff}`)
    .select('*, voice_agents(*)');

  if (!dueCampaigns?.length) {
    return NextResponse.json({ ok: true, ran: 0 });
  }

  let totalTriggered = 0;
  let totalFailed    = 0;

  for (const campaign of dueCampaigns) {
    const agent = campaign.voice_agents as VoiceAgent;
    if (!agent?.vapi_agent_id || !agent?.active) continue;

    // Rate limit: accounts within their first 30 days have an outbound daily cap
    if (agent.portal_email) {
      const { data: org } = await supabase
        .from('organizations')
        .select('outbound_daily_limit, outbound_limit_until, account_status')
        .eq('portal_email', agent.portal_email)
        .single();

      if (org?.account_status === 'suspended' || org?.account_status === 'terminated') continue;

      if (org?.outbound_limit_until && new Date(org.outbound_limit_until) > new Date()) {
        const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
        const { count: todayCount } = await supabase
          .from('outbound_calls')
          .select('id', { count: 'exact', head: true })
          .eq('agent_id', agent.id)
          .gte('called_at', todayStart.toISOString());

        const limit = org.outbound_daily_limit ?? 50;
        if ((todayCount ?? 0) >= limit) {
          console.log(`[rate-limit] ${agent.portal_email} reached daily outbound limit (${limit}), skipping campaign ${campaign.id}`);
          continue;
        }
      }
    }

    // Capability gate: defensa en profundidad. Si el rol del meerkat cambió
    // después de crear la campaña (o el toggle de outbound se desactivó),
    // el cron rechaza el pickup silenciosamente.
    const capGate = canRunOutboundCampaign(agent as any, (campaign.capability ?? 'custom') as string);
    if (!capGate.ok) {
      console.log(`[cron/outbound-campaigns] skipping campaign ${campaign.id}: ${capGate.reason}`);
      continue;
    }

    // Fetch contacts matching the campaign filters. NO filtramos por
    // status='pending' — la campaña llama a lo que matchea, el status es
    // informativo del último intento de llamada.
    //
    // Prioridad: contact_ids (selección explícita) > tag_filter > todos los
    // contactos del agente.
    let q = supabase
      .from('outbound_contacts')
      .select('id, nombre, telefono, motivo, tags')
      .eq('agent_id', campaign.agent_id);

    const campContactIds = ((campaign as any).contact_ids as string[] | null) ?? [];
    if (campContactIds.length > 0) {
      q = q.in('id', campContactIds);
    } else {
      if (campaign.contact_filter?.length) {
        q = q.in('source', campaign.contact_filter);
      }
      const tagFilter = ((campaign as any).tag_filter as string[] | null) ?? [];
      if (tagFilter.length > 0) {
        q = q.contains('tags', tagFilter);
      }
    }

    const { data: contacts } = await q.limit(100);

    // Contadores por campaña para detectar fallo total (audit sesión 53).
    // Antes, campañas 'once' se marcaban 'completed' aunque todas las llamadas
    // fallaran; el usuario asumía envío exitoso silenciosamente.
    let campaignTriggered = 0;
    let campaignFailed    = 0;

    if (contacts?.length) {
      for (const contact of contacts) {
        const result = await triggerOutboundCall({
          agent,
          customerNumber:       contact.telefono,
          customerName:         contact.nombre ?? undefined,
          motivo:               campaign.motivo ?? contact.motivo ?? undefined,
          campaignInstructions: campaign.instrucciones ?? undefined,
        }).catch(err => { console.error('[cron/outbound-campaigns]', err); return { ok: false }; });

        if (result.ok) {
          totalTriggered++;
          campaignTriggered++;
          const { transitionOutboundContact } = await import('@/lib/state-machines/outbound-contact');
          await transitionOutboundContact({
            supabase, contactId: contact.id,
            toStatus: 'calling',
            actor:    'cron',
            reason:   'campaign_pickup',
            metadata: { campaign_id: campaign.id, vapi_call_id: 'callId' in result ? result.callId : null },
          });
          await supabase.from('outbound_calls').insert({
            agent_id:     campaign.agent_id,
            contact_id:   contact.id,
            campaign_id:  campaign.id,
            telefono:     contact.telefono,
            nombre:       contact.nombre  ?? null,
            motivo:       campaign.motivo ?? contact.motivo ?? null,
            vapi_call_id: ('callId' in result ? result.callId : undefined) ?? null,
            status:       'calling',
            called_at:    new Date().toISOString(),
          });
        } else {
          totalFailed++;
          campaignFailed++;
        }
      }
    }

    // Update campaign: set last_run_at and compute next_run_at
    const tz = agent.timezone ?? 'America/Monterrey';
    const isOnce = campaign.schedule_type === 'once';
    const nextRun = isOnce
      ? null
      : computeNextRunAt(tz, campaign.run_at_time ?? '09:00', campaign.schedule_type as ScheduleType, campaign.run_on_days ?? []);

    // Solo 'once' cambia estado terminal aquí. Si intentó contactos y TODOS fallaron,
    // marca 'failed' en vez de 'completed' para que el usuario lo detecte.
    const onceFinalStatus = campaignTriggered === 0 && campaignFailed > 0 ? 'failed' : 'completed';
    await supabase.from('outbound_campaigns').update({
      last_run_at: now,
      next_run_at: nextRun?.toISOString() ?? null,
      status:      isOnce ? onceFinalStatus : 'active',
    }).eq('id', campaign.id);
  }

  return NextResponse.json({ ok: true, ran: dueCampaigns.length, triggered: totalTriggered, failed: totalFailed });
}
