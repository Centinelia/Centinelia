import { NextRequest, NextResponse, after } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import type { VoiceAgent } from '@/types/agent';
import { sendWhatsApp } from '@/lib/whatsapp/send';
import { sendEmail, minutesAlertHtml, appointmentConfirmationToClientHtml, leadFollowUpToClientHtml } from '@/lib/email/send';
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
import { getOrgToken } from '@/lib/portal/org-token';

export async function POST(req: NextRequest) {
  // Fix T8 audit 2026-08-10: hardening Vapi webhook auth.
  // Antes: if (vapiSecret) — si env no seteado, ACEPTABA cualquier POST.
  //        String comparison sin timing-safe. Query param secret loggable en URLs.
  // Ahora: rechaza si secret no seteado + timingSafeEqual + header-only preferido.
  const vapiSecret = process.env.VAPI_SERVER_SECRET;
  if (!vapiSecret) {
    console.error('[voice/webhook] VAPI_SERVER_SECRET not set — rejecting all requests');
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
      // Fix T2 audit 2026-08-10: Math.max clamp evita negativos si Vapi manda
      // endedAt<startedAt (clock skew / data corruption). Antes se insertaba
      // duration_seconds negativo en voice_calls → portal/aggregations rotos.
      const durationSeconds = Math.max(0, startedAt && endedAt ? Math.round((endedAt - startedAt) / 1000) : 0);

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
        cost_usd:            message.cost ?? call?.cost ?? null,
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

      // 2c. Outbound contact dedupe por sufijo de 10 dígitos.
      // La unique constraint es sobre expresión (RIGHT(digits, 10)), así que
      // supabase.upsert() no funciona con onConflict de columna. Hacemos
      // check-first: si existe contacto con este teléfono normalizado,
      // update; si no, insert.
      const callTypeRaw   = call?.type ?? '';
      const isInboundCall = !callTypeRaw || callTypeRaw === 'inboundPhoneCall';
      const callerSuffix  = (callerNumber ?? '').replace(/\D/g, '').slice(-10);
      if (isInboundCall && callerSuffix.length >= 10 && durationSeconds > 5) {
        const { data: existingContacts } = await supabase
          .from('outbound_contacts')
          .select('id, nombre, telefono')
          .eq('agent_id', resolvedAgentId);
        const existing = (existingContacts ?? []).find(c =>
          (c.telefono as string ?? '').replace(/\D/g, '').endsWith(callerSuffix)
        );
        if (!existing) {
          await supabase.from('outbound_contacts').insert({
            agent_id: resolvedAgentId,
            nombre:   structured?.nombre ?? null,
            telefono: callerNumber,
            motivo:   null,
            source:   'llamada_entrante',
          });
        } else if (structured?.nombre && !existing.nombre) {
          await supabase.from('outbound_contacts')
            .update({ nombre: structured.nombre })
            .eq('id', existing.id as string);
        }

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

      // Llamadas unanswered (duration <=5s por outcome-normalize línea 158) NO
      // cobran minutos ni escriben ledger de consumo — evita cobrar por drops
      // pre-conexión (auditor Municipio: "esta llamada no conectó, ¿por qué se
      // cobró?"). Se preserva el row en voice_calls con duration_seconds real
      // para audit trail. Si en el futuro queremos un ledger row explícito
      // kind='unanswered_call' con amount=0, hacerlo en apply_ledger_entry.
      const shouldChargeMinutes = outcome !== 'unanswered' && durationSeconds >= 3;
      const minutes = shouldChargeMinutes ? (Math.ceil(durationSeconds / 60) || 1) : 0;

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

      if (shouldChargeMinutes && agent?.portal_email) {
        const pool = await consumePoolMinutes(agent.portal_email, minutes, { callId: call?.id ?? null, agentId: resolvedAgentId });
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
          // Ledger event-sourced: insert debit + trigger refresca account_minutes cache.
          // consume_pool_minutes devuelve el balance despues del debit.
          await supabase.rpc('consume_pool_minutes', {
            p_portal_email: agent.portal_email,
            p_agent_id:     resolvedAgentId,
            p_minutes:      minutes,
            p_call_id:      call?.id ?? null,
          });
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
      } else if (shouldChargeMinutes) {
        await supabase.rpc('increment_minutes_used', { agent_id: resolvedAgentId, minutes });
        used     = (agent?.minutes_used     ?? 0) + minutes;
        included = agent?.minutes_included ?? 0;
        if (agent?.minutes_reset_date) {
          resetDateStr = new Date(agent.minutes_reset_date + 'T00:00:00').toLocaleDateString('es-MX', { day: 'numeric', month: 'long' });
        }
      } else {
        // Unanswered: fetch snapshot para downstream (auto-pause guard needs `included`)
        // sin incrementar. Cero cambios de estado.
        if (agent?.portal_email) {
          const { data: acct } = await supabase
            .from('account_minutes')
            .select('minutes_used, minutes_included, minutes_reset_date')
            .eq('portal_email', agent.portal_email)
            .maybeSingle();
          used     = acct?.minutes_used     ?? 0;
          included = acct?.minutes_included ?? 0;
          if (acct?.minutes_reset_date) {
            resetDateStr = new Date(acct.minutes_reset_date + 'T00:00:00').toLocaleDateString('es-MX', { day: 'numeric', month: 'long' });
          }
        } else {
          used     = agent?.minutes_used     ?? 0;
          included = agent?.minutes_included ?? 0;
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

        // Fix M-c audit 2026-08-10: audit trail explícito del state change.
        // Antes: pause era silent en el ledger — auditor veía consumo y luego
        // gap sin explicación. Ahora ledger row amount=0 kind='auto_paused'.
        await supabase.from('minutes_ledger').insert({
          portal_email: agent.portal_email ?? null,
          agent_id:     resolvedAgentId,
          amount:       0,
          description:  `Agente pausado automáticamente · ${used}/${includedAfterRefill} min consumidos`,
          source:       'ajuste',
          kind:         'auto_paused',
          reference_id: call?.id ? `pause_${call.id}` : null,
        });
      }

      const pct    = includedAfterRefill > 0 ? (used / includedAfterRefill) * 100 : 0;
      const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.centinelia.mx';
      const orgTokenForUrl = agent?.portal_email ? await getOrgToken(agent.portal_email, supabase) : null;
      const portalTokenForUrl = orgTokenForUrl ?? agent?.portal_token ?? null;

      // ── All notifications and AI tasks run after the HTTP response ─────
      // D-L1 tracking: registrar el work en voice_call_pending_work para
      // detectar si Vercel corta antes de completar (30s ceiling). Cron
      // rescue-voice-webhook-work escala al owner via Nash si queda stuck.
      const pendingWorkCallId = (call?.id as string | undefined) ?? crypto.randomUUID();
      await supabase.from('voice_call_pending_work').upsert({
        call_id:      pendingWorkCallId,
        agent_id:     agentId,
        portal_email: agent?.portal_email ?? null,
        started_at:   new Date().toISOString(),
        processed_at: null,
        status:       'pending',
        metadata:     { outcome, duration_seconds: durationSeconds },
      }, { onConflict: 'call_id' });
      after(async () => {
        // A0. Auto-refill declinada: notificar antes que el pause message para
        // que el cliente sepa distinguir "sin plan" de "Stripe rechazó tarjeta".
        if (refillAttemptFailed && agent) {
          const refillMsg = `⚠️ *Recarga automática falló, ${agent.business_name}*\n\nIntenté recargar tus minutos pero Stripe no procesó el pago. Verifica tu método de pago en el portal antes de que el agente se pause.\n\n${appUrl}/portal/${portalTokenForUrl}`;
          if (agent.transfer_whatsapp) await sendWhatsApp(agent.transfer_whatsapp, refillMsg).catch(console.error);
          if (agent.client_email) {
            await sendEmail({
              to:      agent.client_email,
              subject: `⚠️ Recarga automática falló, ${agent.business_name}`,
              html:    `<p>Intentamos ejecutar tu recarga automática pero Stripe rechazó el cargo.</p><p><strong>Motivo:</strong> ${refillFailError ?? 'no especificado'}</p><p>Verifica tu método de pago en el <a href="${appUrl}/portal/${portalTokenForUrl}">portal</a> antes de que el agente se pause.</p>`,
            }).catch(console.error);
          }
        }

        // A. Pause notifications — skip everything else when paused
        if (agentWasPaused && agent) {
          // Paridad con el email `minutesAlertHtml`: menciona que las tareas
          // de oficina siguen funcionando aunque las llamadas estén pausadas.
          // Antes: WA no lo decía → cliente creía que TODO estaba caído.
          const pauseMsg = [
            `⚠️ *Llamadas pausadas, ${agent.business_name}*`,
            '',
            `Consumiste los ${includedAfterRefill} minutos de tu plan. Las llamadas están pausadas hasta que compres minutos extra o renueves.`,
            'Las tareas de oficina siguen funcionando normalmente.',
            '',
            `Reactiva desde tu portal: ${appUrl}/portal/${portalTokenForUrl}?tab=cuenta`,
          ].join('\n');
          if (agent.transfer_whatsapp) await sendWhatsApp(agent.transfer_whatsapp, pauseMsg).catch(console.error);
          if (agent.client_email) {
            await sendEmail({
              to:      agent.client_email,
              subject: `⚠️ Agente pausado, ${agent.business_name}`,
              html:    minutesAlertHtml({ businessName: agent.business_name, pct: 100, used, included: includedAfterRefill, resetDate: resetDateStr, portalUrl: `${appUrl}/portal/${portalTokenForUrl}`, jornadaType: (agent.jornada_type as 'combinada' | 'minutos' | 'tareas' | undefined) }),
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
        // Re-fetch account_minutes justo antes de emitir para que WA/email
        // muestren los mismos números que el portal (evita drift por rollover_cap
        // o auto-refill que llegó entre consume y notify). Ver
        // [[feedback-audit-read-path-fidelity]].
        const pctBefore = includedAfterRefill > 0 ? ((used - minutes) / includedAfterRefill) * 100 : 0;
        if (!poolConsumed && agent?.active && pct >= 80 && pctBefore < 80) {
          let notifyUsed     = used;
          let notifyIncluded = includedAfterRefill;
          if (agent.portal_email) {
            const { data: freshAcct } = await supabase
              .from('account_minutes')
              .select('minutes_used, minutes_included')
              .eq('portal_email', agent.portal_email)
              .maybeSingle();
            if (freshAcct) {
              notifyUsed     = (freshAcct.minutes_used     as number | null) ?? notifyUsed;
              notifyIncluded = (freshAcct.minutes_included as number | null) ?? notifyIncluded;
            }
          }
          const notifyPct = notifyIncluded > 0 ? (notifyUsed / notifyIncluded) * 100 : pct;
          const warnMsg = [
            `📊 *Aviso de minutos, ${agent.business_name}*`,
            '',
            `Has usado el *${Math.round(notifyPct)}%* de tus ${notifyIncluded} minutos incluidos (${notifyUsed} usados).`,
            '',
            'Puedes ampliar tu plan o comprar minutos extra desde tu portal antes de que las llamadas se pausen automáticamente.',
            'Las tareas de oficina siguen funcionando aunque las llamadas lleguen al límite.',
          ].join('\n');
          if (agent.transfer_whatsapp) await sendWhatsApp(agent.transfer_whatsapp, warnMsg).catch(console.error);
          if (agent.client_email) {
            await sendEmail({
              to:      agent.client_email,
              subject: `📊 Aviso: ${Math.round(notifyPct)}% de minutos usados, ${agent.business_name}`,
              html:    minutesAlertHtml({ businessName: agent.business_name, pct: notifyPct, used: notifyUsed, included: notifyIncluded, resetDate: resetDateStr, portalUrl: `${appUrl}/portal/${portalTokenForUrl}`, jornadaType: (agent.jornada_type as 'combinada' | 'minutos' | 'tareas' | undefined) }),
            }).catch(console.error);
          }
        }

        // D. Owner notification email
        // Skip cuando el caller ES el dueño/equipo — no tiene sentido notificarle
        // que "un cliente hizo X" cuando fue él mismo quien llamó.
        // Dos señales de "internal caller":
        //   (a) su número coincide con transfer_number / transfer_whatsapp /
        //       team_numbers (verificación por identidad de número).
        //   (b) usó la passphrase durante la llamada (verificación por conocimiento
        //       compartido — funciona incluso si llama desde cualquier número).
        //       Se detecta por presencia fuzzy del passphrase en el transcript.
        const notifyOutcomes = ['lead_created', 'appointment_booked', 'order_taken', 'transferred', 'info_provided'];
        const normCallerD  = (callerNumber ?? '').replace(/\D/g, '').slice(-10);
        const { loadOrgDirectory, toTeamNumbers } = await import('@/lib/portal/directory');
        const directoryD   = await loadOrgDirectory(agent?.portal_email as string | null, supabase);
        const teamNumbersD = toTeamNumbers(directoryD);
        const normTransferD = (agent?.transfer_number   ?? '').replace(/\D/g, '').slice(-10);
        const normWaD       = (agent?.transfer_whatsapp ?? '').replace(/\D/g, '').slice(-10);
        const callerNumberIsInternal = normCallerD.length >= 7 && (
          (normTransferD && normCallerD === normTransferD) ||
          (normWaD       && normCallerD === normWaD)       ||
          teamNumbersD.some(t => (t.number ?? '').replace(/\D/g, '').slice(-10) === normCallerD)
        );

        // Passphrase detection en transcript — el que la sabe es interno,
        // sin importar el número. Owner_passphrase vive en organizations.
        let passphraseUsed = false;
        if (transcript && agent?.portal_email) {
          const { data: orgRow } = await supabase
            .from('organizations')
            .select('owner_passphrase')
            .eq('portal_email', agent.portal_email)
            .maybeSingle();
          const phrase = (orgRow?.owner_passphrase as string | null)?.trim().toLowerCase();
          if (phrase && phrase.length >= 3) {
            // Fuzzy: strip puntuación y acentos, compara substring.
            const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ');
            passphraseUsed = norm(String(transcript)).includes(norm(phrase));
          }
        }

        const callerIsInternal = callerNumberIsInternal || passphraseUsed;

        // Fix T7 audit 2026-08-10: log passphrase bypass a platform_incidents.
        // Sin este log, un passphrase leaked se explota indefinidamente sin
        // visibilidad. Nazre + Nash pueden revisar bypasses sospechosos.
        if (passphraseUsed) {
          await supabase.from('platform_incidents').insert({
            title:                 `Passphrase bypass — ${agent?.business_name ?? 'desconocido'}`,
            description:           `Un caller usó el owner_passphrase durante la llamada. Duration: ${durationSeconds}s. Caller: ${callerNumber ?? 'privado'}. Call ID: ${call?.id ?? 'n/a'}. Si este número no coincide con el owner conocido, revisar posible fuga del passphrase.`,
            priority:              'med',
            source:                'error_log',
            source_id:             call?.id ?? null,
            affected_portal_email: agent?.portal_email ?? null,
            status:                'open',
            assigned_to:           'owner',
          });
        }

        // Auto-tag por outcome (Fase E): agrega el tag correspondiente al
        // contacto de outbound_contacts si existe uno con este teléfono.
        // Los tags alimentan la segmentación de futuras campañas.
        // Mapping: lead_created → 'interesado', appointment_booked → 'cotizó',
        //          order_taken → 'compró'
        const autoTag = outcome === 'lead_created'       ? 'interesado'
                      : outcome === 'appointment_booked' ? 'cotizó'
                      : outcome === 'order_taken'        ? 'compró'
                      : null;
        if (autoTag && normCallerD.length >= 10 && agent?.id) {
          try {
            const suffix = normCallerD.slice(-10);
            const { data: matches } = await supabase
              .from('outbound_contacts')
              .select('id, telefono, tags')
              .eq('agent_id', agent.id as string);
            for (const c of matches ?? []) {
              const digits = (c.telefono as string ?? '').replace(/\D+/g, '');
              if (!digits.endsWith(suffix)) continue;
              const existing = (c.tags as string[] | null) ?? [];
              if (existing.includes(autoTag)) continue;
              const next = [...existing, autoTag].slice(0, 20);
              await supabase.from('outbound_contacts').update({ tags: next }).eq('id', c.id as string);
            }
          } catch (err) {
            console.error('[voice/webhook auto-tag]', err);
          }
        }

        if (agent?.client_email && (agent.notify_email ?? true) && notifyOutcomes.includes(outcome) && !callerIsInternal) {
          // Encolamos al digest diario. Marca urgent=true para lead_created
          // y transferred (el owner querría enterarse en el momento); el resto
          // agrupa al cierre del día. Ver src/lib/notifications/queue.ts.
          const { queueNotificationEvent } = await import('@/lib/notifications/queue');
          const isUrgent = outcome === 'lead_created' || outcome === 'transferred';
          await queueNotificationEvent({
            portalEmail: agent.portal_email as string,
            agentId:     agent.id as string,
            kind:        'call_outcome',
            urgent:      isUrgent,
            payload: {
              outcome,
              callerNumber,
              nombre:   structured?.nombre   ?? null,
              servicio: structured?.servicio ?? structured?.pedido_items ?? null,
              whatsapp: structured?.whatsapp ?? null,
              email:    structured?.email    ?? null,
              summary,
            },
          });

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

        // Mark work as done — si Vercel corta antes de este UPDATE, la row
        // queda pending y el cron rescue escalará.
        await supabase.from('voice_call_pending_work')
          .update({ status: 'done', processed_at: new Date().toISOString() })
          .eq('call_id', pendingWorkCallId);
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

    // Dedup por sufijo — no duplica si ya hay contacto con este teléfono
    // para el peer. Match tolerante a variaciones de formato.
    const suffix = (callerPhone ?? '').replace(/\D/g, '').slice(-10);
    if (suffix.length >= 10) {
      const { data: existingCross } = await supabase
        .from('outbound_contacts')
        .select('id, telefono')
        .eq('agent_id', peer.id);
      const already = (existingCross ?? []).some(c =>
        (c.telefono as string ?? '').replace(/\D/g, '').endsWith(suffix)
      );
      if (!already) {
        await supabase.from('outbound_contacts').insert({
          agent_id: peer.id,
          nombre:   structured?.nombre ?? null,
          telefono: callerPhone,
          motivo:   motiParts.join(' '),
          source:   'cross_agent',
        });
      }
    }

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
  // Vapi expone las tool calls en varios shapes según el tipo de mensaje.
  // En end-of-call-report NO llega `toolCallResults`, sino que las invocaciones
  // aparecen dentro de `message.artifact.messages[]` como entries con role
  // 'tool_calls' (contiene toolCalls[]) o con `role: 'assistant'` + toolCalls
  // en el mismo objeto. También intentamos leer el field legacy por si acaso.
  const tools = new Set<string>();
  const legacyResults = message.toolCallResults ?? message.toolCalls ?? [];
  for (const r of legacyResults) {
    const name = r?.name ?? r?.function?.name;
    if (name) tools.add(name);
  }
  const artifactMessages = message.artifact?.messages ?? message.call?.artifact?.messages ?? [];
  for (const m of artifactMessages) {
    // Caso 1: entry con role='tool_calls' — el objeto contiene toolCalls[]
    // Caso 2: entry con role='assistant' que también trae toolCalls[]
    // Caso 3: entry con role='tool_call_result' con { name, result }
    const calls = m?.toolCalls ?? [];
    for (const c of calls) {
      const name = c?.function?.name ?? c?.name;
      if (name) tools.add(name);
    }
    if (m?.role === 'tool' || m?.role === 'tool_call_result') {
      const name = m.name ?? m.toolName;
      if (name) tools.add(name);
    }
  }

  // Tools específicas primero — más precisas que el fallback structured.
  // registrar_incidencia y registrar_cliente_nuevo van antes que crear_lead
  // porque una queja o alta puede a la vez completar el structured.tipo=lead
  // (misma llamada captura datos de contacto), y queremos el outcome más
  // específico.
  if (tools.has('registrar_incidencia'))        return 'incident_registered';
  if (tools.has('registrar_cliente_nuevo'))     return 'lead_created';
  if (tools.has('crear_lead'))                  return 'lead_created';
  if (tools.has('agendar_cita'))                return 'appointment_booked';
  if (tools.has('registrar_pedido'))            return 'order_taken';
  if (tools.has('notificar_transferencia'))     return 'transferred';

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
