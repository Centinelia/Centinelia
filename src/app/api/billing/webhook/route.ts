import { NextRequest, NextResponse, after } from 'next/server';
import { stripe } from '@/lib/stripe';
import { createAdminClient } from '@/lib/supabase/admin';
import { FEATURE_PLAN_CONFIG, MONTHLY_CONFIG, monthlyConfigFromPriceId, nextResetDate, JORNADA_CONFIG, NOX_MONTHLY_CONFIG } from '@/lib/billing/plans';
import { resetAiOps, setAiOpsLimit, recomputeOrgOpsPool } from '@/lib/ai/ops-guard';
import { sendWhatsApp } from '@/lib/whatsapp/send';
import { sendEmail, paymentFailedHtml, welcomeHtml } from '@/lib/email/send';
import { maybeNotifyRolloverLoss, maybeNotifyPoolLoss } from '@/lib/billing/rollover-cap-notify';
import { pauseVapiAgent, resumeVapiAgent } from '@/lib/vapi/control';
import { createVapiAssistant, resyncPeerAgents } from '@/lib/vapi/sync';
import { provisionPhoneNumber } from '@/lib/vapi/provision';
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

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session;

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
          .select('minutes_used, minutes_included, minutes_plan, portal_email')
          .eq('id', agentId)
          .single();
        const upgradeEmail = prevForUpgrade?.portal_email ?? null;

        // Delta = new tier minutes - old tier minutes (solo el diferencial se acredita)
        const prevTier    = prevForUpgrade?.minutes_plan as MinutesTier | null;
        const prevTierMin = prevTier ? (MONTHLY_CONFIG[toPlan][prevTier]?.minutes ?? 0) : 0;
        const delta       = Math.max(0, newMinutesCfg.minutes - prevTierMin);

        // Ops delta para upgrade
        const prevOpsPer  = prevTier ? (MONTHLY_CONFIG[toPlan][prevTier]?.aiOps ?? 0) : 0;
        const newOpsPer   = newMinutesCfg.aiOps ?? 0;
        const opsDelta    = Math.max(0, newOpsPer - prevOpsPer);

        // Actualizar tier del agente
        await supabase.from('voice_agents').update({
          plan:         toPlan,
          features:     PLAN_FEATURES[toPlan],
          minutes_plan: toMinutesPlan,
          ...(upgradeEmail ? {} : { minutes_included: newMinutesCfg.minutes }),
        }).eq('id', agentId);

        // Credit al pool via ledger (cap 2x recalculado con el nuevo tier)
        if (delta > 0) {
          if (upgradeEmail) {
            await supabase.rpc('apply_ledger_entry', {
              p_portal_email: upgradeEmail,
              p_agent_id:     agentId,
              p_amount:       delta,
              p_kind:         'renewal',
              p_reference_id: session.id ?? null,
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
            after(() => maybeNotifyRolloverLoss(supabase, { portalEmail: upgradeEmail, referenceId: session.id ?? null }));
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
            referenceId: session.id ?? null,
            description: `Upgrade a ${newMinutesCfg.label}: +${opsDelta} tareas de diferencial`,
          });
          after(() => maybeNotifyPoolLoss(supabase, { portalEmail: upgradeEmail, referenceId: session.id ?? null, resource: 'ops' }));
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
            p_reference_id: session.id ?? null,
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
          after(() => maybeNotifyRolloverLoss(supabase, { portalEmail: agent.portal_email!, referenceId: session.id ?? null }));
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

        if (ledgerEnabled && portalEmail) {
          // NEW path: escribe al ledger, cap 2x aplicado automaticamente por RPC
          await supabase.rpc('apply_ops_ledger_entry', {
            p_portal_email: portalEmail,
            p_agent_id:     agentId,
            p_amount:       ops,
            p_kind:         'extra_ops_purchase',
            p_reference_id: session.id ?? null,
            p_description:  `Compra de ${ops} tareas extra`,
          });
          after(() => maybeNotifyPoolLoss(supabase, { portalEmail, referenceId: session.id ?? null, resource: 'ops' }));
        } else {
          // LEGACY: comportamiento original — actualiza ai_ops_limit directamente
          const newOpsLimit = ((agent.ai_ops_limit as number) ?? 0) + ops;
          if (portalEmail) {
            await supabase.from('voice_agents')
              .update({ ai_ops_limit: newOpsLimit }).eq('portal_email', portalEmail);
          } else {
            await supabase.from('voice_agents')
              .update({ ai_ops_limit: newOpsLimit }).eq('id', agentId);
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
                p_reference_id: session.id ?? null,
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
              p_reference_id: session.id ?? null,
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
              referenceId: session.id ?? null,
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
          p_reference_id: session.id ?? null,
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
            referenceId: session.id ?? null,
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

        const portalToken = (agent as any).portal_token as string | null;

        // 3. Send welcome email
        if (agent.client_email && portalToken) {
          await sendEmail({
            to:      agent.client_email,
            subject: '¡Bienvenido a Centinelia! Tu agente de voz está listo',
            html:    welcomeHtml({
              businessName: agent.business_name,
              setupUrl:     `${appUrl}/portal/${portalToken}/setup`,
            }),
          }).catch(console.error);
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

      const { tier: minutesPlan, cfg: minutesCfg } = monthlyMatch;

      const { data: prevAgent } = await supabase
        .from('voice_agents')
        .select('portal_email, minutes_used, minutes_included')
        .eq('id', agentId)
        .single();
      const renewalEmail = prevAgent?.portal_email ?? null;

      // Actualizar tier + reactivar SOLO este agente (granularidad per-empleado).
      // No tocamos minutes_included aquí — el pool vive en account_minutes vía ledger.
      await supabase.from('voice_agents').update({
        minutes_plan:         minutesPlan,
        active:               true,
        billing_status:       'activo',
        grace_period_ends_at: null,
        ...(renewalEmail ? {} : {
          minutes_included:   minutesCfg.minutes,
          minutes_used:       0,
          minutes_reset_date: nextResetDate(),
        }),
      }).eq('id', agentId);

      // Renovación: insertar credit al ledger.
      // apply_ledger_entry aplica el cap 2x automáticamente (rollover_cap si sobra).
      if (renewalEmail) {
        await supabase.rpc('apply_ledger_entry', {
          p_portal_email: renewalEmail,
          p_agent_id:     agentId,
          p_amount:       minutesCfg.minutes,
          p_kind:         'renewal',
          p_reference_id: invoice.id ?? null,
          p_description:  `Renovación mensual: ${minutesCfg.minutes} min`,
        });
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
      } else {
        // Agente sin portal_email (legacy standalone) — mantiene ledger básico
        await supabase.from('minutes_ledger').insert({
          agent_id:    agentId,
          amount:      minutesCfg.minutes,
          description: `Renovación mensual, ${minutesCfg.minutes} minutos`,
          source:      'renovacion',
          kind:        'renewal',
        });
      }

      // Reset AI ops counter on monthly renewal (legacy path — se mantiene)
      if (renewalEmail) await resetAiOps(renewalEmail);

      // Ops credit via ledger en renovacion (ADICIONAL al resetAiOps legacy arriba)
      if (renewalEmail) {
        const { data: agentForOps } = await supabase
          .from('voice_agents')
          .select('plan, minutes_plan')
          .eq('id', agentId)
          .single();
        const opsConfig = agentForOps?.plan && agentForOps?.minutes_plan
          ? MONTHLY_CONFIG[agentForOps.plan as Plan]?.[agentForOps.minutes_plan as MinutesTier]
          : undefined;
        const opsAmount = opsConfig?.aiOps ?? 0;
        if (opsAmount > 0) {
          await creditOpsToPool(supabase, {
            portalEmail: renewalEmail,
            agentId:     agentId,
            amount:      opsAmount,
            kind:        'renewal',
            referenceId: invoice.id ?? null,
            description: `Renovacion mensual: ${opsAmount} tareas`,
          });
          after(() => maybeNotifyPoolLoss(supabase, { portalEmail: renewalEmail, referenceId: invoice.id ?? null, resource: 'ops' }));
        }
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

    default:
      break;
  }

  return NextResponse.json({ ok: true });
}
