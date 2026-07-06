import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { stripe } from '@/lib/stripe';
import { PLAN_FEATURES } from '@/types/agent';
import { FEATURE_PLAN_CONFIG, MONTHLY_CONFIG } from '@/lib/billing/plans';
import { sendWhatsApp } from '@/lib/whatsapp/send';
import { sendEmail, empresarialConfirmationHtml } from '@/lib/email/send';
import type { Plan } from '@/types/agent';
import type { MinutesTier } from '@/lib/billing/plans';

export async function POST(req: NextRequest) {
  const {
    plan,
    minutes_tier,
    business_name,
    business_description,
    business_phone_display,
    giro_template,
    agent_name,
    client_name,
    client_email,
    transfer_whatsapp,
    area_code,
  } = await req.json();

  // Common field validation
  if (!business_name?.trim())
    return NextResponse.json({ error: 'Nombre del negocio requerido' }, { status: 400 });
  if (!business_description?.trim())
    return NextResponse.json({ error: 'Descripción del negocio requerida' }, { status: 400 });
  if (!client_name?.trim())
    return NextResponse.json({ error: 'Tu nombre es requerido' }, { status: 400 });
  if (!client_email?.trim())
    return NextResponse.json({ error: 'Correo electrónico requerido' }, { status: 400 });
  if (!transfer_whatsapp?.trim())
    return NextResponse.json({ error: 'WhatsApp requerido' }, { status: 400 });

  const supabase = createAdminClient();
  const email    = client_email.trim().toLowerCase();

  // ── Rate limiting ────────────────────────────────────────────────────────────
  const ip       = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  const oneHour  = new Date(Date.now() - 60 * 60 * 1000).toISOString();

  // Block same email if already attempted in the last hour
  const { count: emailCount } = await supabase
    .from('voice_agents')
    .select('id', { count: 'exact', head: true })
    .eq('client_email', email)
    .eq('billing_status', 'pendiente')
    .eq('active', false)
    .gte('created_at', oneHour);

  if ((emailCount ?? 0) >= 1) {
    return NextResponse.json(
      { error: 'Ya existe un registro reciente con este correo. Intenta en unos minutos.' },
      { status: 429 }
    );
  }

  // Block IP with more than 3 pending registrations in the last hour
  const { count: ipCount } = await supabase
    .from('voice_agents')
    .select('id', { count: 'exact', head: true })
    .eq('registration_ip', ip)
    .eq('billing_status', 'pendiente')
    .gte('created_at', oneHour);

  if ((ipCount ?? 0) >= 3) {
    return NextResponse.json(
      { error: 'Demasiados intentos desde esta conexión. Intenta más tarde.' },
      { status: 429 }
    );
  }

  const resetDate = new Date();
  resetDate.setMonth(resetDate.getMonth() + 1, 1);

  // ── Empresarial: save lead + notify admin, no Stripe ────────────────────────
  if (plan === 'empresarial') {
    await supabase.from('voice_agents').insert({
      client_name:            client_name.trim(),
      client_email:           email,
      portal_email:           email,
      registration_ip:        ip,
      business_name:          business_name.trim(),
      business_description:   business_description.trim(),
      business_phone_display: business_phone_display?.trim() ?? '',
      giro_template:          giro_template ?? 'general',
      agent_name:             agent_name?.trim() || null,
      transfer_whatsapp:      transfer_whatsapp.trim(),
      timezone:               'America/Monterrey',
      phone_number:           '',
      plan:                   'pro',
      features:               PLAN_FEATURES['pro'],
      minutes_included:       0,
      minutes_used:           0,
      minutes_reset_date:     resetDate.toISOString().slice(0, 10),
      active:                 false,
      billing_status:         'pendiente',
    });

    const adminWa     = process.env.NEXT_PUBLIC_SUPPORT_WHATSAPP ?? process.env.SUPPORT_WHATSAPP ?? '';
    const contactEmail = process.env.NEXT_PUBLIC_SUPPORT_EMAIL ?? 'hola@centinelia.mx';

    await Promise.all([
      adminWa
        ? sendWhatsApp(
            adminWa,
            `🏢 *Nueva solicitud Empresarial, Centinelia*\n\nNegocio: *${business_name.trim()}*\nGiro: ${giro_template ?? 'general'}\nCiudad lada: ${area_code ?? ','}\n\nContacto: ${client_name.trim()}\nEmail: ${email}\nWA: ${transfer_whatsapp.trim()}\n\nRequiere cotización e integración con sistema existente.`
          ).catch(console.error)
        : Promise.resolve(),
      sendEmail({
        to:      email,
        subject: 'Recibimos tu solicitud, Centinelia Empresarial',
        html:    empresarialConfirmationHtml({
          clientName:   client_name.trim(),
          businessName: business_name.trim(),
          contactEmail,
        }),
      }).catch(console.error),
    ]);

    return NextResponse.json({ empresarial: true });
  }

  // ── Standard plans (comercial / pro) ─────────────────────────────────────────
  if (!['comercial', 'pro'].includes(plan))
    return NextResponse.json({ error: 'Plan inválido' }, { status: 400 });
  const tier: MinutesTier = (['starter', 'growth', 'scale'] as MinutesTier[]).includes(minutes_tier) ? minutes_tier : 'starter';
  if (!business_phone_display?.trim())
    return NextResponse.json({ error: 'Teléfono requerido' }, { status: 400 });

  const p = plan as Plan;

  const { data: agent, error } = await supabase
    .from('voice_agents')
    .insert({
      client_name:            client_name.trim(),
      client_email:           email,
      portal_email:           email,
      registration_ip:        ip,
      business_name:          business_name.trim(),
      business_description:   business_description.trim(),
      business_phone_display: business_phone_display.trim(),
      giro_template:          giro_template ?? 'general',
      agent_name:             p === 'pro' ? (agent_name?.trim() || null) : null,
      transfer_whatsapp:      transfer_whatsapp.trim(),
      timezone:               'America/Monterrey',
      phone_number:           '',
      plan:                   p,
      features:               PLAN_FEATURES[p],
      minutes_included:       MONTHLY_CONFIG[p][tier].minutes,
      minutes_plan:           tier,
      minutes_reset_date:     resetDate.toISOString().slice(0, 10),
      active:                 false,
      billing_status:         'pendiente',
    })
    .select()
    .single();

  if (error || !agent) {
    console.error('onboarding/start:', error);
    return NextResponse.json({ error: 'Error al registrar el agente' }, { status: 500 });
  }

  const customer = await stripe.customers.create({
    name:     `${client_name.trim()}, ${business_name.trim()}`,
    email,
    metadata: { agent_id: agent.id },
  });

  await supabase.from('voice_agents').update({ stripe_customer_id: customer.id }).eq('id', agent.id);

  const appUrl  = process.env.NEXT_PUBLIC_APP_URL!;
  const session = await stripe.checkout.sessions.create({
    customer:  customer.id,
    mode:      'subscription',
    line_items: [
      { price: FEATURE_PLAN_CONFIG[p].setupPriceId(),     quantity: 1 },
      { price: MONTHLY_CONFIG[p][tier].priceId(),         quantity: 1 },
    ],
    metadata: {
      agent_id:     agent.id,
      feature_plan: p,
      minutes_plan: tier,
      source:       'onboarding',
      area_code:    area_code ?? '',
    },
    subscription_data: {
      metadata: {
        agent_id:     agent.id,
        feature_plan: p,
        minutes_plan: tier,
      },
    },
    success_url: `${appUrl}/registro/pendiente?token=${agent.portal_token}`,
    cancel_url:  `${appUrl}/registro?canceled=1`,
    locale:      'es',
  });

  return NextResponse.json({ url: session.url });
}
