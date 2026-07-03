import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe';
import { createAdminClient } from '@/lib/supabase/admin';
import { FEATURE_PLAN_CONFIG, MINUTES_PLAN_CONFIG, minutesPlanFromPriceId, nextResetDate, WA_MESSAGES_PLAN_CONFIG, waMsgsPlanFromPriceId } from '@/lib/billing/plans';
import { sendWhatsApp } from '@/lib/whatsapp/send';
import { sendEmail, paymentFailedHtml, welcomeHtml } from '@/lib/email/send';
import { pauseVapiAgent, resumeVapiAgent } from '@/lib/vapi/control';
import { createVapiAssistant } from '@/lib/vapi/sync';
import { provisionPhoneNumber } from '@/lib/vapi/provision';
import type { VoiceAgent } from '@/types/agent';
import { PLAN_FEATURES } from '@/types/agent';
import type { Plan } from '@/types/agent';
import type { MinutesPlan } from '@/lib/billing/plans';
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
        const toMinutesPlan = session.metadata?.to_minutes_plan as MinutesPlan | undefined;
        if (!agentId || !toPlan || !toMinutesPlan
          || !FEATURE_PLAN_CONFIG[toPlan]
          || !MINUTES_PLAN_CONFIG[toMinutesPlan]) break;

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
              items:              [{ id: subItem.id, price: MINUTES_PLAN_CONFIG[toMinutesPlan].priceId() }],
              proration_behavior: 'create_prorations',
            });
          }
        }

        const newMinutesCfg = MINUTES_PLAN_CONFIG[toMinutesPlan];
        const { data: prevForUpgrade } = await supabase
          .from('voice_agents')
          .select('minutes_used, minutes_included')
          .eq('id', agentId)
          .single();
        // Carry already-used minutes; new balance = new plan allocation minus used so far
        const usedSoFar    = prevForUpgrade?.minutes_used ?? 0;
        const newIncluded  = Math.max(newMinutesCfg.minutes, usedSoFar); // never go negative

        await supabase.from('voice_agents').update({
          plan:             toPlan,
          features:         PLAN_FEATURES[toPlan],
          minutes_plan:     toMinutesPlan,
          minutes_included: newIncluded,
        }).eq('id', agentId);

        if (newIncluded > (prevForUpgrade?.minutes_included ?? 0)) {
          await supabase.from('minutes_ledger').insert({
            agent_id:    agentId,
            amount:      newIncluded - (prevForUpgrade?.minutes_included ?? 0),
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
          .select('minutes_included, phone_number, vapi_agent_id')
          .eq('id', agentId)
          .single();

        await supabase.from('voice_agents')
          .update({
            minutes_included: (agent?.minutes_included ?? 0) + minutes,
            active:           true,
            billing_status:   'activo',
          })
          .eq('id', agentId);

        await supabase.from('minutes_ledger').insert({
          agent_id:    agentId,
          amount:      minutes,
          description: `Compra de ${minutes} minutos extra`,
          source:      'extra_compra',
        });

        // Reactivate Vapi in case agent was auto-paused for hitting the limit
        if (agent?.phone_number && agent?.vapi_agent_id) {
          await resumeVapiAgent(agent.phone_number, agent.vapi_agent_id);
        }
        break;
      }

      const agentId     = session.metadata?.agent_id;
      const featurePlan = session.metadata?.feature_plan as Plan | undefined;
      const minutesPlan = session.metadata?.minutes_plan as MinutesPlan | undefined;

      if (!agentId || !featurePlan || !minutesPlan
        || !FEATURE_PLAN_CONFIG[featurePlan]
        || !MINUTES_PLAN_CONFIG[minutesPlan]) break;

      const minutesCfg = MINUTES_PLAN_CONFIG[minutesPlan];

      await supabase.from('voice_agents').update({
        plan:                   featurePlan,
        minutes_plan:           minutesPlan,
        active:                 true,
        billing_status:         'activo',
        stripe_customer_id:     session.customer as string,
        stripe_subscription_id: session.subscription as string,
        minutes_included:       minutesCfg.minutes,
        minutes_used:           0,
        minutes_reset_date:     nextResetDate(),
        grace_period_ends_at:   null,
      }).eq('id', agentId);

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
        const planLabels: Record<string, string> = { basico: 'Básico', estandar: 'Estándar', pro: 'Pro' };
        const appUrl    = process.env.NEXT_PUBLIC_APP_URL!;
        const adminWa   = process.env.NEXT_PUBLIC_SUPPORT_WHATSAPP ?? process.env.SUPPORT_WHATSAPP ?? '';

        // 1. Create Vapi assistant
        let vapiId = fullAgent.vapi_agent_id ?? null;
        if (!vapiId) {
          vapiId = await createVapiAssistant(fullAgent);
          if (vapiId) {
            await supabase.from('voice_agents').update({ vapi_agent_id: vapiId }).eq('id', agentId);
          }
        }

        // 2. Buy Twilio number + import to Vapi + assign assistant
        const areaCode = session.metadata?.area_code || undefined;
        let phoneNumber: string | null = null;
        if (vapiId) {
          const provisioned = await provisionPhoneNumber(vapiId, areaCode);
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
      const priceId     = sub.items.data[0]?.price.id ?? '';
      const minutesPlan = minutesPlanFromPriceId(priceId);
      const waMsgsPlan  = waMsgsPlanFromPriceId(priceId);
      if (!agentId || (!minutesPlan && !waMsgsPlan)) break;

      // ── Minutes renewal ───────────────────────────────────────────────────
      if (!minutesPlan) break;
      const minutesCfg = MINUTES_PLAN_CONFIG[minutesPlan];

      // Rollover: carry unused minutes (capped at 1× the plan base)
      const { data: prevAgent } = await supabase
        .from('voice_agents')
        .select('minutes_used, minutes_included')
        .eq('id', agentId)
        .single();
      const unused   = prevAgent ? Math.max(0, prevAgent.minutes_included - prevAgent.minutes_used) : 0;
      const rollover = Math.min(unused, minutesCfg.minutes);

      await supabase.from('voice_agents').update({
        minutes_plan:         minutesPlan,
        minutes_included:     minutesCfg.minutes + rollover,
        minutes_used:         0,
        minutes_reset_date:   nextResetDate(),
        active:               true,
        billing_status:       'activo',
        grace_period_ends_at: null,
      }).eq('id', agentId);

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

      // Re-associate Vapi on renewal (in case it was paused for overage)
      const { data: agent } = await supabase
        .from('voice_agents')
        .select('phone_number, vapi_agent_id')
        .eq('id', agentId)
        .single();
      if (agent?.phone_number && agent?.vapi_agent_id) {
        await resumeVapiAgent(agent.phone_number, agent.vapi_agent_id);
      }

      // ── WA Messages renewal (separate subscription) ───────────────────────
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
