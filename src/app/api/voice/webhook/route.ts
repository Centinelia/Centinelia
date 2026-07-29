import { NextRequest, NextResponse, after } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import type { VoiceAgent } from '@/types/agent';
import { sendWhatsApp } from '@/lib/whatsapp/send';
import { sendEmail, minutesAlertHtml, newLeadHtml, appointmentConfirmationToClientHtml, leadFollowUpToClientHtml } from '@/lib/email/send';
import { pauseVapiAgent } from '@/lib/vapi/control';
import { triggerOutboundCall } from '@/lib/vapi/outbound';
import { executeAutoRefill } from '@/lib/billing/auto-refill';
import { getCustomerContext, upsertCustomer, logInteraction } from '@/lib/customers';
import { extractAndSaveLearnings } from '@/lib/ai/extract-learnings';
import { generateTeamMessage } from '@/lib/ai/generate-team-message';
import { selfEvalCall } from '@/lib/ai/self-eval';
import { cesEvalCall } from '@/lib/ai/ces-eval';
import { ingestCall as ingestMemory } from '@/lib/memory';
import { getGoalsContext } from '@/lib/goals/progress';
import { checkVoiceInitiative } from '@/lib/initiative/detector';
import { addCallEntry } from '@/lib/notion/client';

export async function POST(req: NextRequest) {
  const vapiSecret = process.env.VAPI_SERVER_SECRET;
  if (vapiSecret) {
    const headerSecret = req.headers.get('x-vapi-secret');
    const querySecret  = req.nextUrl.searchParams.get('secret');
    if (headerSecret !== vapiSecret && querySecret !== vapiSecret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
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

      // Inject dynamic context (customer + goals) as additional system messages
      const dynamicMessages: Array<{ role: string; content: string }> = [];

      if (callerNumber && agent.portal_email) {
        const ctx = await getCustomerContext(agent.portal_email, callerNumber);
        if (ctx) dynamicMessages.push({ role: 'system', content: ctx });
      }

      const goalsCtx = await getGoalsContext(agent.id);
      if (goalsCtx) dynamicMessages.push({ role: 'system', content: goalsCtx });

      const assistantOverrides = dynamicMessages.length > 0
        ? { model: { messages: dynamicMessages } }
        : undefined;

      return NextResponse.json({
        assistantId: agent.vapi_agent_id,
        ...(assistantOverrides ? { assistantOverrides } : {}),
      });
    }

    case 'end-of-call-report': {
      const call = message.call;

      console.log('[webhook] end-of-call-report received. call.id:', call?.id,
        '| message.assistantId:', message.assistantId,
        '| call.assistantId:', call?.assistantId,
        '| message.assistant?.metadata:', JSON.stringify(message.assistant?.metadata),
        '| call?.assistant?.metadata:', JSON.stringify(call?.assistant?.metadata));

      const agentId: string =
        message.assistant?.metadata?.agent_id   ??
        call?.assistant?.metadata?.agent_id      ??
        call?.metadata?.agent_id                 ??
        message.metadata?.agent_id               ??
        '';

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

      const rawStartedAt = call?.startedAt ?? message.startedAt;
      const rawEndedAt   = call?.endedAt   ?? message.endedAt;
      const startedAt    = rawStartedAt ? new Date(rawStartedAt).getTime() : 0;
      const endedAt      = rawEndedAt   ? new Date(rawEndedAt).getTime()   : 0;
      const durationSeconds = startedAt && endedAt ? Math.round((endedAt - startedAt) / 1000) : 0;

      const analysis     = message.analysis ?? call?.analysis ?? null;
      const structured   = analysis?.structuredData ?? null;
      const rawOutcome   = detectOutcome(message, structured);
      const outcome      = durationSeconds <= 5 ? 'unanswered' : rawOutcome;
      const transcript   = message.transcript ?? call?.transcript ?? null;
      const summary      = analysis?.summary ?? message.summary ?? call?.summary ?? null;
      const recordingUrl = call?.recordingUrl ?? message.artifact?.recordingUrl ?? null;
      const callerNumber = call?.customer?.number ?? message.customer?.number ?? '';

      // 1. Log call
      const { data: callRow, error: callInsertError } = await supabase.from('voice_calls').insert({
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
      }).select('id').single();
      const callDbId: string | null = (callRow as { id?: string } | null)?.id ?? null;

      // 2. Save lead
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

      // 2b. Save appointment
      if (structured?.tipo_contacto === 'cita' || structured?.cita_fecha) {
        const telefono = structured.cita_telefono ?? structured.whatsapp ?? callerNumber ?? null;
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

      // 2c. Outbound contact upsert (race-safe — unique constraint on agent_id,telefono)
      const callTypeRaw   = call?.type ?? '';
      const isInboundCall = !callTypeRaw || callTypeRaw === 'inboundPhoneCall';
      if (isInboundCall && callerNumber && durationSeconds > 5) {
        await supabase.from('outbound_contacts').upsert({
          agent_id: resolvedAgentId,
          nombre:   structured?.nombre ?? null,
          telefono: callerNumber,
          motivo:   null,
          source:   'llamada_entrante',
        }, { onConflict: 'agent_id,telefono', ignoreDuplicates: true });

        if (structured?.nombre) {
          await supabase.from('outbound_contacts')
            .update({ nombre: structured.nombre })
            .eq('agent_id', resolvedAgentId)
            .eq('telefono', callerNumber)
            .is('nombre', null);
        }
      }

      // 2d. Caller profile for future context injection
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

      if (callInsertError) {
        console.error('webhook: voice_calls insert failed, skipping minutes increment', callInsertError);
        break;
      }

      const minutes = Math.ceil(durationSeconds / 60) || 1;

      // 3. Fetch agent once — covers minutes critical path + all deferred notifications
      const { data: _agent } = await supabase
        .from('voice_agents')
        .select('*')
        .eq('id', resolvedAgentId)
        .single();
      const agent = _agent as VoiceAgent | null;

      // 4. Increment minutes — account-level if portal_email, per-agent for demo/standalone
      let used         = 0;
      let included     = 0;
      let resetDateStr = '';

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

      // 5. Auto-refill: trigger when remaining just crossed below threshold this call
      let includedAfterRefill = included;
      if (agent?.auto_refill_enabled && agent?.stripe_customer_id && included > 0) {
        const threshold     = agent.auto_refill_threshold ?? 50;
        const remaining     = included - used;
        const prevRemaining = remaining + minutes;
        if (prevRemaining >= threshold && remaining < threshold) {
          const refill = await executeAutoRefill(resolvedAgentId).catch(() => ({ ok: false }));
          if (refill.ok) includedAfterRefill += agent.auto_refill_minutes ?? 100;
        }
      }

      // 6. Auto-pause: update DB + Vapi synchronously; notifications deferred via after()
      // Guard `includedAfterRefill > 0`: sin plan válido (o portal sin fila en
      // account_minutes) la comparación `used=0 >= included=0` era TRUE y
      // desactivaba el agente después de cada llamada. Fix del bug detectado
      // en Nia Monterrey pre-piloto.
      let agentWasPaused = false;
      if (agent?.active && includedAfterRefill > 0 && used >= includedAfterRefill) {
        agentWasPaused = true;
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
      }

      const pct    = includedAfterRefill > 0 ? (used / includedAfterRefill) * 100 : 0;
      const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.centinelia.mx';

      // ── All notifications and AI tasks run after the HTTP response ─────
      after(async () => {
        // A. Pause notifications — skip everything else when paused
        if (agentWasPaused && agent) {
          const pauseMsg = `⚠️ *Límite de minutos alcanzado, ${agent.business_name}*\n\nTu agente de voz ha sido *pausado automáticamente* al haber utilizado los ${includedAfterRefill} minutos de tu plan.\n\nContacta a tu asesor de Centinelia para reactivar el servicio o adquirir minutos adicionales.`;
          if (agent.transfer_whatsapp) await sendWhatsApp(agent.transfer_whatsapp, pauseMsg).catch(console.error);
          if (agent.client_email) {
            await sendEmail({
              to:      agent.client_email,
              subject: `⚠️ Agente pausado, ${agent.business_name}`,
              html:    minutesAlertHtml({ businessName: agent.business_name, pct: 100, used, included: includedAfterRefill, resetDate: resetDateStr, portalUrl: `${appUrl}/portal/${agent.portal_token}` }),
            }).catch(console.error);
          }
          return;
        }

        // B. WhatsApp call summary to owner (opt-in, off by default)
        if (agent?.transfer_whatsapp && (agent.notify_whatsapp ?? false)) {
          const outcomeLabels: Record<string, string> = {
            lead_created:       '🎯 Nuevo lead',
            appointment_booked: '📅 Cita agendada',
            order_taken:        '🛒 Pedido tomado',
            transferred:        '📞 Transferida',
            info_provided:      'ℹ️ Info proporcionada',
            escalated_whatsapp: '💬 Escalada',
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
          await sendWhatsApp(agent.transfer_whatsapp, msg).catch(console.error);
        }

        // C. 80% usage warning
        const pctBefore = includedAfterRefill > 0 ? ((used - minutes) / includedAfterRefill) * 100 : 0;
        if (agent?.active && pct >= 80 && pctBefore < 80) {
          const warnMsg = `📊 *Aviso de minutos, ${agent.business_name}*\n\nHas usado el *${Math.round(pct)}%* de tus ${includedAfterRefill} minutos incluidos (${used} usados).\n\nContacta a tu asesor de Centinelia si necesitas ampliar tu plan antes de que el agente se pause automáticamente.`;
          if (agent.transfer_whatsapp) await sendWhatsApp(agent.transfer_whatsapp, warnMsg).catch(console.error);
          if (agent.client_email) {
            await sendEmail({
              to:      agent.client_email,
              subject: `📊 Aviso: ${Math.round(pct)}% de minutos usados, ${agent.business_name}`,
              html:    minutesAlertHtml({ businessName: agent.business_name, pct, used, included: includedAfterRefill, resetDate: resetDateStr, portalUrl: `${appUrl}/portal/${agent.portal_token}` }),
            }).catch(console.error);
          }
        }

        // D. Owner notification email
        const notifyOutcomes = ['lead_created', 'appointment_booked', 'order_taken', 'transferred', 'info_provided'];
        if (agent?.client_email && (agent.notify_email ?? true) && notifyOutcomes.includes(outcome)) {
          const portalUrl = `${appUrl}/portal/${agent.portal_token}`;
          const outcomeSubjects: Record<string, string> = {
            lead_created:       '🎯 Nuevo lead capturado',
            appointment_booked: '📅 Cita agendada',
            order_taken:        '🛒 Nuevo pedido',
            transferred:        '📞 Llamada transferida',
            info_provided:      'ℹ️ Llamada informativa',
          };
          await sendEmail({
            to:      agent.client_email,
            subject: `${outcomeSubjects[outcome] ?? '📱 Llamada'}, ${agent.business_name}`,
            html:    newLeadHtml({
              businessName:  agent.business_name,
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

          // E. Email to caller when they provided their email during the call
          if (structured?.email && ['appointment_booked', 'lead_created'].includes(outcome)) {
            const senderName   = agent.agent_name ?? agent.business_name;
            const verifiedFrom = agent.email_domain_verified && agent.email_from
              ? agent.email_from
              : 'notificaciones@centinelia.mx';
            const fromAddr     = `${agent.business_name} <${verifiedFrom}>`;
            const phone        = agent.phone_number ?? null;
            const branding     = {
              logoUrl:    agent.logo_url ?? agent.email_logo_url ?? null,
              brandColor: agent.email_brand_color ?? '#6C3BFF',
              footerText: agent.email_footer_text ?? null,
              website:    agent.brand_website     ?? null,
              address:    agent.brand_address     ?? null,
              senderName: agent.business_name,
            };
            if (outcome === 'appointment_booked') {
              await sendEmail({
                to:      structured.email,
                from:    fromAddr,
                subject: `Tu cita en ${agent.business_name} está confirmada`,
                html:    appointmentConfirmationToClientHtml({
                  branding,
                  businessName: agent.business_name,
                  agentName:    senderName,
                  clientName:   structured.nombre    ?? null,
                  citaFecha:    structured.cita_fecha ?? null,
                  citaHora:     structured.cita_hora  ?? null,
                  servicio:     structured.servicio   ?? null,
                  phone,
                }),
              }).catch(console.error);
            } else {
              await sendEmail({
                to:      structured.email,
                from:    fromAddr,
                subject: `Gracias por contactar a ${agent.business_name}`,
                html:    leadFollowUpToClientHtml({
                  branding,
                  businessName: agent.business_name,
                  agentName:    senderName,
                  clientName:   structured.nombre  ?? null,
                  servicio:     structured.servicio ?? null,
                  phone,
                }),
              }).catch(console.error);
            }
          }
        }

        // F. Customer profile + cross-agent trigger chain
        if (callerNumber && agent?.portal_email && durationSeconds > 5) {
          const customerId = await upsertCustomer(
            agent.portal_email,
            callerNumber,
            structured?.nombre ?? undefined,
          ).catch(() => null);
          if (customerId) {
            await logInteraction({
              customerId,
              agentId:   resolvedAgentId,
              agentRole: deriveAgentRole(agent),
              type:      outcome,
              summary:   summary ?? `${outcome} · ${Math.max(1, Math.ceil(durationSeconds / 60))} min`,
              outcome,
            }).catch(console.error);
            if (['lead_created', 'appointment_booked', 'order_taken'].includes(outcome)) {
              await triggerCrossAgentQueue(
                agent.portal_email,
                resolvedAgentId,
                callerNumber,
                structured,
              ).catch(err => console.error('[webhook] cross-agent queue failed:', err));
            }
          }
        }

        // H. Extract learnings (AI — only for substantive calls)
        if (transcript && durationSeconds >= 120 && agent?.portal_email && outcome !== 'unanswered') {
          await extractAndSaveLearnings({
            agentId:       resolvedAgentId,
            portalEmail:   agent.portal_email,
            vapiCallId:    call?.id ?? null,
            transcript,
            knowledgeBase: agent?.knowledge_base ?? null,
          }).catch(err => console.error('[webhook] extract-learnings failed:', err));
        }

        // I. Self-evaluation post-call (AI)
        if (transcript && durationSeconds >= 30 && callDbId && outcome !== 'unanswered') {
          await selfEvalCall({
            callId:     callDbId,
            transcript,
            outcome,
            dod:        (agent as unknown as Record<string, unknown>)?.definition_of_done as string | null ?? null,
            guardrails: (agent as unknown as Record<string, unknown>)?.agent_guardrails   as string | null ?? null,
          }).catch(err => console.error('[webhook] self-eval failed:', err));
        }

        // J. CES — Conversational Experience Score (feeds global platform learning)
        if (transcript && durationSeconds >= 30 && callDbId && outcome !== 'unanswered') {
          await cesEvalCall({
            callId:    callDbId,
            transcript,
          }).catch(err => console.error('[webhook] ces-eval failed:', err));
        }

        // K. Memory graph ingestion — extract entities+facts al grafo por customer.
        //     Fire-and-forget: no bloquea response al webhook Vapi. Si falla,
        //     solo se pierde memoria de esa llamada; próxima llamada reintenta.
        if (transcript && durationSeconds >= 30 && callDbId && outcome !== 'unanswered') {
          ingestMemory({
            agentId:      resolvedAgentId,
            callId:       callDbId,
            transcript,
            callerNumber: callerNumber ?? undefined,
          }).catch(err => console.error('[webhook] memory-ingest failed:', err));
        }

        // K. Team feed message (AI)
        if (agent?.portal_email && !['unanswered', 'other'].includes(outcome)) {
          await generateTeamMessage({
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

        // L. Notion CRM
        const notionToken = agent?.notion_access_token ?? null;
        const notionDbId  = agent?.notion_db_id        ?? null;
        if (notionToken && notionDbId && outcome !== 'unanswered') {
          const TIPO_MAP: Record<string, string> = {
            lead_created:       'Lead',
            appointment_booked: 'Cita',
            order_taken:        'Pedido',
          };
          const callDate = rawEndedAt
            ? new Date(rawEndedAt).toISOString().slice(0, 10)
            : new Date().toISOString().slice(0, 10);
          await addCallEntry({
            accessToken: notionToken,
            dbId:        notionDbId,
            nombre:      structured?.nombre ?? null,
            tipo:        TIPO_MAP[outcome] ?? 'Llamada',
            fecha:       callDate,
            telefono:    callerNumber || null,
            servicio:    structured?.servicio ?? structured?.pedido_items ?? null,
            resumen:     summary,
            outcome,
            accion:      structured?.acciones_pendientes ?? null,
          }).catch(err => console.error('[webhook] notion addCallEntry failed:', err));
        }

        // N. Initiative — detect recurring patterns across voice calls
        if (agent?.transfer_whatsapp && outcome !== 'unanswered') {
          await checkVoiceInitiative(
            resolvedAgentId,
            agent.agent_name ?? agent.business_name ?? 'tu empleado',
            agent.transfer_whatsapp,
          ).catch(err => console.error('[webhook] initiative check failed:', err));
        }

        // M. Missed call recovery
        if (
          outcome === 'unanswered' &&
          callerNumber &&
          agent?.missed_call_recovery &&
          agent?.active &&
          agent?.vapi_agent_id &&
          agent?.phone_number
        ) {
          await triggerOutboundCall({
            agent:          agent!,
            customerNumber: callerNumber,
            isCallback:     true,
          }).catch(err => console.error('[webhook] missed_call_recovery failed:', err));
        }
      });

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

function deriveAgentRole(agent: Partial<VoiceAgent>): string {
  if (agent.role?.trim()) return agent.role.trim();
  const f = (agent.features ?? {}) as Partial<VoiceAgent['features']>;
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

  const { data: _peers } = await supabase
    .from('voice_agents')
    .select('id, features, role, agent_name')
    .eq('portal_email', portalEmail)
    .neq('id', sourceAgentId)
    .eq('active', true);

  if (!_peers?.length) return;

  type PeerRow = Pick<VoiceAgent, 'id' | 'features' | 'role' | 'agent_name'>;
  const peers = _peers as PeerRow[];

  const normPhone = callerPhone.replace(/\D/g, '').slice(-10);

  for (const peer of peers) {
    if (!peer.features?.outbound_calls) continue;

    // Skip if this number is already in the peer's queue
    const { data: existing } = await supabase
      .from('outbound_contacts')
      .select('id')
      .eq('agent_id', peer.id)
      .ilike('telefono', `%${normPhone}`)
      .maybeSingle();

    if (existing) continue;

    const roleLabel = peer.role?.trim() || peer.agent_name?.trim() || 'Agente';

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
