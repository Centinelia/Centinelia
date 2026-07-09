import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendWhatsApp } from '@/lib/whatsapp/send';
import { sendEmail, minutesAlertHtml, newLeadHtml, appointmentConfirmationToClientHtml, leadFollowUpToClientHtml } from '@/lib/email/send';
import { pauseVapiAgent } from '@/lib/vapi/control';
import { triggerOutboundCall } from '@/lib/vapi/outbound';
import { executeAutoRefill } from '@/lib/billing/auto-refill';
import { getCustomerContext, upsertCustomer, logInteraction } from '@/lib/customers';
import { extractAndSaveLearnings } from '@/lib/ai/extract-learnings';
import { generateTeamMessage } from '@/lib/ai/generate-team-message';

export async function POST(req: NextRequest) {
  const vapiSecret = process.env.VAPI_SERVER_SECRET;
  if (vapiSecret && req.nextUrl.searchParams.get('secret') !== vapiSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json();
  const { message } = body;

  if (!message) return NextResponse.json({ ok: true });

  const supabase = createAdminClient();

  switch (message.type) {

    // ── Inbound call routing + context injection ─────────────────────────
    case 'assistant-request': {
      const inboundNumber = message.call?.phoneNumber?.number ?? '';
      const callerNumber  = message.call?.customer?.number    ?? '';

      if (!inboundNumber) return NextResponse.json({ error: 'no phone' }, { status: 400 });

      const normInbound = inboundNumber.replace(/\D/g, '').slice(-10);
      const { data: agent } = await supabase
        .from('voice_agents')
        .select('id, vapi_agent_id, portal_email')
        .ilike('phone_number', `%${normInbound}`)
        .eq('active', true)
        .maybeSingle();

      if (!agent?.vapi_agent_id) {
        return NextResponse.json({ error: 'agent not found' }, { status: 404 });
      }

      // Inject customer context as an additional system message if caller is known
      let assistantOverrides: Record<string, unknown> | undefined;
      if (callerNumber && agent.portal_email) {
        const ctx = await getCustomerContext(agent.portal_email, callerNumber);
        if (ctx) {
          assistantOverrides = {
            model: { messages: [{ role: 'system', content: ctx }] },
          };
        }
      }

      return NextResponse.json({
        assistantId: agent.vapi_agent_id,
        ...(assistantOverrides ? { assistantOverrides } : {}),
      });
    }

    case 'end-of-call-report': {
      const call = message.call;

      // Log structure on first path to diagnose payload format issues
      console.log('[webhook] end-of-call-report received. call.id:', call?.id,
        '| message.assistantId:', message.assistantId,
        '| call.assistantId:', call?.assistantId,
        '| message.assistant?.metadata:', JSON.stringify(message.assistant?.metadata),
        '| call?.assistant?.metadata:', JSON.stringify(call?.assistant?.metadata));

      // agent_id: try every known path across Vapi versions
      const agentId: string =
        message.assistant?.metadata?.agent_id   ??  // standard
        call?.assistant?.metadata?.agent_id      ??  // nested in call
        call?.metadata?.agent_id                 ??  // call-level metadata
        message.metadata?.agent_id               ??  // top-level metadata
        '';

      // Fallback: look up by Vapi assistant ID (works across all payload versions)
      let resolvedAgentId = agentId;
      const vapiAssistantId =
        call?.assistantId       ??
        message.assistantId     ??
        call?.assistant?.id     ??
        message.assistant?.id   ??
        '';

      if (!resolvedAgentId && vapiAssistantId) {
        const { data: byVapi } = await supabase
          .from('voice_agents')
          .select('id')
          .eq('vapi_agent_id', vapiAssistantId)
          .single();
        if (byVapi?.id) resolvedAgentId = byVapi.id;
      }

      if (!resolvedAgentId) {
        console.error('[webhook] no agent_id found. call.id:', call?.id,
          'vapiAssistantId:', vapiAssistantId,
          'message keys:', Object.keys(message));
        break;
      }

      // Duration: call.startedAt/endedAt may not be in webhook payload, also check message level
      const rawStartedAt = call?.startedAt ?? message.startedAt;
      const rawEndedAt   = call?.endedAt   ?? message.endedAt;
      const startedAt    = rawStartedAt ? new Date(rawStartedAt).getTime() : 0;
      const endedAt      = rawEndedAt   ? new Date(rawEndedAt).getTime()   : 0;
      const durationSeconds = startedAt && endedAt ? Math.round((endedAt - startedAt) / 1000) : 0;

      // Analysis: may live at message.analysis or call.analysis
      const analysis     = message.analysis ?? call?.analysis ?? null;
      const structured   = analysis?.structuredData ?? null;
      const rawOutcome   = detectOutcome(message, structured);
      const outcome      = durationSeconds <= 5 ? 'unanswered' : rawOutcome;
      const transcript   = message.transcript ?? call?.transcript ?? null;
      const summary      = analysis?.summary ?? message.summary ?? call?.summary ?? null;
      const recordingUrl = call?.recordingUrl ?? message.artifact?.recordingUrl ?? null;
      const callerNumber = call?.customer?.number ?? message.customer?.number ?? '';

      // 1. Log call
      const { error: callInsertError } = await supabase.from('voice_calls').insert({
        agent_id:            resolvedAgentId,
        vapi_call_id:        call?.id ?? null,
        caller_number:       callerNumber,
        duration_seconds:    durationSeconds,
        transcript,
        summary,
        recording_url:       recordingUrl,
        outcome,
        lead_created:        outcome === 'lead_created',
        appointment_created: outcome === 'appointment_booked',
        order_created:       outcome === 'order_taken',
        transferred:         outcome === 'transferred',
        cost_usd:            call?.cost ?? null,
        nivel_interes:        structured?.nivel_interes       ?? null,
        acciones_pendientes:  structured?.acciones_pendientes ?? null,
      });

      // 2. Save lead from structured data
      if (structured?.nombre && structured?.tipo_contacto !== 'informacion') {
        if (['lead', 'cita', 'pedido'].includes(structured.tipo_contacto ?? '') ||
            structured.servicio || structured.pedido_items) {
          await supabase.from('leads_voice').insert({
            agent_id:    resolvedAgentId,
            nombre:      structured.nombre      ?? null,
            negocio:     structured.negocio     ?? null,
            giro:        structured.giro        ?? null,
            servicio:    structured.servicio    ?? structured.pedido_items ?? null,
            presupuesto: structured.presupuesto ?? null,
            timeline:    structured.timeline    ?? structured.cita_fecha ?? null,
            email:       structured.email       ?? null,
            whatsapp:    structured.whatsapp    ?? callerNumber ?? null,
            source:      'llamada',
          });
        }
      }

      // 2c-pre-outbound. Auto-add caller to outbound_contacts for future campaigns.
      // Only for inbound calls answered for more than 5 seconds.
      const callTypeRaw  = call?.type ?? '';
      const isInboundCall = !callTypeRaw || callTypeRaw === 'inboundPhoneCall';

      if (isInboundCall && callerNumber && durationSeconds > 5) {
        const normCaller2 = callerNumber.replace(/\D/g, '').slice(-10);
        const { data: existingContact } = await supabase
          .from('outbound_contacts')
          .select('id, nombre')
          .eq('agent_id', resolvedAgentId)
          .ilike('telefono', `%${normCaller2}%`)
          .limit(1)
          .maybeSingle();

        if (!existingContact) {
          await supabase.from('outbound_contacts').insert({
            agent_id: resolvedAgentId,
            nombre:   structured?.nombre ?? null,
            telefono: callerNumber,
            motivo:   null,
            source:   'llamada_entrante',
          });
        } else if (structured?.nombre && !existingContact.nombre) {
          await supabase.from('outbound_contacts')
            .update({ nombre: structured.nombre })
            .eq('id', existingContact.id);
        }
      }

      // 2c-pre. Save minimal caller profile so future calls can greet by name.
      // Only when a nombre was captured AND no existing profile exists for this number.
      if (structured?.nombre && callerNumber) {
        const normCaller = callerNumber.replace(/\D/g, '').slice(-10);
        const { data: existingProfile } = await supabase
          .from('leads_voice')
          .select('id')
          .eq('agent_id', resolvedAgentId)
          .ilike('whatsapp', `%${normCaller}%`)
          .limit(1)
          .maybeSingle();

        if (!existingProfile) {
          await supabase.from('leads_voice').insert({
            agent_id: resolvedAgentId,
            nombre:   structured.nombre,
            negocio:  structured.negocio ?? null,
            whatsapp: callerNumber,
            source:   'perfil',
          });
        }
      }

      // 2b. Save appointment when tipo_contacto === 'cita'
      if (structured?.tipo_contacto === 'cita' || structured?.cita_fecha) {
        const telefono = structured.cita_telefono ?? structured.whatsapp ?? callerNumber ?? null;
        // cita_fecha should be YYYY-MM-DD from structuredData; validate before storing
        const fechaIso = structured.cita_fecha && /^\d{4}-\d{2}-\d{2}$/.test(structured.cita_fecha)
          ? structured.cita_fecha
          : null;
        await supabase.from('appointments_voice').insert({
          agent_id:   resolvedAgentId,
          nombre:     structured.nombre    ?? null,
          telefono,
          servicio:   structured.servicio  ?? null,
          fecha:      structured.cita_fecha ?? null,
          hora:       structured.cita_hora  ?? null,
          fecha_iso:  fechaIso,
          status:     'confirmada',
        });
      }

      // 2c. Lead email notification to business owner
      const notifyOutcomes = ['lead_created', 'appointment_booked', 'order_taken', 'transferred', 'info_provided'];
      if (notifyOutcomes.includes(outcome)) {
        // Fetch agent email + portal token (used in the email CTA)
        const { data: agentForEmail } = await supabase
          .from('voice_agents')
          .select('client_email, business_name, agent_name, portal_token, notify_email, phone_number, email_from, email_logo_url, email_brand_color, email_footer_text, email_domain_verified')
          .eq('id', resolvedAgentId)
          .single();

        if (agentForEmail?.client_email && (agentForEmail.notify_email ?? true)) {
          const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.centinelia.mx';
          const portalUrl = `${appUrl}/portal/${agentForEmail.portal_token}`;
          const outcomeSubjects: Record<string, string> = {
            lead_created:       '🎯 Nuevo lead capturado',
            appointment_booked: '📅 Cita agendada',
            order_taken:        '🛒 Nuevo pedido',
            transferred:        '📞 Llamada transferida',
            info_provided:      'ℹ️ Llamada informativa',
          };
          await sendEmail({
            to:      agentForEmail.client_email,
            subject: `${outcomeSubjects[outcome] ?? '📱 Llamada'}, ${agentForEmail.business_name}`,
            html:    newLeadHtml({
              businessName:  agentForEmail.business_name,
              callerNumber,
              nombre:        structured?.nombre   ?? null,
              servicio:      structured?.servicio ?? structured?.pedido_items ?? null,
              whatsapp:      structured?.whatsapp ?? null,
              email:         structured?.email    ?? null,
              summary,
              outcome,
              portalUrl,
            }),
          }).catch(console.error);
        }

        // 2d. Email to caller — only when they provided their email during the call
        if (structured?.email && agentForEmail?.business_name &&
            ['appointment_booked', 'lead_created'].includes(outcome)) {
          const senderName  = agentForEmail.agent_name ?? agentForEmail.business_name;
          const verifiedFrom = (agentForEmail as any).email_domain_verified && (agentForEmail as any).email_from
            ? (agentForEmail as any).email_from
            : 'notificaciones@centinelia.mx';
          const fromAddr    = `${agentForEmail.business_name} <${verifiedFrom}>`;
          const phone       = agentForEmail.phone_number ?? null;
          const branding    = {
            logoUrl:    (agentForEmail as any).email_logo_url    ?? null,
            brandColor: (agentForEmail as any).email_brand_color ?? '#6C3BFF',
            footerText: (agentForEmail as any).email_footer_text ?? null,
            senderName: agentForEmail.business_name,
          };

          if (outcome === 'appointment_booked') {
            sendEmail({
              to:      structured.email,
              from:    fromAddr,
              subject: `Tu cita en ${agentForEmail.business_name} está confirmada`,
              html:    appointmentConfirmationToClientHtml({
                branding,
                businessName: agentForEmail.business_name,
                agentName:    senderName,
                clientName:   structured.nombre    ?? null,
                citaFecha:    structured.cita_fecha ?? null,
                citaHora:     structured.cita_hora  ?? null,
                servicio:     structured.servicio   ?? null,
                phone,
              }),
            }).catch(console.error);
          } else {
            sendEmail({
              to:      structured.email,
              from:    fromAddr,
              subject: `Gracias por contactar a ${agentForEmail.business_name}`,
              html:    leadFollowUpToClientHtml({
                branding,
                businessName: agentForEmail.business_name,
                agentName:    senderName,
                clientName:   structured.nombre  ?? null,
                servicio:     structured.servicio ?? null,
                phone,
              }),
            }).catch(console.error);
          }
        }
      }

      // 3. Update minutes, only if the call was successfully logged
      if (callInsertError) {
        console.error('webhook: voice_calls insert failed, skipping minutes increment', callInsertError);
        break;
      }
      const minutes = Math.ceil(durationSeconds / 60) || 1;

      // 4. Fetch agent for notifications
      const { data: agent } = await supabase
        .from('voice_agents')
        .select('business_name, agent_name, client_email, transfer_whatsapp, portal_token, portal_email, notify_whatsapp, notify_email, minutes_used, minutes_included, minutes_reset_date, active, phone_number, vapi_agent_id, missed_call_recovery, google_review_url, stripe_customer_id, auto_refill_enabled, auto_refill_threshold, auto_refill_minutes, features, outbound_role, knowledge_base')
        .eq('id', resolvedAgentId)
        .single();

      // 5. Increment minutes — account-level if portal_email, per-agent for demo/standalone
      let used         = 0;
      let included     = 0;
      let resetDateStr = ',';

      if (agent?.portal_email) {
        await supabase.rpc('increment_account_minutes_used', { p_portal_email: agent.portal_email, minutes });
        const { data: acct } = await supabase
          .from('account_minutes')
          .select('minutes_used, minutes_included, minutes_reset_date')
          .eq('portal_email', agent.portal_email)
          .single();
        used     = acct?.minutes_used     ?? 0;
        included = acct?.minutes_included ?? 0;
        if (acct?.minutes_reset_date) {
          resetDateStr = new Date(acct.minutes_reset_date + 'T00:00:00').toLocaleDateString('es-MX', { day: 'numeric', month: 'long' });
        }
      } else {
        await supabase.rpc('increment_minutes_used', { agent_id: resolvedAgentId, minutes });
        used     = (agent?.minutes_used     ?? 0) + minutes;
        included = agent?.minutes_included ?? 0;
        if (agent?.minutes_reset_date) {
          resetDateStr = new Date(agent.minutes_reset_date + 'T00:00:00').toLocaleDateString('es-MX', { day: 'numeric', month: 'long' });
        }
      }

      const pct = included > 0 ? (used / included) * 100 : 0;

      // 5. WhatsApp call summary to owner, runs before auto-pause so it always fires
      if (agent?.transfer_whatsapp && (agent.notify_whatsapp ?? true)) {
        const outcomeLabels: Record<string, string> = {
          lead_created:       '🎯 Nuevo lead',
          appointment_booked: '📅 Cita agendada',
          order_taken:        '🛒 Pedido tomado',
          transferred:        '📞 Transferida',
          info_provided:      'ℹ️ Info proporcionada',
          escalated_whatsapp: '💬 Escalada a WhatsApp',
          missed:             '📵 Llamada perdida',
          other:              '📱 Llamada terminada',
        };
        const mins = Math.max(1, Math.ceil(durationSeconds / 60));
        const cleanSummary = summary
          ? summary.replace(/#{1,6}\s*/g, '').replace(/\*\*(.*?)\*\*/g, '*$1*').trim()
          : null;
        const interesEmoji = structured?.nivel_interes === 'alto'
          ? '🔥 Alto'
          : structured?.nivel_interes === 'medio'
          ? '🟡 Medio'
          : structured?.nivel_interes === 'bajo'
          ? '🔵 Bajo'
          : null;

        const msg = [
          `🟣 *Centinelia* · ${agent.business_name}`,
          '━━━━━━━━━━━━━━━━━━━',
          `${outcomeLabels[outcome] ?? '📱 Llamada'} · ⏱ ${mins} min`,
          callerNumber ? `📞 ${callerNumber}` : null,
          interesEmoji ? `🎯 Interés: ${interesEmoji}` : null,
          cleanSummary ? `\n${cleanSummary}` : null,
          structured?.acciones_pendientes ? `\n✅ *Pendiente:* ${structured.acciones_pendientes}` : null,
        ].filter(Boolean).join('\n');
        await sendWhatsApp(agent.transfer_whatsapp, msg);
      }

      // 6. Auto-refill: trigger when remaining just crossed below threshold this call
      if (
        agent?.auto_refill_enabled &&
        agent?.stripe_customer_id &&
        included > 0
      ) {
        const threshold     = (agent as any).auto_refill_threshold ?? 50;
        const remaining     = included - used;
        const prevRemaining = remaining + minutes; // balance before this call
        if (prevRemaining >= threshold && remaining < threshold) {
          const refill = await executeAutoRefill(resolvedAgentId).catch(() => ({ ok: false }));
          if (refill.ok) included += (agent as any).auto_refill_minutes ?? 100;
        }
      }

      // 7. Auto-pause at 100%
      if (agent?.active && used >= included) {
        if (agent.portal_email) {
          const { data: accountAgents } = await supabase
            .from('voice_agents').select('id, phone_number').eq('portal_email', agent.portal_email).eq('active', true);
          if (accountAgents?.length) {
            await supabase.from('voice_agents').update({ active: false }).eq('portal_email', agent.portal_email);
            for (const a of accountAgents) {
              if (a.phone_number) await pauseVapiAgent(a.phone_number);
            }
          }
        } else {
          await supabase.from('voice_agents').update({ active: false }).eq('id', resolvedAgentId);
          if (agent.phone_number) await pauseVapiAgent(agent.phone_number);
        }
        const pauseMsg = `⚠️ *Límite de minutos alcanzado, ${agent.business_name}*\n\nTu agente de voz ha sido *pausado automáticamente* al haber utilizado los ${included} minutos de tu plan.\n\nContacta a tu asesor de Centinelia para reactivar el servicio o adquirir minutos adicionales.`;
        if (agent.transfer_whatsapp) await sendWhatsApp(agent.transfer_whatsapp, pauseMsg);
        if (agent.client_email) {
          await sendEmail({
            to: agent.client_email,
            subject: `⚠️ Agente pausado, ${agent.business_name}`,
            html: minutesAlertHtml({ businessName: agent.business_name, pct: 100, used, included, resetDate: resetDateStr, portalUrl: `${process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.centinelia.mx'}/portal/${agent.portal_token}` }),
          }).catch(console.error);
        }
        break;
      }

      // 8. Warning at 80% (uses updated included if auto-refill fired)
      const pctAfterRefill = included > 0 ? (used / included) * 100 : 0;
      if (agent?.active && pctAfterRefill >= 80 && (pctAfterRefill - (minutes / included) * 100) < 80) {
        const warnMsg = `📊 *Aviso de minutos, ${agent.business_name}*\n\nHas usado el *${Math.round(pct)}%* de tus ${included} minutos incluidos (${used} usados).\n\nContacta a tu asesor de Centinelia si necesitas ampliar tu plan antes de que el agente se pause automáticamente.`;
        if (agent.transfer_whatsapp) await sendWhatsApp(agent.transfer_whatsapp, warnMsg);
        if (agent.client_email) {
          await sendEmail({
            to: agent.client_email,
            subject: `📊 Aviso: ${Math.round(pct)}% de minutos usados, ${agent.business_name}`,
            html: minutesAlertHtml({ businessName: agent.business_name, pct, used, included, resetDate: resetDateStr, portalUrl: `${process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.centinelia.mx'}/portal/${agent.portal_token}` }),
          }).catch(console.error);
        }
      }

      // 8. Review request to caller (if agent has google_review_url and call was substantive)
      const reviewUrl = agent?.google_review_url ?? null;
      const callerWa  = structured?.whatsapp ?? callerNumber;
      const goodCall  = ['info_provided', 'appointment_booked', 'lead_created', 'order_taken'].includes(outcome);
      if (reviewUrl && callerWa && goodCall && durationSeconds >= 60) {
        const reviewMsg = `¡Hola! Gracias por contactar a *${agent?.business_name}*. Si le atendimos bien, nos ayudaría mucho dejar una reseña en Google 🙏\n\n${reviewUrl}`;
        await sendWhatsApp(callerWa, reviewMsg).catch(() => null);
      }

      // 10. Shared customer profile + cross-agent trigger chain
      if (callerNumber && agent?.portal_email && durationSeconds > 5) {
        const customerId = await upsertCustomer(
          agent.portal_email,
          callerNumber,
          structured?.nombre ?? undefined,
        );
        if (customerId) {
          await logInteraction({
            customerId,
            agentId:   resolvedAgentId,
            agentRole: deriveAgentRole(agent),
            type:      outcome,
            summary:   summary ?? `${outcome} · ${Math.max(1, Math.ceil(durationSeconds / 60))} min`,
            outcome,
          });

          if (['lead_created', 'appointment_booked', 'order_taken'].includes(outcome)) {
            triggerCrossAgentQueue(
              agent.portal_email,
              resolvedAgentId,
              callerNumber,
              structured,
            ).catch(err => console.error('[webhook] cross-agent queue failed:', err));
          }
        }
      }

      // 11. Extract learnings from transcript (fire-and-forget, only for substantive calls)
      if (transcript && durationSeconds >= 120 && agent?.portal_email && outcome !== 'unanswered') {
        extractAndSaveLearnings({
          agentId:       resolvedAgentId,
          portalEmail:   agent.portal_email,
          vapiCallId:    call?.id ?? null,
          transcript,
          knowledgeBase: (agent as any).knowledge_base ?? null,
        }).catch(err => console.error('[webhook] extract-learnings failed:', err));
      }

      // 12. Post to team feed for meaningful outcomes (fire-and-forget)
      if (agent?.portal_email && !['unanswered', 'other'].includes(outcome)) {
        generateTeamMessage({
          portalEmail:   agent.portal_email,
          fromAgentId:   resolvedAgentId,
          fromAgentRole: deriveAgentRole(agent),
          vapiCallId:    call?.id ?? null,
          outcome,
          summary,
          structured,
          callerNumber,
        }).catch(err => console.error('[webhook] team-message failed:', err));
      }

      // 9. Missed call recovery — call back unanswered callers automatically
      if (
        outcome === 'unanswered' &&
        callerNumber &&
        agent?.missed_call_recovery &&
        agent?.active &&
        agent?.vapi_agent_id &&
        agent?.phone_number
      ) {
        triggerOutboundCall({
          agent:          agent as any,
          customerNumber: callerNumber,
          isCallback:     true,
        }).catch(err => console.error('[webhook] missed_call_recovery failed:', err));
      }

      break;
    }

    default:
      break;
  }

  return NextResponse.json({ ok: true });
}

const OUTBOUND_ROLE_LABELS: Record<string, string> = {
  vendedor:     'Ejecutivo de ventas',
  cotizador:    'Cotizador',
  seguimiento:  'Agente de seguimiento',
  recuperacion: 'Ejecutivo de recuperación',
  cobrador:     'Cobrador',
};

function deriveAgentRole(agent: any): string {
  if (agent.outbound_role) return OUTBOUND_ROLE_LABELS[agent.outbound_role] ?? agent.outbound_role;
  const f = agent.features ?? {};
  if (f.appointment_booking) return 'Recepcionista';
  if (f.order_taking)        return 'Tomador de pedidos';
  if (f.lead_qualification)  return 'Recepcionista';
  return 'Recepcionista';
}

async function triggerCrossAgentQueue(
  portalEmail:    string,
  sourceAgentId:  string,
  callerPhone:    string,
  structured:     any,
): Promise<void> {
  const supabase = createAdminClient();

  const { data: peers } = await supabase
    .from('voice_agents')
    .select('id, features, outbound_role, agent_name')
    .eq('portal_email', portalEmail)
    .neq('id', sourceAgentId)
    .eq('active', true);

  if (!peers?.length) return;

  const normPhone = callerPhone.replace(/\D/g, '').slice(-10);

  for (const peer of peers) {
    if (!(peer.features as any)?.outbound_calls) continue;

    // Skip if this number is already in the peer's queue
    const { data: existing } = await supabase
      .from('outbound_contacts')
      .select('id')
      .eq('agent_id', peer.id)
      .ilike('telefono', `%${normPhone}`)
      .maybeSingle();

    if (existing) continue;

    const roleLabel = peer.outbound_role
      ? (OUTBOUND_ROLE_LABELS[peer.outbound_role] ?? peer.outbound_role)
      : (peer.agent_name?.trim() ?? 'Agente');

    const motiParts: string[] = ['Derivado automáticamente por Recepcionista.'];
    if (structured?.servicio)      motiParts.push(`Interesado en: ${structured.servicio}.`);
    if (structured?.timeline)      motiParts.push(`Timeline: ${structured.timeline}.`);
    if (structured?.nivel_interes) motiParts.push(`Nivel de interés: ${structured.nivel_interes}.`);
    if (structured?.presupuesto)   motiParts.push(`Presupuesto: ${structured.presupuesto}.`);

    await supabase.from('outbound_contacts').insert({
      agent_id: peer.id,
      nombre:   structured?.nombre ?? null,
      telefono: callerPhone,
      motivo:   motiParts.join(' '),
      source:   'cross_agent',
    });

    console.log(`[cross-agent] Queued ${normPhone} → ${roleLabel} (agent ${peer.id})`);
  }
}

function detectOutcome(message: any, structured: any): string {
  const toolCalls: string[] = (message.toolCallResults ?? []).map((r: any) => r.name ?? '');

  if (toolCalls.includes('crear_lead'))                  return 'lead_created';
  if (toolCalls.includes('agendar_cita'))                return 'appointment_booked';
  if (toolCalls.includes('registrar_pedido'))            return 'order_taken';
  if (toolCalls.includes('notificar_transferencia'))     return 'transferred';
  if (toolCalls.includes('enviar_whatsapp_escalacion'))  return 'escalated_whatsapp';

  if (structured) {
    const tipo = structured.tipo_contacto ?? '';
    if (tipo === 'lead'         || (structured.nombre && structured.servicio)) return 'lead_created';
    if (tipo === 'cita'         || structured.cita_fecha)                       return 'appointment_booked';
    if (tipo === 'pedido'       || structured.pedido_items)                     return 'order_taken';
    if (tipo === 'transferencia')                                                return 'transferred';
  }

  const transcript = (message.transcript ?? '').toLowerCase();
  if (transcript.length > 50) return 'info_provided';
  return 'other';
}
