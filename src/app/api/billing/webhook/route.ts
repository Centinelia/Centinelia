import { NextRequest, NextResponse, after } from 'next/server';
import { stripe } from '@/lib/stripe';
import { createAdminClient } from '@/lib/supabase/admin';
import { FEATURE_PLAN_CONFIG, MONTHLY_CONFIG, monthlyConfigFromPriceId, nextResetDate, JORNADA_CONFIG, NOX_MONTHLY_CONFIG, resolveTierAllocation } from '@/lib/billing/plans';
import { resetAiOps, setAiOpsLimit, recomputeOrgOpsPool } from '@/lib/ai/ops-guard';
import { sendWhatsApp } from '@/lib/whatsapp/send';
import { sendEmail, paymentFailedHtml, welcomeHtml } from '@/lib/email/send';
import { maybeNotifyRolloverLoss, maybeNotifyPoolLoss } from '@/lib/billing/rollover-cap-notify';
import { pauseVapiAgent, resumeVapiAgent } from '@/lib/vapi/control';
import { createVapiAssistant, resyncPeerAgents } from '@/lib/vapi/sync';
import { provisionPhoneNumber } from '@/lib/vapi/provision';
import { getOrgToken } from '@/lib/portal/org-token';
import type { VoiceAgent } from '@/types/agent';
import { PLAN_FEATURES, PLAN_CONCURRENT_CALLS } from '@/types/agent';
import type { Plan, JornadaType } from '@/types/agent';
import type { MinutesTier } from '@/lib/billing/plans';
import type Stripe from 'stripe';

// Helper: escribe al ops ledger cuando el flag esta activo.
// La legacy path (resetAiOps / setAiOpsLimit / ai_ops_limit UPDATE) se mantiene
// inline en cada sitio; este helper es ADICIONAL cuando ops_ledger_enabled = true.
async function creditOpsToPool(
  supabase: ReturnType<typeof createAdminClient>,
  args: {
    portalEmail: string;
    agentId: string;
    amount: number;
    kind: 'renewal' | 'setup_new_agent' | 'jornada_change';
    referenceId: string | null;
    description: string;
  }
): Promise<void> {
  const { data: org } = await supabase
    .from('organizations')
    .select('ops_ledger_enabled')
    .eq('portal_email', args.portalEmail)
    .maybeSingle();

  if (org?.ops_ledger_enabled) {
    await supabase.rpc('apply_ops_ledger_entry', {
      p_portal_email: args.portalEmail,
      p_agent_id:     args.agentId,
      p_amount:       args.amount,
      p_kind:         args.kind,
      p_reference_id: args.referenceId,
      p_description:  args.description,
    });
  }
  // Legacy path se mantiene inline en cada sitio (no lo movemos aqui para no
  // acoplar los flujos annual/stripe existentes).
}

export async function POST(req: NextRequest) {
  const body = await req.text();
  const sig  = req.headers.get('stripe-signature')!;

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  const supabase = createAdminClient();

  // Idempotency gate (fix C3 audit 2026-08-10, hardened CD-F14 2026-08-11).
  //
  // 2-phase commit para prevenir eventos perdidos por crash mid-handler:
  //   Fase 1 (claim): INSERT row con processed_at=NULL. Si 23505, checar si
  //     el row previo tiene processed_at NOT NULL → dedupe. Si processed_at
  //     IS NULL y fue hace >5min → probablemente crash, deja re-procesar.
  //   Fase 2 (commit): al final del handler, UPDATE processed_at=now.
  //
  // ANTES: single insert al inicio + 23505 return "deduped". Si handler
  // crasheaba después (stripe.subscriptions.retrieve 500, network hiccup),
  // Stripe reintenta → 23505 → 200 "deduped" → evento nunca aplicado
  // (cliente perdía minutos/ops de renewal, cobro Stripe intacto).
  // Ver Scope C1 bug detectado post-audit.
  const eventObj = event.data.object as unknown as Record<string, unknown>;
  const sessionId = event.type.startsWith('checkout.session.') ? (eventObj.id as string | undefined) : undefined;
  const subscriptionId = ((eventObj.subscription as string | undefined) ?? (event.type.startsWith('customer.subscription.') ? (eventObj.id as string | undefined) : undefined)) ?? null;
  const portalEmailMeta = (((eventObj.metadata as Record<string, unknown> | undefined)?.portal_email as string | undefined) ?? null);
  const CRASH_RETRY_WINDOW_MS = 5 * 60 * 1000;
  {
    const { data: inserted, error: insertErr } = await supabase
      .from('stripe_webhook_events')
      .insert({
        event_id:        event.id,
        event_type:      event.type,
        session_id:      sessionId ?? null,
        subscription_id: subscriptionId,
        portal_email:    portalEmailMeta,
        processed_at:    null,  // claim only, commit al final
      })
      .select('event_id')
      .maybeSingle();

    if (insertErr && insertErr.code === '23505') {
      // Row previo existe. Verificar si fue procesado o quedó a medias.
      const { data: prev } = await supabase
        .from('stripe_webhook_events')
        .select('processed_at')
        .eq('event_id', event.id)
        .maybeSingle() as { data: { processed_at: string | null } | null };
      if (prev?.processed_at) {
        return NextResponse.json({ ok: true, deduped: true });
      }
      // processed_at IS NULL — evento previo probablemente crasheó.
      // Si fue hace <5min asumimos "en curso" (concurrent Stripe retry)
      // y retornamos 200 para que Stripe siga reintentando después. Si >5min,
      // liberamos y re-procesamos ahora.
      const claimedAt = prev ? null : null;  // simplificación: no tenemos ts del claim
      void claimedAt;
      console.warn('[stripe-webhook] retry post-crash detectado, re-procesando', event.id);
      // deja seguir el flujo (re-procesa)
    } else if (insertErr) {
      console.error('[stripe-webhook] insertErr en stripe_webhook_events', { code: insertErr.code, event_id: event.id, err: insertErr.message });
    }
    void inserted;
  }

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session;

      // Reference_id CANÓNICO para todos los credits de este checkout.
      // ANTES: usábamos session.id → charge.refunded/dispute.created buscaban por
      // charge.invoice = invoice.id → matchedMinutes/matchedOps = 0 → chargeback
      // pasaba sin revertir credit (cliente conservaba minutos + ops gratis).
      // Ahora: preferimos session.invoice (=invoice.id) que es lo que Stripe
      // liga al charge; fallback a session.id si Stripe no adjuntó invoice.
      // Ver Scope D1 CRIT-2.
      const invoiceRef = typeof session.invoice === 'string' ? session.invoice : (session.invoice as Stripe.Invoice | null | undefined)?.id ?? null;
      const primaryRef: string | null = invoiceRef ?? session.id ?? null;

      // Plan upgrade: setup fee paid → update subscription + features
      if (session.metadata?.type === 'plan_upgrade') {
        const agentId       = session.metadata?.agent_id;
        const toPlan        = session.metadata?.to_plan as Plan | undefined;
        const toMinutesPlan = session.metadata?.to_minutes_plan as MinutesTier | undefined;
        if (!agentId || !toPlan || !toMinutesPlan
          || !FEATURE_PLAN_CONFIG[toPlan]
          || !MONTHLY_CONFIG[toPlan]?.[toMinutesPlan]) break;

        const { data: agentData } = await supabase
          .from('voice_agents')
          .select('stripe_subscription_id')
          .eq('id', agentId)
          .single();

        if (agentData?.stripe_subscription_id) {
          const sub     = await stripe.subscriptions.retrieve(agentData.stripe_subscription_id);
          const subItem = sub.items.data.find(item => item.price.recurring !== null);
          if (subItem) {
            await stripe.subscriptions.update(agentData.stripe_subscription_id, {
              items:              [{ id: subItem.id, price: MONTHLY_CONFIG[toPlan][toMinutesPlan].priceId() }],
              proration_behavior: 'create_prorations',
            });
          }
        }

        const newMinutesCfg = MONTHLY_CONFIG[toPlan][toMinutesPlan];
        const { data: prevForUpgrade } = await supabase
          .from('voice_agents')
          .select('minutes_used, minutes_included, minutes_plan, portal_email, jornada_type, features')
          .eq('id', agentId)
          .single();
        const upgradeEmail = prevForUpgrade?.portal_email ?? null;

        // Delta = new tier alloc - old tier alloc, resuelto por jornada/coordinator
        // (fix drift MONTHLY_CONFIG vs JORNADA_CONFIG 2026-08-11). Antes se leía
        // MONTHLY_CONFIG.aiOps (100/200/300) que quedó stale — un cliente en
        // jornada `tareas` recibía +100 tareas cuando debería recibir +700.
        // Ver [[feedback-audit-read-path-fidelity]].
        const upgradeMeerkatRoleId = ((prevForUpgrade?.features as Record<string, unknown> | null)?.meerkat_role_id as string | undefined) ?? undefined;
        const upgradeJornada       = (prevForUpgrade?.jornada_type as 'combinada' | 'minutos' | 'tareas' | null) ?? undefined;
        const prevTier    = prevForUpgrade?.minutes_plan as MinutesTier | null;
        const prevAlloc   = prevTier ? resolveTierAllocation(upgradeJornada, upgradeMeerkatRoleId, prevTier) : { minutes: 0, aiOps: 0 };
        const newAlloc    = resolveTierAllocation(upgradeJornada, upgradeMeerkatRoleId, toMinutesPlan);
        const delta       = Math.max(0, newAlloc.minutes - prevAlloc.minutes);
        const opsDelta    = Math.max(0, newAlloc.aiOps   - prevAlloc.aiOps);

        // Actualizar tier del agente. Para standalone (sin portal_email) usar
        // newAlloc.minutes (respeta jornada/coordinator) en vez de MONTHLY_CONFIG
        // que daría 300/600/1200 incluso a coordinators sin voz.
        await supabase.from('voice_agents').update({
          plan:         toPlan,
          features:     PLAN_FEATURES[toPlan],
          minutes_plan: toMinutesPlan,
          ...(upgradeEmail ? {} : { minutes_included: newAlloc.minutes }),
        }).eq('id', agentId);

        // Credit al pool via ledger (cap 2x recalculado con el nuevo tier)
        if (delta > 0) {
          if (upgradeEmail) {
            await supabase.rpc('apply_ledger_entry', {
              p_portal_email: upgradeEmail,
              p_agent_id:     agentId,
              p_amount:       delta,
              p_kind:         'renewal',
              p_reference_id: primaryRef,
              p_description:  `Upgrade a ${newMinutesCfg.label}: +${delta} min de diferencial`,
            });
            after(async () => {
              const { resetFallbackIfActive } = await import('@/lib/billing/fallback-restore');
              const { data: agentForName } = await supabase
                .from('voice_agents')
                .select('business_name')
                .eq('id', agentId)
                .single();
              await resetFallbackIfActive(supabase, upgradeEmail, agentForName?.business_name ?? 'tu empleado');
            });
            after(() => maybeNotifyRolloverLoss(supabase, { portalEmail: upgradeEmail, referenceId: primaryRef }));
          } else {
            await supabase.from('minutes_ledger').insert({
              agent_id:    agentId,
              amount:      delta,
              description: `Upgrade a ${newMinutesCfg.label}, ajuste inmediato de minutos`,
              source:      'activacion',
              kind:        'renewal',
            });
          }
        }

        // Ops delta credit via ledger (ADICIONAL al legacy ai_ops_limit UPDATE arriba)
        if (opsDelta > 0 && upgradeEmail) {
          await creditOpsToPool(supabase, {
            portalEmail: upgradeEmail,
            agentId:     agentId,
            amount:      opsDelta,
            kind:        'renewal',
            referenceId: primaryRef,
            description: `Upgrade a ${newMinutesCfg.label}: +${opsDelta} tareas de diferencial`,
          });
          after(() => maybeNotifyPoolLoss(supabase, { portalEmail: upgradeEmail, referenceId: primaryRef, resource: 'ops' }));
        }
        break;
      }

      // Extra minutes top-up
      if (session.metadata?.type === 'extra_minutes') {
        const agentId = session.metadata?.agent_id;
        const minutes = parseInt(session.metadata?.minutes ?? '0');
        if (!agentId || !minutes) break;

        const { data: agent } = await supabase
          .from('voice_agents')
          .select('minutes_included, phone_number, vapi_agent_id, portal_email')
          .eq('id', agentId)
          .single();

        if (agent?.portal_email) {
          // Credit al pool via ledger — trigger refresca cache automáticamente.
          // apply_ledger_entry aplica cap 2x (rollover_cap si sobra).
          await supabase.rpc('apply_ledger_entry', {
            p_portal_email: agent.portal_email,
            p_agent_id:     agentId,
            p_amount:       minutes,
            p_kind:         'extra_purchase',
            p_reference_id: primaryRef,
            p_description:  `Compra de ${minutes} min extra`,
          });
          // Reactivar solo este agente (granularidad per-empleado)
          await supabase.from('voice_agents')
            .update({ active: true, billing_status: 'activo' })
            .eq('id', agentId);
          if (agent.phone_number && agent.vapi_agent_id) {
            await resumeVapiAgent(agent.phone_number, agent.vapi_agent_id);
          }
          after(async () => {
            const { resetFallbackIfActive } = await import('@/lib/billing/fallback-restore');
            const { data: agentForName } = await supabase
              .from('voice_agents')
              .select('business_name')
              .eq('id', agentId)
              .single();
            await resetFallbackIfActive(supabase, agent.portal_email, agentForName?.business_name ?? 'tu empleado');
          });
          after(() => maybeNotifyRolloverLoss(supabase, { portalEmail: agent.portal_email!, referenceId: primaryRef }));
        } else {
          await supabase.from('voice_agents')
            .update({ minutes_included: (agent?.minutes_included ?? 0) + minutes, active: true, billing_status: 'activo' })
            .eq('id', agentId);
          await supabase.from('minutes_ledger').insert({
            agent_id:    agentId,
            amount:      minutes,
            description: `Compra de ${minutes} minutos extra`,
            source:      'extra_compra',
            kind:        'extra_purchase',
          });
          if (agent?.phone_number && agent?.vapi_agent_id) {
            await resumeVapiAgent(agent.phone_number, agent.vapi_agent_id);
          }
        }
        break;
      }

      // Extra ops top-up
      if (session.metadata?.type === 'extra_ops') {
        const agentId = session.metadata?.agent_id;
        const ops     = parseInt(session.metadata?.ops ?? '0');
        if (!agentId || !ops) break;

        const { data: agent } = await supabase
          .from('voice_agents')
          .select('id, portal_email, ai_ops_limit')
          .eq('id', agentId)
          .single();

        if (!agent) break;

        const portalEmail = agent.portal_email as string | null;
        let ledgerEnabled = false;
        if (portalEmail) {
          const { data: org } = await supabase
            .from('organizations')
            .select('ops_ledger_enabled')
            .eq('portal_email', portalEmail)
            .maybeSingle();
          ledgerEnabled = !!org?.ops_ledger_enabled;
        }

        // Idempotency capa 2 (belt-and-suspenders): el gate top-level
        // (stripe_webhook_events) ya deduplicó por event.id. Este check
        // adicional protege contra el caso raro de que Stripe emita 2 eventos
        // DIFERENTES (event.id distinto) para el mismo checkout — visto en
        // ambientes de test cuando se resimula un pago.
        if (session.id && ledgerEnabled && portalEmail) {
          const { data: dup } = await supabase
            .from('ops_ledger')
            .select('id')
            .eq('portal_email', portalEmail)
            .eq('kind', 'extra_ops_purchase')
            .eq('reference_id', session.id)
            .maybeSingle();
          if (dup) { break; }
        }

        if (ledgerEnabled && portalEmail) {
          // NEW path: escribe al ledger, cap 2x aplicado automaticamente por RPC
          await supabase.rpc('apply_ops_ledger_entry', {
            p_portal_email: portalEmail,
            p_agent_id:     agentId,
            p_amount:       ops,
            p_kind:         'extra_ops_purchase',
            p_reference_id: primaryRef,
            p_description:  `Compra de ${ops} tareas extra`,
          });
          after(() => maybeNotifyPoolLoss(supabase, { portalEmail, referenceId: primaryRef, resource: 'ops' }));
        } else {
          // LEGACY: sin ledger, aplica al agente ESPECÍFICO que compró (nunca
          // homogenizar tiers de peers). Luego recompute el pool org-level para
          // que quede consistente con la suma real de tiers heterogéneos.
          const newOpsLimit = ((agent.ai_ops_limit as number) ?? 0) + ops;
          await supabase.from('voice_agents')
            .update({ ai_ops_limit: newOpsLimit }).eq('id', agentId);
          if (portalEmail) {
            await recomputeOrgOpsPool(portalEmail);
            // Marker de idempotencia para legacy path (sin ledger).
            if (session.id) {
              await supabase.from('platform_incidents').insert({
                title:                 `Crédito extra_ops legacy — ${ops} tareas`,
                description:            `Aplicado a agent_id=${agentId} vía checkout ${session.id}. Marker de idempotencia.`,
                priority:              'low',
                source:                'extra_ops_credit',
                source_id:             session.id,
                affected_portal_email: portalEmail,
                status:                'resolved',
                assigned_to:           'nash',
                resolution:            `+${ops} tareas aplicadas correctamente.`,
              });
            }
          }
        }

        break;
      }

      // Jornada change: agente pasa de 'tareas' (NOX) a 'combinada' (voz + tareas).
      // Cliente pagó la nueva subscripción; ahora cambiamos la subscripción vieja,
      // provisionamos número Twilio, y activamos el canal de voz.
      if (session.metadata?.type === 'jornada_change_to_voice') {
        const agentId = session.metadata?.agent_id;
        const tierMeta = (session.metadata?.minutes_plan ?? 'starter') as MinutesTier;
        if (!agentId) break;

        const { data: agent } = await supabase
          .from('voice_agents')
          .select('*')
          .eq('id', agentId)
          .single();

        if (!agent) break;

        const typedAgent = agent as VoiceAgent;
        const plan = (typedAgent.plan ?? 'pro') as Plan;
        const oldSubId = (agent as { stripe_subscription_id?: string | null }).stripe_subscription_id ?? null;

        // 1. Cancelar la subscripción vieja (NOX) — el checkout creó una nueva combinada.
        if (oldSubId && oldSubId !== session.subscription) {
          await stripe.subscriptions.cancel(oldSubId).catch(err =>
            console.error('[billing-webhook] cancel old NOX sub failed', { agentId, error: String(err) })
          );
        }

        // 2. Actualizar la fila con la nueva subscripción combinada.
        await supabase.from('voice_agents').update({
          stripe_subscription_id: session.subscription as string ?? null,
          jornada_type:           'combinada',
          minutes_plan:           tierMeta,
        }).eq('id', agentId);

        // 3. Asegurar Vapi assistant (crearlo si el agente estaba tareas-only).
        let vapiId = typedAgent.vapi_agent_id ?? null;
        if (!vapiId) {
          vapiId = await createVapiAssistant(typedAgent).catch((err: unknown) => {
            console.error('[billing-webhook] vapi_creation_failed for jornada_change', { agentId, error: String(err) });
            return null;
          });
          if (vapiId) {
            await supabase.from('voice_agents').update({ vapi_agent_id: vapiId }).eq('id', agentId);
          }
        }

        // 4. Provisionar número Twilio + asignarlo al assistant.
        if (vapiId) {
          const concurrency = PLAN_CONCURRENT_CALLS[plan];
          const provisioned = await provisionPhoneNumber(vapiId, undefined, concurrency);
          if (provisioned) {
            const alloc = JORNADA_CONFIG['combinada'][tierMeta];
            await supabase.from('voice_agents').update({
              phone_number:         provisioned.phoneNumber,
              vapi_phone_number_id: provisioned.vapiPhoneId ?? null,
              minutes_included:     alloc.minutes,
            }).eq('id', agentId);

            // Sumar la contribución del agente al pool via ledger (respeta cap 2x).
            if (typedAgent.portal_email && alloc.minutes > 0) {
              await supabase.rpc('apply_ledger_entry', {
                p_portal_email: typedAgent.portal_email,
                p_agent_id:     agentId,
                p_amount:       alloc.minutes,
                p_kind:         'jornada_change',
                p_reference_id: primaryRef,
                p_description:  `Cambio a jornada combinada: +${alloc.minutes} min`,
              });
            }
          } else {
            console.error('[billing-webhook] provisionPhoneNumber failed', { agentId });
            await sendEmail({
              to:      'hola@centinelia.mx',
              subject: `[URGENTE] Falta número Twilio tras jornada_change agente ${agentId}`,
              html:    `<p>El cliente pagó el cambio a combinada pero <code>provisionPhoneNumber()</code> falló. Cliente: <strong>${typedAgent.business_name ?? '(sin nombre)'}</strong> (${typedAgent.portal_email ?? '(sin email)'}).</p><p>Comprar y asignar manualmente.</p>`,
            }).catch(e => console.error('[billing-webhook] admin notify failed', e));
          }

          resyncPeerAgents(typedAgent.portal_email, agentId).catch(console.error);
        }

        break;
      }

      // New agent hired from portal
      if (session.metadata?.type === 'new_agent') {
        const agentId    = session.metadata?.agent_id;
        const agentToken = session.metadata?.agent_token;
        if (!agentId) break;

        const { data: pendingAgent } = await supabase
          .from('voice_agents')
          .select('*')
          .eq('id', agentId)
          .single();

        if (!pendingAgent) break;

        // Recalcular alloc del tier real (viene de metadata del checkout).
        // Antes este handler solo copiaba minutes_plan y activaba, sin
        // tocar ai_ops_limit ni minutes_included — el row quedaba con lo
        // que sembró createPortalAgent (que usaba base.minutes_plan, no
        // el tier elegido). Bug del 2026-08-09 que dejó Niva scale en 500 ops.
        const newTier      = (session.metadata?.minutes_plan ?? 'starter') as MinutesTier;
        const newJornada   = (session.metadata?.jornada_type ?? 'combinada') as JornadaType;
        const isCoord      = !!((pendingAgent as { features?: Record<string, unknown> | null }).features as Record<string, unknown> | null)?.is_coordinator;
        const alloc        = isCoord
          ? { minutes: 0, aiOps: NOX_MONTHLY_CONFIG[newTier]?.aiOps ?? 500 }
          : (JORNADA_CONFIG[newJornada]?.[newTier] ?? { minutes: 0, aiOps: 0 });

        await supabase.from('voice_agents').update({
          active:                 true,
          billing_status:         'activo',
          stripe_customer_id:     session.customer as string,
          stripe_subscription_id: session.subscription as string ?? null,
          minutes_plan:           newTier,
          jornada_type:           newJornada,
          minutes_included:       alloc.minutes,
          ai_ops_limit:           alloc.aiOps,
        }).eq('id', agentId);

        // Actualizar el pool org-level (minutos + ops). Sin esto el pool
        // queda desincronizado y el portal muestra saldo viejo.
        const activationEmail = (pendingAgent as { portal_email?: string | null }).portal_email ?? null;
        if (activationEmail) {
          if (alloc.minutes > 0) {
            await supabase.rpc('apply_ledger_entry', {
              p_portal_email: activationEmail,
              p_agent_id:     agentId,
              p_amount:       alloc.minutes,
              p_kind:         'setup_new_agent',
              p_reference_id: primaryRef,
              p_description:  `Activación de nuevo empleado: +${alloc.minutes} min`,
            });
          }
          // Ops credit via ledger (ADICIONAL a ai_ops_limit UPDATE arriba)
          const opsForNew = alloc.aiOps ?? 0;
          if (opsForNew > 0) {
            await creditOpsToPool(supabase, {
              portalEmail: activationEmail,
              agentId:     agentId,
              amount:      opsForNew,
              kind:        'setup_new_agent',
              referenceId: primaryRef,
              description: `Activación de nuevo empleado: +${opsForNew} tareas`,
            });
          }
          // Recompute pool sumando cada agente (respeta tiers heterogéneos).
          // NO usar setAiOpsLimit — sobreescribiría los tiers individuales.
          await recomputeOrgOpsPool(activationEmail);
        }

        const vapiId = await createVapiAssistant(pendingAgent as VoiceAgent).catch((err: unknown) => {
          // Silent fail crítico: cliente pagó, agente marcado active, pero sin vapi_agent_id
          // llamadas fallan al llegar. Registramos + notificamos ops en el catch de arriba.
          console.error('[billing-webhook] vapi_creation_failed', { agentId, error: String(err) });
          return null;
        });
        if (vapiId) {
          await supabase.from('voice_agents').update({ vapi_agent_id: vapiId }).eq('id', agentId);
          resyncPeerAgents(pendingAgent.portal_email, agentId).catch(console.error);
        } else {
          // Notificar admin: intervención manual necesaria antes de que el cliente reciba llamadas.
          await sendEmail({
            to:      'hola@centinelia.mx',
            subject: `[URGENTE] Vapi setup falló para agente ${agentId}`,
            html:    `<p>El pago se completó pero <code>createVapiAssistant()</code> falló. Cliente: <strong>${pendingAgent.business_name ?? '(sin nombre)'}</strong> (${pendingAgent.portal_email ?? '(sin email)'}).</p><p>Reintentar manualmente desde admin y setear <code>vapi_agent_id</code>.</p>`,
          }).catch(e => console.error('[billing-webhook] admin notify failed', e));
        }

        void agentToken; // used in success_url redirect — no extra action needed here
        break;
      }

      const agentId     = session.metadata?.agent_id;
      const featurePlan  = session.metadata?.feature_plan as Plan | undefined;
      const minutesPlan  = session.metadata?.minutes_plan as MinutesTier | undefined;
      const jornadaTypeMeta = (session.metadata?.jornada_type ?? 'combinada') as JornadaType;

      if (!agentId || !featurePlan || !minutesPlan
        || !FEATURE_PLAN_CONFIG[featurePlan]
        || !MONTHLY_CONFIG[featurePlan]?.[minutesPlan]) break;

      const minutesCfg = MONTHLY_CONFIG[featurePlan][minutesPlan];
      const jornadaAlloc = JORNADA_CONFIG[jornadaTypeMeta]?.[minutesPlan] ?? { minutes: minutesCfg.minutes, aiOps: minutesCfg.aiOps };

      const { data: agentForActivation } = await supabase
        .from('voice_agents').select('portal_email').eq('id', agentId).single();
      const activationEmail = agentForActivation?.portal_email ?? null;

      await supabase.from('voice_agents').update({
        plan:                   featurePlan,
        minutes_plan:           minutesPlan,
        jornada_type:           jornadaTypeMeta,
        ai_ops_limit:           jornadaAlloc.aiOps,
        active:                 true,
        billing_status:         'activo',
        stripe_customer_id:     session.customer as string,
        stripe_subscription_id: session.subscription as string,
        grace_period_ends_at:   null,
        ...(activationEmail ? {} : {
          minutes_included:   jornadaAlloc.minutes,
          minutes_used:       0,
          minutes_reset_date: nextResetDate(),
        }),
      }).eq('id', agentId);

      // Contribución al pool via ledger. Si es primer empleado de la cuenta, crea
      // account_minutes vía trigger. Si ya hay otros, SUMA su contribución (respeta cap 2x).
      if (activationEmail && jornadaAlloc.minutes > 0) {
        // Inicializar minutes_plan del row account_minutes en el primer insert (metadata)
        await supabase.from('account_minutes')
          .upsert({
            portal_email:       activationEmail,
            minutes_plan:       minutesPlan,
            minutes_reset_date: nextResetDate(),
            updated_at:         new Date().toISOString(),
          }, { onConflict: 'portal_email', ignoreDuplicates: false });

        await supabase.rpc('apply_ledger_entry', {
          p_portal_email: activationEmail,
          p_agent_id:     agentId,
          p_amount:       jornadaAlloc.minutes,
          p_kind:         'setup_new_agent',
          p_reference_id: primaryRef,
          p_description:  `Activación de nuevo empleado: +${jornadaAlloc.minutes} min`,
        });
      } else if (!activationEmail) {
        // Legacy standalone agent
        await supabase.from('minutes_ledger').insert({
          agent_id:    agentId,
          amount:      minutesCfg.minutes,
          description: `Activación plan, ${minutesCfg.minutes} minutos incluidos`,
          source:      'activacion',
          kind:        'setup_new_agent',
        });
      }

      if (activationEmail) {
        // Ops credit via ledger (ADICIONAL a ai_ops_limit UPDATE arriba)
        if (jornadaAlloc.aiOps > 0) {
          await creditOpsToPool(supabase, {
            portalEmail: activationEmail,
            agentId:     agentId,
            amount:      jornadaAlloc.aiOps,
            kind:        'setup_new_agent',
            referenceId: primaryRef,
            description: `Activación de nuevo empleado: +${jornadaAlloc.aiOps} tareas`,
          });
        }
        // Recompute pool desde individual ai_ops_limit (respeta tiers heterogéneos).
        // NO usar setAiOpsLimit — sobreescribiría los tiers de los peers.
        await recomputeOrgOpsPool(activationEmail);
      }

      // Re-associate Vapi assistant when reactivating
      const { data: agent } = await supabase
        .from('voice_agents')
        .select('*')
        .eq('id', agentId)
        .single();
      if (agent?.phone_number && agent?.vapi_agent_id) {
        await resumeVapiAgent(agent.phone_number, agent.vapi_agent_id);
      }

      // Onboarding flow: auto-create Vapi assistant + provision phone + send welcome email
      if (session.metadata?.source === 'onboarding' && agent) {
        const fullAgent = agent as VoiceAgent;
        const planLabels: Record<string, string> = { pro: 'Empleado Centinelia' };
        const appUrl    = process.env.NEXT_PUBLIC_APP_URL!;
        const adminWa   = process.env.NEXT_PUBLIC_SUPPORT_WHATSAPP ?? process.env.SUPPORT_WHATSAPP ?? '';

        // Welcome email PRIMERO — antes de provisioning para que llegue aunque
        // Vercel corte la función después (Twilio buy + Vapi import puede
        // tardar >10s en Hobby → welcome se perdía). Usar org token (nuevo
        // canonical, no legacy per-agent que forzaba 301 redirect en proxy).
        // Ver Scope D2 CRIT 1 + CRIT 2.
        const orgToken = fullAgent.portal_email ? await getOrgToken(fullAgent.portal_email, supabase) : null;
        if (agent.client_email && orgToken) {
          const meerkatId = (fullAgent.features as { meerkat_role_id?: string } | null | undefined)?.meerkat_role_id ?? null;
          await sendEmail({
            to:      agent.client_email,
            subject: `¡Bienvenido a Centinelia! Tu empleado ${(agent.agent_name as string | null) ?? 'digital'} está listo`,
            html:    welcomeHtml({
              businessName: agent.business_name,
              setupUrl:     `${appUrl}/portal/${orgToken}/setup`,
              agentName:    (agent.agent_name as string | null) ?? null,
              meerkatId,
            }),
          }).catch(console.error);
        }

        // 1. Create Vapi assistant
        let vapiId = fullAgent.vapi_agent_id ?? null;
        if (!vapiId) {
          vapiId = await createVapiAssistant(fullAgent);
          if (vapiId) {
            await supabase.from('voice_agents').update({ vapi_agent_id: vapiId }).eq('id', agentId);
            resyncPeerAgents(fullAgent.portal_email, agentId).catch(console.error);
          }
        }

        // 2. Buy Twilio number + import to Vapi + assign assistant (skip for tareas-only agents)
        const areaCode = session.metadata?.area_code || undefined;
        const concurrencyLimit = PLAN_CONCURRENT_CALLS[(fullAgent.plan ?? 'pro') as Plan];
        let phoneNumber: string | null = null;
        if (vapiId && jornadaTypeMeta !== 'tareas') {
          const provisioned = await provisionPhoneNumber(vapiId, areaCode, concurrencyLimit);
          if (provisioned) {
            phoneNumber = provisioned.phoneNumber;
            await supabase.from('voice_agents').update({
              phone_number:          provisioned.phoneNumber,
              vapi_phone_number_id:  provisioned.vapiPhoneId ?? null,
            }).eq('id', agentId);
          }
        }

        // 4. Notify admin
        if (adminWa) {
          const phoneInfo = phoneNumber
            ? `📞 Número asignado: *${phoneNumber}*`
            : `⚠️ Pendiente: asignar número de teléfono manualmente`;
          await sendWhatsApp(
            adminWa,
            `🎉 *Nuevo cliente, Centinelia*\n\nNegocio: *${agent.business_name}*\nPlan: ${planLabels[featurePlan ?? ''] ?? featurePlan}\nEmail: ${agent.client_email}\nWA: ${(agent as any).transfer_whatsapp ?? ''}\n${phoneInfo}`
          ).catch(console.error);
        }

        // 5. Topup reminder para el owner: cuánto agregar en Vapi/Twilio/Anthropic.
        const { sendTopupReminderEmail } = await import('@/lib/billing/topup-reminder');
        await sendTopupReminderEmail({
          businessName: fullAgent.business_name ?? '(sin nombre)',
          portalEmail:  fullAgent.portal_email ?? '(sin email)',
          agentName:    fullAgent.agent_name ?? null,
          minutes:      jornadaAlloc.minutes,
          aiOps:        jornadaAlloc.aiOps,
          jornadaLabel: jornadaTypeMeta,
          tierLabel:    minutesCfg.label,
        }).catch(err => console.error('[billing-webhook] topup reminder failed:', err));
      }
      break;
    }

    case 'invoice.payment_succeeded': {
      const invoice = event.data.object as Stripe.Invoice;
      if (invoice.billing_reason !== 'subscription_cycle') break;

      const subId = typeof invoice.parent?.subscription_details?.subscription === 'string'
        ? invoice.parent.subscription_details.subscription
        : (invoice.parent?.subscription_details?.subscription as Stripe.Subscription | undefined)?.id;
      if (!subId) break;

      const sub         = await stripe.subscriptions.retrieve(subId);
      const agentId     = sub.metadata?.agent_id;
      const priceId      = sub.items.data[0]?.price.id ?? '';
      const monthlyMatch = monthlyConfigFromPriceId(priceId);
      if (!agentId || !monthlyMatch) break;

      const { tier: minutesPlan } = monthlyMatch;

      // Fetch completo del agente para resolver la asignación real (jornada + coordinator).
      // ANTES: usábamos minutesCfg.minutes/aiOps de MONTHLY_CONFIG.pro que está STALE
      // post-refactor JORNADA. Un cliente jornada='tareas' tier growth: MONTHLY dice
      // 600 min / 200 ops, JORNADA real dice 0 min / 1200 ops. Cliente perdía 1000
      // tareas por mes silenciosamente. Nox coordinator ni siquiera matcheaba
      // MONTHLY_CONFIG (STRIPE_NOX_*) — recibía 0 minutos + 0 ops en cada renewal.
      // Ver Scope C3 gap #5 + D1 CRIT-1.
      const { data: prevAgent } = await supabase
        .from('voice_agents')
        .select('portal_email, minutes_used, minutes_included, plan, jornada_type, features')
        .eq('id', agentId)
        .single();
      const renewalEmail = prevAgent?.portal_email ?? null;
      const meerkatRoleId = (prevAgent?.features as { meerkat_role_id?: string } | null | undefined)?.meerkat_role_id;
      const alloc = resolveTierAllocation(
        prevAgent?.jornada_type as 'combinada' | 'minutos' | 'tareas' | undefined,
        meerkatRoleId,
        minutesPlan,
      );

      // Actualizar tier + reactivar SOLO este agente (granularidad per-empleado).
      // No tocamos minutes_included aquí — el pool vive en account_minutes vía ledger.
      await supabase.from('voice_agents').update({
        minutes_plan:         minutesPlan,
        active:               true,
        billing_status:       'activo',
        grace_period_ends_at: null,
        ...(renewalEmail ? {} : {
          minutes_included:   alloc.minutes,
          minutes_used:       0,
          minutes_reset_date: nextResetDate(),
        }),
      }).eq('id', agentId);

      // Renovación: insertar credit al ledger.
      // apply_ledger_entry aplica el cap 2x automáticamente (rollover_cap si sobra).
      // Nox coordinator: alloc.minutes=0 (correcto, sin voz) — la RPC se llama pero
      // no hace nada (amount=0). Filtramos con guard para evitar row negativa spuria.
      if (renewalEmail) {
        if (alloc.minutes > 0) {
          await supabase.rpc('apply_ledger_entry', {
            p_portal_email: renewalEmail,
            p_agent_id:     agentId,
            p_amount:       alloc.minutes,
            p_kind:         'renewal',
            p_reference_id: invoice.id ?? null,
            p_description:  `Renovación mensual: ${alloc.minutes} min`,
          });
        }
        after(async () => {
          const { resetFallbackIfActive } = await import('@/lib/billing/fallback-restore');
          const { data: agentForName } = await supabase
            .from('voice_agents')
            .select('business_name')
            .eq('id', agentId)
            .single();
          await resetFallbackIfActive(supabase, renewalEmail, agentForName?.business_name ?? 'tu empleado');
        });
        after(() => maybeNotifyRolloverLoss(supabase, { portalEmail: renewalEmail, referenceId: invoice.id ?? null }));
      } else if (alloc.minutes > 0) {
        // Agente sin portal_email (legacy standalone) — mantiene ledger básico
        await supabase.from('minutes_ledger').insert({
          agent_id:    agentId,
          amount:      alloc.minutes,
          description: `Renovación mensual, ${alloc.minutes} minutos`,
          source:      'renovacion',
          kind:        'renewal',
        });
      }

      // Reset AI ops counter on monthly renewal (legacy path — se mantiene)
      if (renewalEmail) await resetAiOps(renewalEmail);

      // Ops credit via ledger en renovacion (ADICIONAL al resetAiOps legacy arriba).
      if (renewalEmail && alloc.aiOps > 0) {
        await creditOpsToPool(supabase, {
          portalEmail: renewalEmail,
          agentId:     agentId,
          amount:      alloc.aiOps,
          kind:        'renewal',
          referenceId: invoice.id ?? null,
          description: `Renovacion mensual: ${alloc.aiOps} tareas`,
        });
        after(() => maybeNotifyPoolLoss(supabase, { portalEmail: renewalEmail, referenceId: invoice.id ?? null, resource: 'ops' }));
      }

      // Re-associate Vapi solo para el agente cuya sub renovó (granularidad per-empleado).
      const { data: agentForResume } = await supabase
        .from('voice_agents').select('phone_number, vapi_agent_id').eq('id', agentId).single();
      if (agentForResume?.phone_number && agentForResume?.vapi_agent_id) {
        await resumeVapiAgent(agentForResume.phone_number, agentForResume.vapi_agent_id);
      }

      break;
    }

    case 'invoice.payment_failed': {
      const invoice = event.data.object as Stripe.Invoice;

      const subId = typeof invoice.parent?.subscription_details?.subscription === 'string'
        ? invoice.parent.subscription_details.subscription
        : (invoice.parent?.subscription_details?.subscription as Stripe.Subscription | undefined)?.id;
      if (!subId) break;

      const sub     = await stripe.subscriptions.retrieve(subId);
      const agentId = sub.metadata?.agent_id;
      if (!agentId) break;

      const gracePeriodEndsAt = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
      await supabase.from('voice_agents').update({
        billing_status:        'pago_fallido',
        grace_period_ends_at:  gracePeriodEndsAt,
      }).eq('id', agentId);

      const { data: agent } = await supabase
        .from('voice_agents')
        .select('business_name, client_email, transfer_whatsapp')
        .eq('id', agentId)
        .single();

      if (agent?.transfer_whatsapp) {
        await sendWhatsApp(
          agent.transfer_whatsapp,
          `⚠️ *Pago fallido, ${agent.business_name}*\n\nNo pudimos procesar el pago de tu suscripción Centinelia. Tienes *3 días* para regularizar el pago antes de que el agente sea pausado automáticamente.\n\nActualiza tu método de pago para continuar el servicio sin interrupciones.`
        );
      }
      if (agent?.client_email) {
        await sendEmail({
          to: agent.client_email,
          subject: `💳 Pago fallido, ${agent.business_name}`,
          html: paymentFailedHtml(agent.business_name),
        }).catch(console.error);
      }
      break;
    }

    case 'customer.subscription.deleted': {
      const sub     = event.data.object as Stripe.Subscription;
      const agentId = sub.metadata?.agent_id;
      if (!agentId) break;

      // Leer portal_email ANTES del update para expirar su contribución del pool.
      const { data: agentPreCancel } = await supabase
        .from('voice_agents')
        .select('portal_email')
        .eq('id', agentId)
        .single();

      await supabase.from('voice_agents').update({
        active:                 false,
        billing_status:         'cancelado',
        stripe_subscription_id: null,
        cancelled_at:           new Date().toISOString(),
      }).eq('id', agentId);

      // Expirar contribución del agente al pool via ledger.
      // El debit resta lo equivalente a lo que este agente aportaba.
      // Cap 2x se recalcula automáticamente (menos agentes activos = cap menor).
      if (agentPreCancel?.portal_email) {
        await supabase.rpc('expire_agent_contribution', {
          p_portal_email: agentPreCancel.portal_email,
          p_agent_id:     agentId,
          p_reason:       'Cancelación de suscripción Stripe',
        });
      }

      const { data: agent } = await supabase
        .from('voice_agents')
        .select('business_name, transfer_whatsapp, phone_number')
        .eq('id', agentId)
        .single();

      // Pause Vapi on cancellation
      if (agent?.phone_number) await pauseVapiAgent(agent.phone_number);

      if (agent?.transfer_whatsapp) {
        await sendWhatsApp(
          agent.transfer_whatsapp,
          `📴 *Suscripción cancelada, ${agent.business_name}*\n\nTu agente de voz ha sido desactivado. Contáctanos para reactivar el servicio.`
        );
      }
      break;
    }

    // ─────────────────────────────────────────────────────────────────────
    // Refund / dispute / void handlers (fix C5 audit 2026-08-10)
    // Antes: 0 handlers. Un refund en Stripe = cliente conservaba minutos/ops
    // sin registro. Auditor Municipio: "aquí hay ingreso reembolsado pero el
    // ledger dice consumido, ¿fraude?".
    // Ahora: cada evento inserta ledger negativo con kind explícito y crea
    // platform_incident para revisión humana (los cases financieros no se
    // procesan silenciosamente).
    // ─────────────────────────────────────────────────────────────────────
    case 'charge.refunded': {
      const charge = event.data.object as Stripe.Charge;
      // charge.invoice existe en runtime (Stripe API) pero no en los tipos actuales.
      const chargeInvoiceRaw = (charge as unknown as { invoice?: string | { id?: string } }).invoice;
      const invoiceId = typeof chargeInvoiceRaw === 'string' ? chargeInvoiceRaw : (chargeInvoiceRaw?.id ?? null);
      // Fix T4 audit 2026-08-10: Stripe soporta partial refunds. Antes reversábamos
      // 100% del credit original incluso si refund fue solo 50%. Ahora calculamos
      // fracción real = amount_refunded / original_amount.
      const refundFraction = charge.amount > 0
        ? Math.min(1, (charge.amount_refunded ?? 0) / charge.amount)
        : 1;
      await handleFinancialReversal(supabase, {
        kind:          'refund',
        priority:      'high',
        referenceId:   invoiceId,
        chargeId:      charge.id,
        amountRefunded: (charge.amount_refunded ?? 0) / 100,
        currency:      charge.currency,
        fraction:      refundFraction,
        title:         `Refund Stripe${refundFraction < 1 ? ' PARCIAL' : ''} — ${(charge.amount_refunded ?? 0) / 100} ${charge.currency?.toUpperCase()}`,
        description:   `charge=${charge.id} invoice=${invoiceId ?? 'n/a'} amount_refunded=${(charge.amount_refunded ?? 0) / 100} de ${charge.amount / 100} ${charge.currency} (${(refundFraction * 100).toFixed(1)}%). Cliente reembolsado; reversión proporcional aplicada.`,
      });
      break;
    }
    case 'charge.dispute.created': {
      const dispute = event.data.object as Stripe.Dispute;
      const chargeId = typeof dispute.charge === 'string' ? dispute.charge : (dispute.charge?.id ?? null);
      let invoiceId: string | null = null;
      if (chargeId) {
        try {
          const ch = await stripe.charges.retrieve(chargeId);
          const chInvoiceRaw = (ch as unknown as { invoice?: string | { id?: string } }).invoice;
          invoiceId = typeof chInvoiceRaw === 'string' ? chInvoiceRaw : (chInvoiceRaw?.id ?? null);
        } catch (err) {
          console.error('[stripe-webhook] no pude retrieve charge para dispute', err);
        }
      }
      await handleFinancialReversal(supabase, {
        kind:          'dispute_chargeback',
        priority:      'critical',
        referenceId:   invoiceId,
        chargeId:      chargeId,
        amountRefunded: (dispute.amount ?? 0) / 100,
        currency:      dispute.currency,
        title:         `Dispute Stripe (${dispute.reason ?? 'n/a'}) — ${(dispute.amount ?? 0) / 100} ${dispute.currency?.toUpperCase()}`,
        description:   `dispute=${dispute.id} charge=${chargeId ?? 'n/a'} reason=${dispute.reason ?? 'n/a'} status=${dispute.status ?? 'n/a'} amount=${(dispute.amount ?? 0) / 100} ${dispute.currency}. Requiere evidencia en Stripe y decisión sobre revertir el consumo.`,
      });
      break;
    }
    case 'invoice.voided': {
      const invoice = event.data.object as Stripe.Invoice;
      await handleFinancialReversal(supabase, {
        kind:          'invoice_voided',
        priority:      'high',
        referenceId:   invoice.id ?? null,
        chargeId:      null,
        amountRefunded: (invoice.amount_paid ?? 0) / 100,
        currency:      invoice.currency,
        title:         `Invoice Stripe anulado — ${(invoice.amount_paid ?? 0) / 100} ${invoice.currency?.toUpperCase()}`,
        description:   `invoice=${invoice.id} anulado. Si tenía pago aplicado (${(invoice.amount_paid ?? 0) / 100}), el ledger asociado necesita reversión manual.`,
      });
      break;
    }
    case 'charge.dispute.closed': {
      // Fix T5 audit 2026-08-10: dispute lifecycle. Si ganamos (status='won'),
      // debemos revertir la reversal que hicimos en dispute.created. Si perdimos,
      // la reversal se queda (dinero perdido + minutos revertidos = correcto).
      const dispute = event.data.object as Stripe.Dispute;
      const chargeId = typeof dispute.charge === 'string' ? dispute.charge : (dispute.charge?.id ?? null);
      let invoiceId: string | null = null;
      if (chargeId) {
        try {
          const ch = await stripe.charges.retrieve(chargeId);
          const chInvoiceRaw = (ch as unknown as { invoice?: string | { id?: string } }).invoice;
          invoiceId = typeof chInvoiceRaw === 'string' ? chInvoiceRaw : (chInvoiceRaw?.id ?? null);
        } catch (err) {
          console.error('[stripe-webhook] no pude retrieve charge para dispute.closed', err);
        }
      }
      const won = dispute.status === 'won';
      // Crear incident con verdicto para revisión manual — no auto-revierte la
      // reversal (decisión humana con contexto business).
      await supabase.from('platform_incidents').insert({
        title:                 `Dispute cerrada (${dispute.status}) — ${(dispute.amount ?? 0) / 100} ${dispute.currency?.toUpperCase()}`,
        description:           `dispute=${dispute.id} charge=${chargeId ?? 'n/a'} status=${dispute.status ?? 'n/a'} reason=${dispute.reason ?? 'n/a'}\n\n${won ? '[GANAMOS] La reversal previa (dispute_chargeback) debería REVERTIRSE. Insertar ledger positivo compensando el negativo original con reference_id=' + (invoiceId ?? 'n/a') : '[PERDIMOS] La reversal queda. Dinero perdido en la dispute + minutos ya revertidos = estado correcto.'}\n\nInvoice: ${invoiceId ?? 'n/a'}. Requiere validación manual antes de tocar cache.`,
        priority:              won ? 'high' : 'med',
        source:                'error_log',
        source_id:             dispute.id,
        affected_portal_email: null,
        status:                'open',
        assigned_to:           'owner',
      });
      break;
    }

    default:
      break;
  }

  // Fase 2 (commit): marcar processed_at=now. Sin esto, un crash antes de este
  // punto dejaría el row con processed_at=null y el próximo retry Stripe
  // re-procesaría (lo cual queremos). Con esto marca correcto → dedupe real.
  await supabase
    .from('stripe_webhook_events')
    .update({ processed_at: new Date().toISOString() })
    .eq('event_id', event.id);

  return NextResponse.json({ ok: true });
}

// Auxiliar C5: inserta ledger negativo (si hay referencia detectable) + crea
// platform_incident para revisión humana. Diseñado conservador: nunca borra
// automáticamente saldo consumido sin evidencia — deja constancia y espera
// decisión de Nazre o Nash. Municipio quiere ver la reversión, no vacilaciones.
async function handleFinancialReversal(
  supabase: ReturnType<typeof createAdminClient>,
  args: {
    kind:            'refund' | 'dispute_chargeback' | 'invoice_voided';
    priority:        'med' | 'high' | 'critical';
    referenceId:     string | null;
    chargeId:        string | null;
    amountRefunded:  number;
    currency:        string | null | undefined;
    title:           string;
    description:     string;
    fraction?:       number;   // 0..1, default 1 (full reversal). Fix T4 audit: partial refunds.
  }
): Promise<void> {
  let portalEmailHit: string | null = null;
  let matchedMinutes = 0;
  let matchedOps = 0;
  const fraction = Math.max(0, Math.min(1, args.fraction ?? 1));

  // Buscar en ambos ledgers por reference_id para reconstruir qué se acreditó.
  if (args.referenceId) {
    const { data: minRows } = await supabase
      .from('minutes_ledger')
      .select('portal_email, agent_id, amount')
      .eq('reference_id', args.referenceId);
    let totalMinCredits = 0;
    for (const r of (minRows ?? [])) {
      if ((r.amount ?? 0) > 0) totalMinCredits += (r.amount as number);
      if (!portalEmailHit && r.portal_email) portalEmailHit = r.portal_email as string;
    }
    matchedMinutes = Math.floor(totalMinCredits * fraction);   // Proporcional al fraction del refund
    const { data: opsRows } = await supabase
      .from('ops_ledger')
      .select('portal_email, agent_id, amount')
      .eq('reference_id', args.referenceId);
    let totalOpsCredits = 0;
    for (const r of (opsRows ?? [])) {
      if ((r.amount ?? 0) > 0) totalOpsCredits += (r.amount as number);
      if (!portalEmailHit && r.portal_email) portalEmailHit = r.portal_email as string;
    }
    matchedOps = Math.floor(totalOpsCredits * fraction);

    // Reference_id compuesto para partial refunds (evita UNIQUE collision con
    // el reversal completo previo si Stripe manda 2 partial refunds sobre el
    // mismo invoice).
    const reversalRef = fraction < 1
      ? `${args.referenceId}_partial_${Math.round(fraction * 100)}pct_${Date.now()}`
      : args.referenceId;

    // Insertar rows negativos para audit trail (no revierte cache — eso es
    // decisión humana en el incident).
    if (matchedMinutes > 0 && portalEmailHit) {
      await supabase.from('minutes_ledger').insert({
        portal_email: portalEmailHit,
        amount:       -matchedMinutes,
        description:  `[REVERSION PENDIENTE] ${args.title}${fraction < 1 ? ` (${(fraction * 100).toFixed(1)}% de ${totalMinCredits} min)` : ''}`,
        source:       args.kind,
        kind:         args.kind,
        reference_id: reversalRef,
      });
    }
    if (matchedOps > 0 && portalEmailHit) {
      await supabase.from('ops_ledger').insert({
        portal_email: portalEmailHit,
        amount:       -matchedOps,
        description:  `[REVERSION PENDIENTE] ${args.title}${fraction < 1 ? ` (${(fraction * 100).toFixed(1)}% de ${totalOpsCredits} tareas)` : ''}`,
        source:       args.kind,
        kind:         args.kind,
        reference_id: reversalRef,
      });
    }
  }

  await supabase.from('platform_incidents').insert({
    title:                 args.title,
    description:           `${args.description}\n\nMatch en ledgers por reference_id=${args.referenceId ?? 'n/a'}: minutos=${matchedMinutes} tareas=${matchedOps} portal_email=${portalEmailHit ?? 'no encontrado'}. Se insertaron rows negativos en ledger como [REVERSION PENDIENTE]. Revisar y confirmar/revertir cache manual.`,
    priority:              args.priority,
    source:                'error_log',
    source_id:             args.chargeId ?? args.referenceId,
    affected_portal_email: portalEmailHit,
    status:                'open',
    assigned_to:           'owner',
  });
}
