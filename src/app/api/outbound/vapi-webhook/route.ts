import { NextResponse } from 'next/server';
import { withWebhookAuth } from '@/lib/webhooks/with-webhook-auth';

// Receives call completion events from Vapi
// Configure in Vapi dashboard: Server URL → /api/outbound/vapi-webhook

const NO_ANSWER_REASONS = ['no-answer', 'voicemail', 'machine_detected', 'busy', 'failed'];

export const POST = withWebhookAuth('vapi', async (_req, { event, supabase }) => {
  const message = event.message;
  const type: string = message?.type ?? event.type ?? '';
  // Vapi puede mandar el `call` en la raíz o dentro de message según el event type.
  const call = (message?.call ?? (event as { call?: { id?: string; endedReason?: string; startedAt?: string; endedAt?: string } }).call ?? null) as
    { id?: string; endedReason?: string; startedAt?: string; endedAt?: string } | null;

  if (!call?.id) return NextResponse.json({ ok: true });
  if (type !== 'end-of-call-report' && type !== 'call.ended') {
    return NextResponse.json({ ok: true });
  }

  const { data: outboundCall } = await supabase
    .from('outbound_calls')
    .select('*, voice_agents(phone_number, timezone)')
    .eq('vapi_call_id', call.id)
    .single();

  if (!outboundCall) return NextResponse.json({ ok: true });

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
    // Call was answered — mark completed + CHARGE MINUTES (fix N2 audit 2026-08-10).
    const rawStartedAt = call.startedAt;
    const rawEndedAt   = call.endedAt;
    const startedAtMs  = rawStartedAt ? new Date(rawStartedAt).getTime() : 0;
    const endedAtMs    = rawEndedAt   ? new Date(rawEndedAt).getTime()   : 0;
    // Math.max clamp evita negativos por Vapi clock skew (fix T2).
    const durationSec  = Math.max(0, startedAtMs && endedAtMs ? Math.round((endedAtMs - startedAtMs) / 1000) : 0);
    const shouldChargeMinutes = durationSec >= 3;
    const minutes = shouldChargeMinutes ? (Math.ceil(durationSec / 60) || 1) : 0;

    await supabase
      .from('outbound_calls')
      .update({
        status: 'completed',
        outcome: 'other',
        completed_at: new Date().toISOString(),
        duration_sec: durationSec,
      })
      .eq('id', outboundCall.id);

    if (shouldChargeMinutes && outboundCall.agent_id) {
      const { data: agentBilling } = await supabase
        .from('voice_agents')
        .select('portal_email')
        .eq('id', outboundCall.agent_id)
        .maybeSingle();
      const portalEmail = agentBilling?.portal_email as string | null;

      if (portalEmail) {
        const { consumePoolMinutes } = await import('@/lib/annual-contracts/pool-consume');
        const pool = await consumePoolMinutes(portalEmail, minutes, {
          callId:  call.id ?? null,
          agentId: outboundCall.agent_id as string,
        });
        if (!pool.consumed) {
          await supabase.rpc('consume_pool_minutes', {
            p_portal_email: portalEmail,
            p_agent_id:     outboundCall.agent_id,
            p_minutes:      minutes,
            p_call_id:      call.id ?? null,
          });
        }
      } else {
        await supabase.rpc('increment_minutes_used', { agent_id: outboundCall.agent_id, minutes });
        await supabase.from('minutes_ledger').insert({
          agent_id:     outboundCall.agent_id,
          amount:       -minutes,
          description:  `Llamada saliente · ${minutes} min`,
          source:       'llamada_saliente',
          kind:         'call',
          reference_id: call.id ?? null,
        });
      }
    }

    if (outboundCall.contact_id) {
      const { transitionOutboundContact } = await import('@/lib/state-machines/outbound-contact');

      let toStatus: 'completed' | 'pending' | 'failed' = 'completed';
      let reason  = 'answered_and_completed';
      let extraFields: Record<string, unknown> = {};

      const { data: contactMeta } = await supabase
        .from('outbound_contacts')
        .select('external_source, external_id')
        .eq('id', outboundCall.contact_id)
        .maybeSingle();
      if (contactMeta) {
        const { decideIncidentAutoRetry } = await import('@/lib/incidents/auto-retry');
        const decision = await decideIncidentAutoRetry(supabase as never, contactMeta as never);
        if (decision) {
          toStatus = decision.toStatus;
          reason   = decision.reason;
          if (decision.scheduledAt) {
            extraFields = { scheduled_at: decision.scheduledAt };
          }
        }
      }

      await transitionOutboundContact({
        supabase, contactId: outboundCall.contact_id,
        toStatus,
        actor:    'vapi_webhook',
        reason,
        metadata: { ended_reason: endedReason, duration_sec: durationSec, minutes_charged: minutes },
        extraFields,
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
});
