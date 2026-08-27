import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAgentAccess } from '@/lib/portal/agent-access';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';
import { stripe } from '@/lib/stripe';
import { createVapiAssistant } from '@/lib/vapi/sync';
import { provisionPhoneNumber } from '@/lib/vapi/provision';
import { JORNADA_CONFIG, MONTHLY_CONFIG } from '@/lib/billing/plans';
import { PLAN_CONCURRENT_CALLS } from '@/types/agent';
import type { VoiceAgent } from '@/types/agent';
import type { Plan } from '@/types/agent';
import type { MinutesTier } from '@/lib/billing/plans';

interface Params { params: Promise<{ token: string }> }

export async function POST(req: NextRequest, { params }: Params) {
  const cookie = req.cookies.get(PORTAL_COOKIE)?.value ?? '';
  const auth   = await verifySession(cookie);
  if (!auth) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const { token } = await params;
  const supabase  = createAdminClient();

  // Body puede pasar agentId para activar voz a un meerkat específico. Default
  // al primary por retrocompat (bug histórico: siempre activaba al primary
  // aunque el user estuviera editando otro peer).
  // Ver [[handoff-peer-discrimination-fix]] B1 #2.
  // areaCode opcional: si el cliente eligió lada, la pasamos a provisionPhone-
  // Number (bypass) o a metadata Stripe (checkout). Sin areaCode, Twilio elige
  // cualquier número MX disponible. Ver [[handoff-sesion-2026-08-26-completo]]
  // sección "Bug 3".
  const body = await req.json().catch(() => ({} as { agentId?: string; areaCode?: string }));
  const bodyAgentId = (body as { agentId?: string }).agentId;
  const rawAreaCode = (body as { areaCode?: string }).areaCode?.trim() || null;
  // Solo dígitos, máximo 3 (Twilio lada MX es 2 o 3 dígitos). Cualquier otra
  // cosa la ignoramos silenciosamente para no romper el flow.
  const areaCode = rawAreaCode && /^\d{2,3}$/.test(rawAreaCode) ? rawAreaCode : undefined;

  const access = await getAgentAccess(token, req);
  if (!access) return NextResponse.json({ error: 'Agente no encontrado' }, { status: 404 });
  if (auth.portalEmail && access.portalEmail !== auth.portalEmail)
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });

  const targetId = bodyAgentId ?? access.primaryId;
  if (!access.ids.includes(targetId)) {
    return NextResponse.json({ error: 'Empleado no válido para este portal' }, { status: 403 });
  }

  const { data: agent } = await supabase
    .from('voice_agents')
    .select('*')
    .eq('id', targetId)
    .single<VoiceAgent>();
  if (!agent) return NextResponse.json({ error: 'Empleado no encontrado' }, { status: 404 });

  const jornadaType = ((agent as any).jornada_type ?? 'combinada') as string;
  if (jornadaType !== 'tareas') {
    return NextResponse.json({ error: 'Este agente ya tiene canal de voz activo' }, { status: 400 });
  }

  const fullAgent = agent as VoiceAgent;
  const tier      = (agent.minutes_plan ?? 'starter') as MinutesTier;
  const plan      = (agent.plan ?? 'pro') as Plan;

  // Sin bypass: crear Stripe Checkout para cambiar suscripcion NOX → combinada.
  // El webhook activa la voz post-pago (metadata type=jornada_change_to_voice).
  const bypass = process.env.BYPASS_AGENT_PAYMENT === 'true';
  if (!bypass) {
    if (!agent.stripe_customer_id) {
      return NextResponse.json({ error: 'Cuenta sin suscripcion activa. Escribenos a hola@centinelia.mx.' }, { status: 400 });
    }
    const monthlyCfg = MONTHLY_CONFIG[plan]?.[tier];
    if (!monthlyCfg) {
      return NextResponse.json({ error: 'Plan invalido para activar voz.' }, { status: 400 });
    }
    const appUrl = process.env.NEXT_PUBLIC_APP_URL!;
    try {
      const checkout = await stripe.checkout.sessions.create({
        customer:          agent.stripe_customer_id,
        customer_update:   { address: 'auto', name: 'auto' },
        mode:              'subscription',
        automatic_tax:     { enabled: true },
        tax_id_collection: { enabled: true, required: 'if_supported' },
        line_items: [{ price: monthlyCfg.priceId(), quantity: 1 }],
        metadata: {
          type:         'jornada_change_to_voice',
          agent_id:     agent.id,
          agent_token:  token,
          minutes_plan: tier,
          ...(areaCode ? { area_code: areaCode } : {}),
        },
        subscription_data: {
          metadata: { agent_id: agent.id, minutes_plan: tier, jornada_type: 'combinada' },
        },
        success_url: `${appUrl}/portal/${token}/configurar?voz=activada`,
        cancel_url:  `${appUrl}/portal/${token}/configurar`,
      });
      return NextResponse.json({ checkoutUrl: checkout.url });
    } catch (e) {
      console.error('activate-voice checkout error:', e);
      return NextResponse.json({ error: 'No se pudo iniciar el cambio de plan. Intenta de nuevo.' }, { status: 500 });
    }
  }

  // 1. Create Vapi assistant if not already present
  let vapiId = fullAgent.vapi_agent_id ?? null;
  if (!vapiId) {
    vapiId = await createVapiAssistant(fullAgent);
    if (vapiId) {
      await supabase.from('voice_agents').update({ vapi_agent_id: vapiId }).eq('id', agent.id);
    }
  }

  if (!vapiId) {
    return NextResponse.json({ error: 'No se pudo preparar el asistente de voz' }, { status: 500 });
  }

  // 2. Provision phone number
  const concurrencyLimit = PLAN_CONCURRENT_CALLS[(fullAgent.plan ?? 'pro') as Plan];
  const provisioned = await provisionPhoneNumber(vapiId, areaCode, concurrencyLimit);

  if (!provisioned) {
    return NextResponse.json({ error: 'No se pudo asignar un número de teléfono. Intenta de nuevo.' }, { status: 500 });
  }

  // 3. Switch jornada to combinada and set minutes allocation
  const allocation = JORNADA_CONFIG['combinada'][tier];

  await supabase.from('voice_agents').update({
    jornada_type:         'combinada',
    phone_number:         provisioned.phoneNumber,
    vapi_phone_number_id: provisioned.vapiPhoneId ?? null,
    minutes_included:     allocation.minutes,
  }).eq('id', agent.id);

  // 4. Contribuir al pool via ledger (respeta cap 2x, trigger refresca cache).
  if (agent.portal_email && allocation.minutes > 0) {
    await supabase.rpc('apply_ledger_entry', {
      p_portal_email: agent.portal_email,
      p_agent_id:     agent.id,
      p_amount:       allocation.minutes,
      p_kind:         'jornada_change',
      p_reference_id: null,
      p_description:  `Activación de voz: +${allocation.minutes} min`,
    });
  }

  // 5. Contribuir ops al pool via ledger si la jornada asigna ops.
  if (agent.portal_email && allocation.aiOps && allocation.aiOps > 0) {
    const { data: org } = await supabase
      .from('organizations')
      .select('ops_ledger_enabled')
      .eq('portal_email', agent.portal_email)
      .maybeSingle();

    if (org?.ops_ledger_enabled) {
      await supabase.rpc('apply_ops_ledger_entry', {
        p_portal_email: agent.portal_email,
        p_agent_id:     agent.id,
        p_amount:       allocation.aiOps,
        p_kind:         'jornada_change',
        p_reference_id: null,
        p_description:  `Activación de voz: +${allocation.aiOps} tareas`,
      });
    }
  }

  return NextResponse.json({ success: true, phone_number: provisioned.phoneNumber });
}
