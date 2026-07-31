import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { triggerOutboundCall } from '@/lib/vapi/outbound';
import { verifyCronAuth } from '@/lib/auth/cron-auth';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  if (!verifyCronAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createAdminClient();
  const now = new Date().toISOString();

  // Find contacts scheduled up to now that are still pending
  const { data: contacts } = await supabase
    .from('outbound_contacts')
    .select('*, voice_agents!inner(id, vapi_agent_id, phone_number, business_name, features, active)')
    .eq('status', 'pending')
    .not('scheduled_at', 'is', null)
    .lte('scheduled_at', now)
    .limit(20); // safety cap per cron run

  if (!contacts?.length) {
    return NextResponse.json({ ok: true, triggered: 0 });
  }

  let triggered = 0;
  let failed    = 0;

  for (const contact of contacts) {
    const agent = (contact as any).voice_agents;
    if (!agent?.active || !agent?.features?.outbound_calls || !agent?.vapi_agent_id) continue;

    try {
      const result = await triggerOutboundCall({
        agent:          agent as any,
        customerNumber: contact.telefono,
        customerName:   contact.nombre ?? undefined,
        motivo:         contact.motivo ?? undefined,
      });

      if (result.ok) {
        triggered++;
        await supabase.from('outbound_contacts').update({ status: 'calling' }).eq('id', contact.id);
        await supabase.from('outbound_calls').insert({
          agent_id:     agent.id,
          contact_id:   contact.id,
          telefono:     contact.telefono,
          nombre:       contact.nombre ?? null,
          motivo:       contact.motivo ?? null,
          vapi_call_id: result.callId ?? null,
          status:       'calling',
          called_at:    now,
        });
      } else {
        failed++;
        await supabase.from('outbound_contacts').update({ status: 'failed' }).eq('id', contact.id);
        console.error(`cron/outbound: failed for contact ${contact.id}:`, result.error);
      }
    } catch (err) {
      failed++;
      console.error(`cron/outbound: exception for contact ${contact.id}:`, err);
      await supabase.from('outbound_contacts').update({ status: 'failed' }).eq('id', contact.id);
    }
  }

  return NextResponse.json({ ok: true, triggered, failed });
}
