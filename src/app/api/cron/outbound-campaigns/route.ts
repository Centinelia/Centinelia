import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { triggerOutboundCall } from '@/lib/vapi/outbound';
import { computeNextRunAt } from '@/lib/voice/campaign-scheduler';
import type { ScheduleType } from '@/lib/voice/campaign-scheduler';
import type { VoiceAgent } from '@/types/agent';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization') ?? '';
  const secret = process.env.CRON_SECRET;
  if (secret && auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createAdminClient();
  const now = new Date().toISOString();

  // Find campaigns whose next_run_at has arrived
  const { data: dueCampaigns } = await supabase
    .from('outbound_campaigns')
    .select('*, voice_agents(*)')
    .eq('status', 'active')
    .lte('next_run_at', now)
    .not('next_run_at', 'is', null);

  if (!dueCampaigns?.length) {
    return NextResponse.json({ ok: true, ran: 0 });
  }

  let totalTriggered = 0;
  let totalFailed    = 0;

  for (const campaign of dueCampaigns) {
    const agent = campaign.voice_agents as VoiceAgent;
    if (!agent?.vapi_agent_id || !agent?.active) continue;

    // Fetch pending contacts for this campaign
    let q = supabase
      .from('outbound_contacts')
      .select('id, nombre, telefono, motivo')
      .eq('agent_id', campaign.agent_id)
      .eq('status', 'pending');

    if (campaign.contact_filter?.length) {
      q = q.in('source', campaign.contact_filter);
    }

    const { data: contacts } = await q.limit(100);

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
          await supabase.from('outbound_contacts').update({ status: 'calling' }).eq('id', contact.id);
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
        }
      }
    }

    // Update campaign: set last_run_at and compute next_run_at
    const tz = agent.timezone ?? 'America/Monterrey';
    const isOnce = campaign.schedule_type === 'once';
    const nextRun = isOnce
      ? null
      : computeNextRunAt(tz, campaign.run_at_time ?? '09:00', campaign.schedule_type as ScheduleType, campaign.run_on_days ?? []);

    await supabase.from('outbound_campaigns').update({
      last_run_at: now,
      next_run_at: nextRun?.toISOString() ?? null,
      status:      isOnce ? 'completed' : 'active',
    }).eq('id', campaign.id);
  }

  return NextResponse.json({ ok: true, ran: dueCampaigns.length, triggered: totalTriggered, failed: totalFailed });
}
