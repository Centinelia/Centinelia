import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

// Receives call completion events from Vapi
// Configure in Vapi dashboard: Server URL → /api/outbound/vapi-webhook

const NO_ANSWER_REASONS = ['no-answer', 'voicemail', 'machine_detected', 'busy', 'failed'];

export async function POST(req: NextRequest) {
  // Fix T8 audit 2026-08-10: reject si secret no seteado + timing-safe compare.
  const vapiSecret = process.env.VAPI_SERVER_SECRET;
  if (!vapiSecret) {
    console.error('[outbound/vapi-webhook] VAPI_SERVER_SECRET not set — rejecting');
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 503 });
  }
  const headerSecret = req.headers.get('x-vapi-secret') ?? '';
  const querySecret  = req.nextUrl.searchParams.get('secret') ?? '';
  const { timingSafeEqual } = await import('crypto');
  const secretBuf = Buffer.from(vapiSecret);
  const headerMatch = headerSecret.length === vapiSecret.length && timingSafeEqual(Buffer.from(headerSecret), secretBuf);
  const queryMatch  = querySecret.length  === vapiSecret.length && timingSafeEqual(Buffer.from(querySecret),  secretBuf);
  if (!headerMatch && !queryMatch) {
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

  // Dedupe: sin este gate, retry Vapi cobraba minutos 2× vía consume_pool_minutes
  // (RPC no tiene ON CONFLICT). Ver Scope C3 CRIT-2.
  {
    const { data: inserted } = await supabase
      .from('webhook_events')
      .insert({ source: 'vapi_outbound', event_id: call.id, metadata: { type, endedReason: call.endedReason ?? null } })
      .select('event_id')
      .maybeSingle();
    if (!inserted) {
      return NextResponse.json({ ok: true, deduped: true });
    }
  }

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
    // Call was answered — mark completed + CHARGE MINUTES (fix N2 audit 2026-08-10).
    // Antes: outbound calls jamás escribían minutes_ledger — consumo invisible al
    // cliente, imposible reconciliar para Municipio. Ahora replicamos el flow del
    // voice/webhook (inbound) para outbound: calc duration → skip si <3s →
    // consumePoolMinutes (annual) o consume_pool_minutes RPC (stripe).
    const rawStartedAt = call.startedAt;
    const rawEndedAt   = call.endedAt;
    const startedAtMs  = rawStartedAt ? new Date(rawStartedAt).getTime() : 0;
    const endedAtMs    = rawEndedAt   ? new Date(rawEndedAt).getTime()   : 0;
    // Fix T2 audit 2026-08-10: Math.max clamp evita negativos por Vapi clock skew.
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

    // Escribir ledger + descontar del pool. Busca portal_email + billing_model del agente.
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
          // Cliente stripe: usa el RPC event-sourced (mismo camino que voice/webhook).
          await supabase.rpc('consume_pool_minutes', {
            p_portal_email: portalEmail,
            p_agent_id:     outboundCall.agent_id,
            p_minutes:      minutes,
            p_call_id:      call.id ?? null,
          });
        }
      } else {
        // Standalone/legacy (sin portal_email): incrementa contador + ledger directo.
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

      // Multi-intento: si el contacto es un follow-up de client_incident y
      // el último resultado no fue 'ok', reagendar automáticamente en vez
      // de completar. Cap en MAX_VERIFICATION_ATTEMPTS para escalar a humano.
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
}
