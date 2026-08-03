import { NextRequest, NextResponse, after } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import type { VoiceAgent } from '@/types/agent';
import { sendWhatsApp } from '@/lib/whatsapp/send';
import { sendEmail, minutesAlertHtml, newLeadHtml, appointmentConfirmationToClientHtml, leadFollowUpToClientHtml } from '@/lib/email/send';
import { consumePoolMinutes, fireOverageAlertIfNeeded } from '@/lib/annual-contracts/pool-consume';
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
import { getMeerkatIdForAgentRow } from '@/lib/vapi/meerkat-map';
import { resolveMeerkatVersionForAgent } from '@/lib/feature-flags/version-flag-resolver';
import { evaluateFlagsForOrg } from '@/lib/feature-flags/all-active';

export async function POST(req: NextRequest) {
  const vapiSecret = process.env.VAPI_SERVER_SECRET;
  const headerSecret = req.headers.get('x-vapi-secret');
  const querySecret  = req.nextUrl.searchParams.get('secret');

  // Debug logging temporal — pre-piloto Monterrey. Quitar después.
  console.log('[voice/webhook] AUTH DEBUG', {
    hasEnvSecret: !!vapiSecret,
    envSecretLen: vapiSecret?.length ?? 0,
    envSecretFirst4: vapiSecret?.slice(0, 4) ?? null,
    hasHeaderSecret: !!headerSecret,
    headerSecretLen: headerSecret?.length ?? 0,
    headerSecretFirst4: headerSecret?.slice(0, 4) ?? null,
    hasQuerySecret: !!querySecret,
    querySecretLen: querySecret?.length ?? 0,
    querySecretFirst4: querySecret?.slice(0, 4) ?? null,
    headerMatch: headerSecret === vapiSecret,
    queryMatch: querySecret === vapiSecret,
    url: req.nextUrl.pathname + req.nextUrl.search.slice(0, 60),
  });

  if (vapiSecret) {
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

      // Observability snapshot — fetch agent row with features for meerkat/flags resolution
      const { data: obsAgentRow } = await supabase
        .from('voice_agents')
        .select('id, portal_email, features')
        .eq('id', resolvedAgentId)
        .maybeSingle();

      const obs = await resolveObservabilitySnapshot(obsAgentRow, call);

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
        meerkat_id:          obs.meerkat_id,
        meerkat_version:     obs.meerkat_version,
        active_flags:        obs.active_flags,
        latency_ms_p50:      obs.latency_ms_p50,
        latency_ms_p95:      obs.latency_ms_p95,
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

      // 2b. Save appointment — REMOVIDO.
      //
      // Antes: si el structured post-call decia tipo_contacto=cita o venia cita_fecha,
      // se INSERTABA cita automatica sin importar si el modelo llamo agendar_cita
      // durante la llamada. Este "safety net" causo bugs graves: llamadas cortadas
      // a mitad donde el cliente solo MENCIONO una fecha (sin confirmar) generaban
      // citas fantasma con status=confirmada, sin starts_at, sin conflict check.
      //
      // Fix: la cita solo se crea si el modelo llama agendar_cita durante la
      // llamada (el tool call es la fuente de verdad). Si el modelo por alguna
      // razon no la llamo, mejor no crear cita que crear una falsa.
      //
      // Si en el futuro necesitamos recuperar citas mencionadas pero no
      // agendadas via tool, hacerlo con un flujo separado + revision humana.

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

      // 4. Increment minutes — 3 paths:
      //    (a) annual_prepaid: pool compartido en organizations (no pausa, tracks overage)
      //    (b) stripe con portal_email: account_minutes shared
      //    (c) stripe standalone (demo/legacy): per-agent
      let used         = 0;
      let included     = 0;
      let resetDateStr = '';
      let poolConsumed = false;   // annual → skip auto-pause + minutes-alert emails

      if (agent?.portal_email) {
        const pool = await consumePoolMinutes(agent.portal_email, minutes);
        if (pool.consumed) {
          poolConsumed = true;
          used     = pool.minutes_used_after;
          included = pool.minutes_pool;
          // E4: overage alert interno (fire and forget)
          void fireOverageAlertIfNeeded(agent.portal_email, {
            crossed_100_threshold: pool.crossed_100_threshold,
            crossed_120_threshold: pool.crossed_120_threshold,
          });
          // resetDateStr se resuelve del organizations.pool_reset_date en E-mails
          // internos; el cliente annual no recibe minutesAlertHtml.
        } else {
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
      let refillAttemptFailed = false;
      let refillFailError: string | null = null;
      // Guard: annual_prepaid no usa Stripe auto-refill (los minutos extra se
      // negocian con Centinelia como addendum al contrato).
      if (!poolConsumed && agent?.auto_refill_enabled && agent?.stripe_customer_id && included > 0) {
        const threshold     = agent.auto_refill_threshold ?? 50;
        const remaining     = included - used;
        const prevRemaining = remaining + minutes;
        if (prevRemaining >= threshold && remaining < threshold) {
          const refill = await executeAutoRefill(resolvedAgentId).catch((err: unknown) => {
            // Silent fail crítico previo: si Stripe declinaba, refill quedaba sin log
            // y agent se pausaba sin explicar el motivo al cliente.
            console.error('[voice-webhook] auto_refill_failed', { agentId: resolvedAgentId, error: String(err) });
            return { ok: false, error: String(err) } as const;
          });
          if (refill.ok) {
            includedAfterRefill += agent.auto_refill_minutes ?? 100;
          } else {
            refillAttemptFailed = true;
            refillFailError = ('error' in refill ? refill.error : null) ?? 'auto_refill_declined';
          }
        }
      }

      // 6. Auto-pause: update DB + Vapi synchronously; notifications deferred via after()
      // Guard `includedAfterRefill > 0`: sin plan válido (o portal sin fila en
      // account_minutes) la comparación `used=0 >= included=0` era TRUE y
      // desactivaba el agente después de cada llamada. Fix del bug detectado
      // en Nia Monterrey pre-piloto.
      // Guard: annual_prepaid nunca pausa por consumo (empleados no paran, overage
      // se cobra en renovación). Ver docs/superpowers/specs/2026-08-02-annual-contracts-design.md §5.4.
      let agentWasPaused = false;
      if (!poolConsumed && agent?.active && includedAfterRefill > 0 && used >= includedAfterRefill) {
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
        // A0. Auto-refill declinada: notificar antes que el pause message para
        // que el cliente sepa distinguir "sin plan" de "Stripe rechazó tarjeta".
        if (refillAttemptFailed && agent) {
          const refillMsg = `⚠️ *Recarga automática falló, ${agent.business_name}*\n\nIntenté recargar tus minutos pero Stripe no procesó el pago. Verifica tu método de pago en el portal antes de que el agente se pause.\n\n${appUrl}/portal/${agent.portal_token}`;
          if (agent.transfer_whatsapp) await sendWhatsApp(agent.transfer_whatsapp, refillMsg).catch(console.error);
          if (agent.client_email) {
            await sendEmail({
              to:      agent.client_email,
              subject: `⚠️ Recarga automática falló, ${agent.business_name}`,
              html:    `<p>Intentamos ejecutar tu recarga automática pero Stripe rechazó el cargo.</p><p><strong>Motivo:</strong> ${refillFailError ?? 'no especificado'}</p><p>Verifica tu método de pago en el <a href="${appUrl}/portal/${agent.portal_token}">portal</a> antes de que el agente se pause.</p>`,
            }).catch(console.error);
          }
        }

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

        // C. 80% usage warning — solo para Stripe. Annual usa E4 (interno a Nazre) al 100/120%.
        const pctBefore = includedAfterRefill > 0 ? ((used - minutes) / includedAfterRefill) * 100 : 0;
        if (!poolConsumed && agent?.active && pct >= 80 && pctBefore < 80) {
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
        // Skip cuando el caller ES el dueño/equipo — no tiene sentido notificarle
        // que "un cliente hizo X" cuando fue él mismo quien llamó. Este check
        // usa la misma lógica que inbound/route.ts.
        const notifyOutcomes = ['lead_created', 'appointment_booked', 'order_taken', 'transferred', 'info_provided'];
        const normCallerD  = (callerNumber ?? '').replace(/\D/g, '').slice(-10);
        const teamNumbersD = (agent?.team_numbers ?? []) as Array<{ number: string; is_owner?: boolean; name?: string }>;
        const normTransferD = (agent?.transfer_number   ?? '').replace(/\D/g, '').slice(-10);
        const normWaD       = (agent?.transfer_whatsapp ?? '').replace(/\D/g, '').slice(-10);
        const callerIsInternal = normCallerD.length >= 7 && (
          (normTransferD && normCallerD === normTransferD) ||
          (normWaD       && normCallerD === normWaD)       ||
          teamNumbersD.some(t => (t.number ?? '').replace(/\D/g, '').slice(-10) === normCallerD)
        );

        if (agent?.client_email && (agent.notify_email ?? true) && notifyOutcomes.includes(outcome) && !callerIsInternal) {
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

        // K. Team feed message (AI) — skip cuando el caller es dueño/equipo
        // (no tiene sentido feed "Un cliente preguntó..." si fue él mismo llamando).
        if (agent?.portal_email && !['unanswered', 'other'].includes(outcome) && !callerIsInternal) {
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

// ── Pilar 5 — Observabilidad segmentada ──────────────────────────────────────

type ObsSnapshot = {
  meerkat_id: string | null;
  meerkat_version: number | null;
  active_flags: string[] | null;
  latency_ms_p50: number | null;
  latency_ms_p95: number | null;
};

async function resolveObservabilitySnapshot(
  agentRow: { id: string; portal_email: string | null; features: unknown } | null,
  call: unknown,
): Promise<ObsSnapshot> {
  const empty: ObsSnapshot = {
    meerkat_id: null,
    meerkat_version: null,
    active_flags: null,
    latency_ms_p50: null,
    latency_ms_p95: null,
  };
  if (!agentRow) return empty;

  let meerkatId: string | null = null;
  let meerkatVer: number | null = null;
  let activeFlags: string[] | null = null;

  try {
    meerkatId = getMeerkatIdForAgentRow(agentRow);
    if (meerkatId) {
      const featuresObj =
        agentRow.features && typeof agentRow.features === 'object'
          ? (agentRow.features as Record<string, unknown>)
          : {};
      meerkatVer = await resolveMeerkatVersionForAgent(meerkatId, {
        portal_email: agentRow.portal_email,
        features: featuresObj as { pinned_meerkat_version?: number | null; [k: string]: unknown },
      });
    }
  } catch (e) {
    console.warn('[obs] meerkat resolve failed', { agentId: agentRow.id, error: String(e) });
  }

  try {
    if (agentRow.portal_email) {
      activeFlags = await evaluateFlagsForOrg(agentRow.portal_email);
    }
  } catch (e) {
    console.warn('[obs] flags resolve failed', { agentId: agentRow.id, error: String(e) });
  }

  const c = call as Record<string, unknown> | null | undefined;
  const metrics = (c?.performanceMetrics ?? (c?.metrics as Record<string, unknown> | undefined)) as
    | Record<string, unknown>
    | undefined;
  const latencyMs = (metrics?.latency ?? metrics?.latencyMs) as
    | Record<string, unknown>
    | undefined;

  const toInt = (v: unknown): number | null =>
    typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : null;

  return {
    meerkat_id: meerkatId,
    meerkat_version: meerkatVer,
    active_flags: activeFlags,
    latency_ms_p50: toInt(latencyMs?.p50),
    latency_ms_p95: toInt(latencyMs?.p95),
  };
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
