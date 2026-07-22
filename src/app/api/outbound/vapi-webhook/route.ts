import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

// Receives call completion events from Vapi
// Configure in Vapi dashboard: Server URL → /api/outbound/vapi-webhook

const NO_ANSWER_REASONS = ['no-answer', 'voicemail', 'machine_detected', 'busy', 'failed'];

export async function POST(req: NextRequest) {
  const vapiSecret = process.env.VAPI_SERVER_SECRET;
  if (vapiSecret && req.nextUrl.searchParams.get('secret') !== vapiSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json();
  const { message } = body;
  const type: string = message?.type ?? body?.type ?? '';
  const call = message?.call ?? body?.call ?? null;

  if (!call?.id) {
    return NextResponse.json({ ok: true });
  }

  if (type !== 'end-of-call-report' && type !== 'call.ended') {
    return NextResponse.json({ ok: true });
  }

  const supabase = createAdminClient();

  const { data: outboundCall } = await supabase
    .from('outbound_calls')
    .select('*, voice_agents(phone_number, timezone)')
    .eq('vapi_call_id', call.id)
    .single();

  if (!outboundCall) {
    return NextResponse.json({ ok: true });
  }

  const endedReason: string = call.endedReason ?? '';
  const isNoAnswer = NO_ANSWER_REASONS.some((r) => endedReason.toLowerCase().includes(r));

  if (isNoAnswer) {
    const isFirstAttempt = (outboundCall.attempt as number) === 1;
    const retryAt = isFirstAttempt
      ? new Date(Date.now() + 10 * 60_000).toISOString() // +10 min
      : null;

    await supabase
      .from('outbound_calls')
      .update({ status: 'no_answer', outcome: 'no_answer', next_retry_at: retryAt })
      .eq('id', outboundCall.id);

    // Update contact fail_count; auto-delete at 3 failures
    if (outboundCall.contact_id) {
      const { data: contact } = await supabase
        .from('outbound_contacts')
        .select('fail_count')
        .eq('id', outboundCall.contact_id)
        .single();

      if (contact) {
        const newFailCount = ((contact.fail_count as number) ?? 0) + 1;
        if (newFailCount >= 3) {
          await supabase.from('outbound_contacts').delete().eq('id', outboundCall.contact_id);
        } else {
          await supabase.from('outbound_contacts')
            .update({ status: 'pending', fail_count: newFailCount })
            .eq('id', outboundCall.contact_id);
        }
      }
    }

  } else {
    // Call was answered — mark completed
    await supabase
      .from('outbound_calls')
      .update({
        status: 'completed',
        outcome: 'other',
        completed_at: new Date().toISOString(),
      })
      .eq('id', outboundCall.id);

    // Mark contact as completed if linked
    if (outboundCall.contact_id) {
      await supabase
        .from('outbound_contacts')
        .update({ status: 'completed' })
        .eq('id', outboundCall.contact_id);
    }
  }

  return NextResponse.json({ ok: true });
}
