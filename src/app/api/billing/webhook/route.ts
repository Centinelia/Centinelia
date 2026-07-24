import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe';
import { createAdminClient } from '@/lib/supabase/admin';
import { FEATURE_PLAN_CONFIG, MONTHLY_CONFIG, monthlyConfigFromPriceId, nextResetDate, WA_MESSAGES_PLAN_CONFIG, waMsgsPlanFromPriceId, JORNADA_CONFIG } from '@/lib/billing/plans';
import { resetAiOps, setAiOpsLimit } from '@/lib/ai/ops-guard';
import { sendWhatsApp } from '@/lib/whatsapp/send';
import { sendEmail, paymentFailedHtml, welcomeHtml } from '@/lib/email/send';
import { pauseVapiAgent, resumeVapiAgent } from '@/lib/vapi/control';
import { createVapiAssistant, resyncPeerAgents } from '@/lib/vapi/sync';
import { provisionPhoneNumber } from '@/lib/vapi/provision';
import type { VoiceAgent } from '@/types/agent';
import { PLAN_FEATURES, PLAN_CONCURRENT_CALLS } from '@/types/agent';
import type { Plan, JornadaType } from '@/types/agent';
import type { MinutesTier } from '@/lib/billing/plans';
import type Stripe from 'stripe';

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
          .select('minutes_used, minutes_included, portal_email')
          .eq('id', agentId)
          .single();
        const upgradeEmail = prevForUpgrade?.portal_email ?? null;

        let usedSoFar = 0;
        let prevIncluded = 0;
        if (upgradeEmail) {
          const { data: acctUpgrade } = await supabase
            .from('account_minutes').select('minutes_used, minutes_included').eq('portal_email', upgradeEmail).single();
          usedSoFar    = acctUpgrade?.minutes_used     ?? 0;
          prevIncluded = acctUpgrade?.minutes_included ?? 0;
        } else {
          usedSoFar    = prevForUpgrade?.minutes_used     ?? 0;
          prevIncluded = prevForUpgrade?.minutes_included ?? 0;
        }
        const newIncluded = Math.max(newMinutesCfg.minutes, usedSoFar);

        await supabase.from('voice_agents').update({
          plan:         toPlan,
          features:     PLAN_FEATURES[toPlan],
          minutes_plan: toMinutesPlan,
          ...(upgradeEmail ? {} : { minutes_included: newIncluded }),
        }).eq('id', agentId);

        if (upgradeEmail) {
          await supabase.from('account_minutes')
            .update({ minutes_plan: toMinutesPlan, minutes_included: newIncluded, updated_at: new Date().toISOString() })
            .eq('portal_email', upgradeEmail);
        }

        if (newIncluded > prevIncluded) {
          await supabase.from('minutes_ledger').insert({
            agent_id:    agentId,
            amount:      newIncluded - prevIncluded,
            description: `Upgrade a ${newMinutesCfg.label}, ajuste inmediato de minutos`,
            source:      'activacion',
          });
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
          const { data: acctExtra } = await supabase
            .from('account_minutes').select('minutes_included').eq('portal_email', agent.portal_email).single();
          await supabase.from('account_minutes')
            .update({ minutes_included: (acctExtra?.minutes_included ?? 0) + minutes, updated_at: new Date().toISOString() })
            .eq('portal_email', agent.portal_email);
          // Reactivate all agents in this account
          await supabase.from('voice_agents')
            .update({ active: true, billing_status: 'activo' })
            .eq('portal_email', agent.portal_email);
          const { data: acctAgents } = await supabase
            .from('voice_agents').select('phone_number, vapi_agent_id')
            .eq('portal_email', agent.portal_email).not('phone_number', 'is', null);
          if (acctAgents) {
            for (const a of acctAgents) {
              if (a.phone_number && a.vapi_agent_id) await resumeVapiAgent(a.phone_number, a.vapi_agent_id);
            }
          }
        } else {
          await supabase.from('voice_agents')
            .update({ minutes_included: (agent?.minutes_included ?? 0) + minutes, active: true, billing_status: 'activo' })
            .eq('id', agentId);
          if (agent?.phone_number && agent?.vapi_agent_id) {
            await resumeVapiAgent(agent.phone_number, agent.vapi_agent_id);
          }
        }

        await supabase.from('minutes_ledger').insert({
          agent_id:    agentId,
          amount:      minutes,
          description: `Compra de ${minutes} minutos extra`,
          source:      'extra_compra',
        });
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

        await supabase
          .from('voice_agents')
          .update({ ai_ops_limit: ((agent.ai_ops_limit as number) ?? 0) + ops })
          .eq('portal_email', agent.portal_email);

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

        await supabase.from('voice_agents').update({
          active:                 true,
          billing_status:         'activo',
          stripe_customer_id:     session.customer as string,
          stripe_subscription_id: session.subscription as string ?? null,
          minutes_plan:           session.metadata?.minutes_plan ?? null,
        }).eq('id', agentId);

        const vapiId = await createVapiAssistant(pendingAgent as any).catch(() => null);
        if (vapiId) {
          await supabase.from('voice_agents').update({ vapi_agent_id: vapiId }).eq('id', agentId);
          resyncPeerAgents(pendingAgent.portal_email, agentId).catch(console.error);
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

      if (activationEmail) {
        await supabase.from('account_minutes').upsert({
          portal_email:      activationEmail,
          minutes_included:  jornadaAlloc.minutes,
          minutes_used:      0,
          minutes_plan:      minutesPlan,
          minutes_reset_date: nextResetDate(),
          updated_at:        new Date().toISOString(),
        }, { onConflict: 'portal_email' });
        await setAiOpsLimit(activationEmail, jornadaAlloc.aiOps);
      }

      await supabase.from('minutes_ledger').insert({
        agent_id:    agentId,
        amount:      minutesCfg.minutes,
        description: `Activación plan, ${minutesCfg.minutes} minutos incluidos`,
        source:      'activacion',
      });

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
        const planLabels: Record<string, string> = { comercial: 'Empleado Centinelia', pro: 'Empleado Centinelia' };
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
        const concurrencyLimit = PLAN_CONCURRENT_CALLS[(fullAgent.plan ?? 'comercial') as Plan];
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
            `🎉 *Nuevo cliente, Centinelia*\n\nNegocio: *${agent.business_name}*\nPlan: ${planLabels[featurePlan ?? ''] ?? featurePlan}\nEmail: ${agent.client_email}\nWA: ${(agent as any).transfer_whatsapp ?? ','}\n${phoneInfo}`
          ).catch(console.error);
        }
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
      const waMsgsPlan   = waMsgsPlanFromPriceId(priceId);
      if (!agentId || (!monthlyMatch && !waMsgsPlan)) break;

      // ── Minutes renewal ───────────────────────────────────────────────────
      if (!monthlyMatch) {
        // WA-only subscription renewal — handled below
        if (waMsgsPlan) {
          const waCfg = WA_MESSAGES_PLAN_CONFIG[waMsgsPlan];
          const { data: prevWa } = await supabase
            .from('voice_agents')
            .select('wa_messages_used, wa_messages_included')
            .eq('id', agentId)
            .single();
          const waUnused   = prevWa ? Math.max(0, prevWa.wa_messages_included - prevWa.wa_messages_used) : 0;
          const waRollover = Math.min(waUnused, waCfg.messages);
          await supabase.from('voice_agents').update({
            wa_messages_plan:     waMsgsPlan,
            wa_messages_included: waCfg.messages + waRollover,
            wa_messages_used:     0,
          }).eq('id', agentId);
        }
        break;
      }
      const { tier: minutesPlan, cfg: minutesCfg } = monthlyMatch;

      // Rollover: carry unused minutes (capped at 1× the plan base)
      const { data: prevAgent } = await supabase
        .from('voice_agents')
        .select('minutes_used, minutes_included, portal_email')
        .eq('id', agentId)
        .single();
      const renewalEmail = prevAgent?.portal_email ?? null;

      let rollover = 0;
      if (renewalEmail) {
        const { data: acctRenewal } = await supabase
          .from('account_minutes').select('minutes_used, minutes_included').eq('portal_email', renewalEmail).single();
        const acctUnused = acctRenewal ? Math.max(0, acctRenewal.minutes_included - acctRenewal.minutes_used) : 0;
        rollover = Math.min(acctUnused, minutesCfg.minutes);
        await supabase.from('account_minutes').upsert({
          portal_email:      renewalEmail,
          minutes_plan:      minutesPlan,
          minutes_included:  minutesCfg.minutes + rollover,
          minutes_used:      0,
          minutes_reset_date: nextResetDate(),
          updated_at:        new Date().toISOString(),
        }, { onConflict: 'portal_email' });
        // Reactivate all agents in this account
        await supabase.from('voice_agents').update({
          minutes_plan:         minutesPlan,
          active:               true,
          billing_status:       'activo',
          grace_period_ends_at: null,
        }).eq('portal_email', renewalEmail);
      } else {
        const unused = prevAgent ? Math.max(0, prevAgent.minutes_included - prevAgent.minutes_used) : 0;
        rollover     = Math.min(unused, minutesCfg.minutes);
        await supabase.from('voice_agents').update({
          minutes_plan:         minutesPlan,
          minutes_included:     minutesCfg.minutes + rollover,
          minutes_used:         0,
          minutes_reset_date:   nextResetDate(),
          active:               true,
          billing_status:       'activo',
          grace_period_ends_at: null,
        }).eq('id', agentId);
      }

      await supabase.from('minutes_ledger').insert({
        agent_id:    agentId,
        amount:      minutesCfg.minutes,
        description: `Renovación mensual, ${minutesCfg.minutes} minutos`,
        source:      'renovacion',
      });
      if (rollover > 0) {
        await supabase.from('minutes_ledger').insert({
          agent_id:    agentId,
          amount:      rollover,
          description: `Rollover, ${rollover} minutos del mes anterior`,
          source:      'rollover',
        });
      }

      // Reset AI ops counter on monthly renewal
      if (renewalEmail) await resetAiOps(renewalEmail);

      // Re-associate Vapi on renewal (in case agents were paused for overage)
      if (renewalEmail) {
        const { data: acctAgentsRenewal } = await supabase
          .from('voice_agents').select('phone_number, vapi_agent_id')
          .eq('portal_email', renewalEmail).not('phone_number', 'is', null);
        if (acctAgentsRenewal) {
          for (const a of acctAgentsRenewal) {
            if (a.phone_number && a.vapi_agent_id) await resumeVapiAgent(a.phone_number, a.vapi_agent_id);
          }
        }
      } else {
        const { data: agentForResume } = await supabase
          .from('voice_agents').select('phone_number, vapi_agent_id').eq('id', agentId).single();
        if (agentForResume?.phone_number && agentForResume?.vapi_agent_id) {
          await resumeVapiAgent(agentForResume.phone_number, agentForResume.vapi_agent_id);
        }
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

      await supabase.from('voice_agents').update({
        active:                 false,
        billing_status:         'cancelado',
        stripe_subscription_id: null,
        cancelled_at:           new Date().toISOString(),
      }).eq('id', agentId);

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
