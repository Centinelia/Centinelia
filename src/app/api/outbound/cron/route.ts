import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendWhatsApp } from '@/lib/whatsapp/send';
import { verifyCronAuth } from '@/lib/auth/cron-auth';

// Configurable: hours before appointment to send reminder
const REMINDER_HOURS_BEFORE = parseInt(process.env.OUTBOUND_REMINDER_HOURS ?? '24');
const VAPI_BASE = 'https://api.vapi.ai';

// Called by Vercel cron every 5 minutes
// vercel.json: { "crons": [{ "path": "/api/outbound/cron", "schedule": "*/5 * * * *" }] }

function isWithinBusinessHours(timezone: string): boolean {
  const localTime = new Date(new Date().toLocaleString('en-US', { timeZone: timezone }));
  const hour = localTime.getHours();
  return hour >= 9 && hour < 19;
}

async function fireVapiCall(params: {
  assistantId: string;
  phoneNumberId: string;
  customerNumber: string;
  nombre?: string;
  motivo?: string;
}): Promise<string | null> {
  const res = await fetch(`${VAPI_BASE}/call`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.VAPI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      type: 'outboundPhoneCall',
      assistantId: params.assistantId,
      phoneNumberId: params.phoneNumberId,
      serverUrl: `${process.env.NEXT_PUBLIC_APP_URL}/api/outbound/vapi-webhook?secret=${process.env.VAPI_SERVER_SECRET}`,
      customer: {
        number: params.customerNumber,
        name: params.nombre,
      },
      assistantOverrides: {
        variableValues: {
          motivo: params.motivo ?? 'recordatorio',
          nombre_cliente: params.nombre ?? '',
        },
      },
    }),
  });

  if (!res.ok) {
    console.error('[Outbound cron] Vapi error:', await res.text());
    return null;
  }

  const data = await res.json();
  return data.id ?? null;
}

export async function GET(req: NextRequest) {
  // Vercel sends Authorization: Bearer <CRON_SECRET> automatically for cron jobs.
  // CRON_SECRET is a system env var set by Vercel — no need to embed it in vercel.json.
  if (!verifyCronAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createAdminClient();
  const now = new Date();
  const results = { fired: 0, skipped: 0, errors: 0 };

  // ── 1. Manual contacts scheduled now ─────────────────────────────────────
  const { data: contacts } = await supabase
    .from('outbound_contacts')
    .select('*, voice_agents(vapi_agent_id, vapi_phone_number_id, timezone, features)')
    .eq('status', 'pending')
    .lte('scheduled_at', now.toISOString())
    .limit(50);

  for (const contact of contacts ?? []) {
    const agent = contact.voice_agents as {
      vapi_agent_id: string;
      vapi_phone_number_id: string;
      timezone: string;
      features?: Record<string, boolean>;
    } | null;

    if (!agent?.vapi_agent_id || !agent?.vapi_phone_number_id) continue;
    if (!agent.features?.outbound_calls) { results.skipped++; continue; }

    if (!isWithinBusinessHours(agent.timezone)) {
      results.skipped++;
      continue;
    }

    const vapiCallId = await fireVapiCall({
      assistantId: agent.vapi_agent_id,
      phoneNumberId: agent.vapi_phone_number_id,
      customerNumber: contact.telefono,
      nombre: contact.nombre ?? undefined,
      motivo: contact.motivo ?? undefined,
    });

    if (vapiCallId) {
      await supabase.from('outbound_calls').insert({
        agent_id: contact.agent_id,
        contact_id: contact.id,
        telefono: contact.telefono,
        nombre: contact.nombre,
        motivo: contact.motivo,
        vapi_call_id: vapiCallId,
        status: 'calling',
        scheduled_at: contact.scheduled_at,
        called_at: now.toISOString(),
      });
      const { transitionOutboundContact } = await import('@/lib/state-machines/outbound-contact');
      await transitionOutboundContact({
        supabase, contactId: contact.id,
        toStatus: 'calling',
        actor:    'cron',
        reason:   'legacy_outbound_cron_pickup',
        metadata: { vapi_call_id: vapiCallId },
      });
      results.fired++;
    } else {
      results.errors++;
    }
  }

  // ── 2. Appointment reminders ──────────────────────────────────────────────
  const windowStart = new Date(now.getTime() + REMINDER_HOURS_BEFORE * 3_600_000);
  const windowEnd = new Date(windowStart.getTime() + 5 * 60_000); // 5-min window

  const { data: appointments } = await supabase
    .from('appointments_voice')
    .select('*, voice_agents(id, vapi_agent_id, vapi_phone_number_id, timezone, features)')
    .eq('status', 'confirmada')
    .eq('reminder_sent', false)
    .gte('starts_at', windowStart.toISOString())
    .lte('starts_at', windowEnd.toISOString());

  for (const apt of appointments ?? []) {
    const agent = apt.voice_agents as {
      id: string;
      vapi_agent_id: string;
      vapi_phone_number_id: string;
      timezone: string;
      features?: Record<string, boolean>;
    } | null;

    if (!agent?.vapi_agent_id || !agent?.vapi_phone_number_id || !apt.telefono) continue;
    if (!agent.features?.outbound_calls) { results.skipped++; continue; }

    if (!isWithinBusinessHours(agent.timezone)) {
      results.skipped++;
      continue;
    }

    const motivo = `recordatorio de cita — ${apt.servicio ?? 'su cita'} el ${apt.fecha}${apt.hora ? ` a las ${apt.hora}` : ''}`;

    const vapiCallId = await fireVapiCall({
      assistantId: agent.vapi_agent_id,
      phoneNumberId: agent.vapi_phone_number_id,
      customerNumber: apt.telefono,
      nombre: apt.nombre ?? undefined,
      motivo,
    });

    if (vapiCallId) {
      await Promise.all([
        supabase.from('outbound_calls').insert({
          agent_id: agent.id,
          appointment_id: apt.id,
          telefono: apt.telefono,
          nombre: apt.nombre,
          motivo: 'recordatorio_cita',
          vapi_call_id: vapiCallId,
          status: 'calling',
          scheduled_at: now.toISOString(),
          called_at: now.toISOString(),
        }),
        supabase.from('appointments_voice').update({ reminder_sent: true }).eq('id', apt.id),
      ]);
      results.fired++;
    } else {
      results.errors++;
    }
  }

  // ── 2b. WhatsApp appointment reminders ───────────────────────────────────
  const { data: waAppointments } = await supabase
    .from('wa_appointments')
    .select('*, voice_agents(id, vapi_agent_id, vapi_phone_number_id, timezone)')
    .eq('status', 'confirmada')
    .eq('reminder_sent', false)
    .gte('starts_at', windowStart.toISOString())
    .lte('starts_at', windowEnd.toISOString());

  for (const apt of waAppointments ?? []) {
    const agent = apt.voice_agents as {
      id: string;
      vapi_agent_id: string;
      vapi_phone_number_id: string;
      timezone: string;
    } | null;

    if (!agent?.vapi_agent_id || !agent?.vapi_phone_number_id || !apt.customer_number) continue;

    if (!isWithinBusinessHours(agent.timezone)) {
      results.skipped++;
      continue;
    }

    const motivo = `recordatorio de cita — ${apt.servicio ?? 'su cita'} el ${apt.fecha}${apt.hora ? ` a las ${apt.hora}` : ''}`;

    const vapiCallId = await fireVapiCall({
      assistantId: agent.vapi_agent_id,
      phoneNumberId: agent.vapi_phone_number_id,
      customerNumber: apt.customer_number,
      nombre: apt.nombre ?? undefined,
      motivo,
    });

    if (vapiCallId) {
      await Promise.all([
        supabase.from('outbound_calls').insert({
          agent_id:       agent.id,
          appointment_id: apt.id,
          telefono:       apt.customer_number,
          nombre:         apt.nombre,
          motivo:         'recordatorio_cita',
          vapi_call_id:   vapiCallId,
          status:         'calling',
          scheduled_at:   now.toISOString(),
          called_at:      now.toISOString(),
        }),
        supabase.from('wa_appointments').update({ reminder_sent: true }).eq('id', apt.id),
      ]);
      results.fired++;
    } else {
      results.errors++;
    }
  }

  // ── 3. Retries for no-answer (attempt 1, retry after 10 min) ─────────────
  const { data: retries } = await supabase
    .from('outbound_calls')
    .select('*, voice_agents(vapi_agent_id, vapi_phone_number_id, timezone, features)')
    .eq('status', 'no_answer')
    .lte('next_retry_at', now.toISOString())
    .lt('attempt', 2)
    .limit(20);

  for (const call of retries ?? []) {
    const agent = call.voice_agents as {
      vapi_agent_id: string;
      vapi_phone_number_id: string;
      timezone: string;
      features?: Record<string, boolean>;
    } | null;

    if (!agent?.vapi_agent_id || !agent?.vapi_phone_number_id) continue;
    if (!agent.features?.outbound_calls) { results.skipped++; continue; }

    if (!isWithinBusinessHours(agent.timezone)) {
      results.skipped++;
      continue;
    }

    const vapiCallId = await fireVapiCall({
      assistantId: agent.vapi_agent_id,
      phoneNumberId: agent.vapi_phone_number_id,
      customerNumber: call.telefono,
      nombre: call.nombre ?? undefined,
      motivo: call.motivo ?? undefined,
    });

    if (vapiCallId) {
      await Promise.all([
        supabase.from('outbound_calls').insert({
          agent_id: call.agent_id,
          contact_id: call.contact_id,
          appointment_id: call.appointment_id,
          telefono: call.telefono,
          nombre: call.nombre,
          motivo: call.motivo,
          vapi_call_id: vapiCallId,
          status: 'calling',
          attempt: (call.attempt as number) + 1,
          scheduled_at: call.scheduled_at,
          called_at: now.toISOString(),
        }),
        // Mark the previous attempt as superseded
        supabase.from('outbound_calls').update({ status: 'completed' }).eq('id', call.id),
      ]);
      results.fired++;
    }
  }

  // ── 4. WhatsApp broadcasts ────────────────────────────────────────────────
  const { data: readyBroadcasts } = await supabase
    .from('wa_broadcasts')
    .select('id, agent_id, message, voice_agents(wa_phone_number)')
    .eq('status', 'pending')
    .lte('scheduled_at', now.toISOString());

  for (const broadcast of readyBroadcasts ?? []) {
    const waAgent  = broadcast.voice_agents as unknown as { wa_phone_number: string } | null;
    const waNumber = waAgent?.wa_phone_number;

    await supabase.from('wa_broadcasts').update({ status: 'sending' }).eq('id', broadcast.id);

    const { data: batch } = await supabase
      .from('wa_broadcast_recipients')
      .select('id, nombre, telefono')
      .eq('broadcast_id', broadcast.id)
      .eq('status', 'pending')
      .limit(50);

    let sentInBatch = 0;
    for (const r of batch ?? []) {
      const msg  = broadcast.message.replace(/\{\{nombre\}\}/gi, r.nombre ?? '');
      const sent = await sendWhatsApp(r.telefono, msg, waNumber);

      await supabase
        .from('wa_broadcast_recipients')
        .update({
          status:  sent ? 'sent' : 'failed',
          sent_at: sent ? now.toISOString() : null,
          error:   sent ? null : 'Twilio rejected — contact may require an approved template',
        })
        .eq('id', r.id);

      if (sent) { results.fired++; sentInBatch++; } else results.errors++;
    }

    // Track broadcast messages against the agent's monthly quota
    if (sentInBatch > 0) {
      await supabase.rpc('increment_wa_messages_used', {
        p_agent_id: (broadcast as unknown as { agent_id: string }).agent_id,
        p_count:    sentInBatch,
      });
    }

    // Update counters; mark completed only when no pending recipients remain
    const { data: allRecipients } = await supabase
      .from('wa_broadcast_recipients')
      .select('status')
      .eq('broadcast_id', broadcast.id);

    const sentCount    = allRecipients?.filter(r => r.status === 'sent').length    ?? 0;
    const failedCount  = allRecipients?.filter(r => r.status === 'failed').length  ?? 0;
    const pendingCount = allRecipients?.filter(r => r.status === 'pending').length ?? 0;

    await supabase
      .from('wa_broadcasts')
      .update({
        sent:   sentCount,
        failed: failedCount,
        status: pendingCount === 0 ? 'completed' : 'sending',
      })
      .eq('id', broadcast.id);
  }

  return NextResponse.json({ ok: true, timestamp: now.toISOString(), ...results });
}
