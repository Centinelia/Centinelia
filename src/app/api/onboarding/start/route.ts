import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { stripe } from '@/lib/stripe';
import { PLAN_FEATURES } from '@/types/agent';
import { FEATURE_PLAN_CONFIG, MONTHLY_CONFIG, NOX_MONTHLY_CONFIG, JORNADA_CONFIG } from '@/lib/billing/plans';
import { sendWhatsApp } from '@/lib/whatsapp/send';
import { sendEmail, empresarialConfirmationHtml } from '@/lib/email/send';
import type { Plan, JornadaType } from '@/types/agent';
import type { MinutesTier } from '@/lib/billing/plans';
import { MEERKAT_MAP, type MeerkatRoleId } from '@/lib/portal/meerkat-roles';

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
    fallback_phone_number,
    area_code,
    jornada_type,
    meerkat_role_id,
    rfc,
    curp,
    aup_accepted,
  } = await req.json();

  const meerkat = (meerkat_role_id && meerkat_role_id !== 'custom')
    ? MEERKAT_MAP[meerkat_role_id as MeerkatRoleId] ?? null
    : null;

  const isCoordinator = !!(meerkat?.features as Record<string, unknown>)?.is_coordinator;

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
      business_phone_display: business_phone_display?.trim() ?? '',
      giro_template:          giro_template ?? 'general',
      agent_name:             agent_name?.trim() || meerkat?.nombre || null,
      role:                   meerkat?.rol || null,
      transfer_whatsapp:      transfer_whatsapp.trim(),
      timezone:               'America/Monterrey',
      phone_number:           '',
      plan:                   'pro',
      features: meerkat
        ? { ...meerkat.features, role_color: meerkat.color, meerkat_role_id: meerkat.id, ...(meerkat.imagen ? { avatar: meerkat.imagen } : {}) }
        : PLAN_FEATURES['pro'],
      ...(meerkat?.voiceId ? { elevenlabs_voice_id: meerkat.voiceId } : {}),
      minutes_included:       0,
      minutes_used:           0,
      minutes_reset_date:     resetDate.toISOString().slice(0, 10),
      active:                 false,
      billing_status:         'pendiente',
    });

    // Org-level fields go to organizations
    await supabase.from('organizations')
      .upsert({
        portal_email:         email,
        business_description: business_description.trim(),
        transfer_whatsapp:    transfer_whatsapp.trim(),
        ...(fallback_phone_number != null
          ? { fallback_phone_number: fallback_phone_number }
          : {}),
      }, { onConflict: 'portal_email' });

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

    // KYC for empresarial accounts
    const kycPatchE: Record<string, unknown> = {};
    if (rfc?.trim())  kycPatchE.rfc  = rfc.trim().toUpperCase();
    if (curp?.trim()) kycPatchE.curp = curp.trim().toUpperCase();
    if (aup_accepted) kycPatchE.aup_accepted_at = new Date().toISOString();
    if (Object.keys(kycPatchE).length > 0) {
      await supabase.from('organizations').update(kycPatchE).eq('portal_email', email);
    }

    return NextResponse.json({ empresarial: true });
  }

  // ── Standard plans (pro) ─────────────────────────────────────────
  if (!['pro'].includes(plan))
    return NextResponse.json({ error: 'Plan inválido' }, { status: 400 });
  const tier: MinutesTier = (['starter', 'growth', 'scale'] as MinutesTier[]).includes(minutes_tier) ? minutes_tier : 'starter';
  const jornadaType: JornadaType = (['combinada', 'minutos', 'tareas'] as JornadaType[]).includes(jornada_type) ? jornada_type : 'combinada';
  const effectiveJornada: JornadaType = isCoordinator ? 'tareas' : jornadaType;

  if (!business_phone_display?.trim() && effectiveJornada !== 'tareas')
    return NextResponse.json({ error: 'Teléfono requerido' }, { status: 400 });

  const p = plan as Plan;
  const monthlyConfig = isCoordinator ? NOX_MONTHLY_CONFIG[tier] : MONTHLY_CONFIG[p][tier];
  const allocation    = isCoordinator
    ? { minutes: 0, aiOps: monthlyConfig.aiOps }
    : JORNADA_CONFIG[effectiveJornada][tier];

  const { data: agent, error } = await supabase
    .from('voice_agents')
    .insert({
      client_name:            client_name.trim(),
      client_email:           email,
      portal_email:           email,
      registration_ip:        ip,
      business_name:          business_name.trim(),
      business_phone_display: business_phone_display?.trim() ?? '',
      giro_template:          giro_template ?? 'general',
      agent_name:             agent_name?.trim() || meerkat?.nombre || null,
      role:                   meerkat?.rol || null,
      transfer_whatsapp:      transfer_whatsapp.trim(),
      timezone:               'America/Monterrey',
      phone_number:           '',
      plan:                   p,
      features: meerkat
        ? { ...meerkat.features, role_color: meerkat.color, meerkat_role_id: meerkat.id, ...(meerkat.imagen ? { avatar: meerkat.imagen } : {}) }
        : PLAN_FEATURES[p],
      ...(meerkat?.voiceId ? { elevenlabs_voice_id: meerkat.voiceId } : {}),
      jornada_type:           effectiveJornada,
      minutes_included:       allocation.minutes,
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

  // Persist org-level fields + KYC data + AUP acceptance in the org record
  const kycPatch: Record<string, unknown> = {
    business_description: business_description.trim(),
    transfer_whatsapp:    transfer_whatsapp.trim(),
  };
  if (fallback_phone_number != null) kycPatch.fallback_phone_number = fallback_phone_number;
  if (rfc?.trim())  kycPatch.rfc  = rfc.trim().toUpperCase();
  if (curp?.trim()) kycPatch.curp = curp.trim().toUpperCase();
  if (aup_accepted) kycPatch.aup_accepted_at = new Date().toISOString();
  if (rfc?.trim() && curp?.trim()) kycPatch.kyc_completed_at = new Date().toISOString();
  await supabase
    .from('organizations')
    .upsert({ portal_email: email, ...kycPatch }, { onConflict: 'portal_email' });

  // Fix P8 audit 2026-08-10: LFPDPPP proof of consent. Log ip+ts+versiones aceptadas.
  const { logConsent } = await import('@/lib/legal/consent-log');
  await logConsent(supabase, {
    portalEmail: email,
    agentId:     agent.id,
    actorType:   'anon_registrant',
    ipAddress:   req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip'),
    userAgent:   req.headers.get('user-agent'),
  });

  const customer = await stripe.customers.create({
    name:     `${client_name.trim()}, ${business_name.trim()}`,
    email,
    metadata: { agent_id: agent.id },
  });

  await supabase.from('voice_agents').update({ stripe_customer_id: customer.id }).eq('id', agent.id);

  const appUrl  = process.env.NEXT_PUBLIC_APP_URL!;
  const session = await stripe.checkout.sessions.create({
    customer:          customer.id,
    customer_update:   { address: 'auto', name: 'auto' },
    mode:              'subscription',
    automatic_tax:     { enabled: true },
    tax_id_collection: { enabled: true, required: 'if_supported' },
    line_items: [
      { price: FEATURE_PLAN_CONFIG[p].setupPriceId(),  quantity: 1 },
      { price: monthlyConfig.priceId(),                quantity: 1 },
    ],
    metadata: {
      agent_id:     agent.id,
      feature_plan: p,
      minutes_plan: tier,
      jornada_type: effectiveJornada,
      source:       'onboarding',
      area_code:    effectiveJornada !== 'tareas' ? (area_code ?? '') : '',
    },
    subscription_data: {
      metadata: {
        agent_id:     agent.id,
        feature_plan: p,
        minutes_plan: tier,
      },
    },
    success_url: `${appUrl}/registro/pendiente?token=${agent.portal_token}&name=${encodeURIComponent(agent.agent_name ?? meerkat?.nombre ?? '')}&role=${encodeURIComponent(meerkat?.rol ?? '')}&meerkat=${meerkat?.id ?? 'custom'}`,
    cancel_url:  `${appUrl}/registro?canceled=1`,
    locale:      'es',
  });

  return NextResponse.json({ url: session.url });
}
