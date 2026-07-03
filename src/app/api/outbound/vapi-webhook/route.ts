import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendWhatsApp } from '@/lib/whatsapp/send';

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

    // WhatsApp fallback on second failed attempt
    if (!isFirstAttempt && !outboundCall.wa_fallback_sent && outboundCall.telefono) {
      const agent = outboundCall.voice_agents as { phone_number: string } | null;

      const msg = [
        `Hola${outboundCall.nombre ? `, ${outboundCall.nombre}` : ''}.`,
        `Te contactamos con un ${outboundCall.motivo ?? 'recordatorio'}.`,
        `No pudimos comunicarnos por llamada. Responde este mensaje si necesitas ayuda.`,
      ].join(' ');

      const sent = await sendWhatsApp(outboundCall.telefono, msg, agent?.phone_number);

      if (sent) {
        await supabase
          .from('outbound_calls')
          .update({ wa_fallback_sent: true })
          .eq('id', outboundCall.id);
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
