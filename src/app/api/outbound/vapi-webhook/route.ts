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

    // Update contact fail_count via state machine
    if (outboundCall.contact_id) {
      const { data: contact } = await supabase
        .from('outbound_contacts')
        .select('fail_count')
        .eq('id', outboundCall.contact_id)
        .single();

      if (contact) {
        const newFailCount = ((contact.fail_count as number) ?? 0) + 1;
        const { transitionOutboundContact } = await import('@/lib/state-machines/outbound-contact');
        if (newFailCount >= 3) {
          // Cambio: en vez de DELETE, marcamos como 'failed' con reason max_fails
          // para conservar auditoría. Cleanup posterior si crece la tabla.
          await transitionOutboundContact({
            supabase, contactId: outboundCall.contact_id,
            toStatus: 'failed',
            actor:    'vapi_webhook',
            reason:   'max_fails_3',
            metadata: { fail_count: newFailCount, ended_reason: endedReason },
            soft:     true,
            extraFields: { fail_count: newFailCount },
          });
        } else {
          await transitionOutboundContact({
            supabase, contactId: outboundCall.contact_id,
            toStatus: 'pending',
            actor:    'vapi_webhook',
            reason:   'no_answer_retry_scheduled',
            metadata: { fail_count: newFailCount, ended_reason: endedReason, retry_at: retryAt },
            soft:     true,
            extraFields: { fail_count: newFailCount },
          });
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

    if (outboundCall.contact_id) {
      const { transitionOutboundContact } = await import('@/lib/state-machines/outbound-contact');
      await transitionOutboundContact({
        supabase, contactId: outboundCall.contact_id,
        toStatus: 'completed',
        actor:    'vapi_webhook',
        reason:   'answered_and_completed',
        metadata: { ended_reason: endedReason },
      });
    }

    // Encola al digest diario (no urgente). Solo cuando la saliente conectó.
    try {
      const { data: agent } = await supabase
        .from('voice_agents')
        .select('portal_email')
        .eq('id', outboundCall.agent_id)
        .maybeSingle();
      if (agent?.portal_email) {
        const { queueNotificationEvent } = await import('@/lib/notifications/queue');
        await queueNotificationEvent({
          portalEmail: agent.portal_email as string,
          agentId:     outboundCall.agent_id as string,
          kind:        'outbound_success',
          urgent:      false,
          payload: {
            to:      outboundCall.telefono ?? null,
            nombre:  outboundCall.nombre   ?? null,
            motivo:  outboundCall.motivo   ?? null,
          },
        });
      }
    } catch (err) {
      console.error('[outbound webhook] queue notification failed', err);
    }
  }

  return NextResponse.json({ ok: true });
}
