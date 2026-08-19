import { NextRequest, NextResponse }      from 'next/server';
import { createAdminClient }             from '@/lib/supabase/admin';
import { cookies }                       from 'next/headers';
import { verifySession, PORTAL_COOKIE }  from '@/lib/portal/auth';
import { MEERKAT_MAP, type MeerkatRoleId, type MeerkatRole } from '@/lib/portal/meerkat-roles';
import { getPrimaryAgentFromToken } from '@/lib/portal/org-token';
import { createVapiAssistant, resyncPeerAgents } from '@/lib/vapi/sync';
import { stripe }                        from '@/lib/stripe';
import { requireStripeEligible }         from '@/lib/billing/require-stripe-eligible';
import { FEATURE_PLAN_CONFIG, MONTHLY_CONFIG, NOX_MONTHLY_CONFIG } from '@/lib/billing/plans';
import { randomUUID }                    from 'crypto';
import type { Plan, JornadaType }        from '@/types/agent';
import { JORNADA_CONFIG }               from '@/lib/billing/plans';

export const dynamic = 'force-dynamic';

// ─── Shared agent-creation logic ──────────────────────────────────────────────
// Called directly (bypass) or from webhook after payment confirmation.
export async function createPortalAgent({
  base,
  role,
  agentName,
  active,
  jornadaType,
  minutesPlan,
}: {
  base: {
    portal_email: string | null;
    portal_password_hash: string | null;
    client_name: string | null;
    client_email: string | null;
    business_name: string;
    plan: string | null;
    stripe_customer_id: string | null;
    billing_status: string | null;
    active: boolean | null;
    timezone: string | null;
    organization_mission: string | null;
    service_definition: string | null;
    speech_style: string | null;
    auto_refill_enabled: boolean | null;
    auto_refill_threshold: number | null;
    auto_refill_minutes: number | null;
    minutes_reset_date: string | null;
    minutes_plan: string | null;
    minutes_included: number | null;
  };
  role: MeerkatRole;
  agentName: string;
  active: boolean;
  jornadaType?: JornadaType;
  // Tier explícito del nuevo empleado. Antes se leía de `base.minutes_plan`
  // (el del primario), lo que hacía que Nueva Niva scale terminara con
  // starter alloc si el primario no tenía tier. Fix 2026-08-10.
  minutesPlan?: import('@/lib/billing/plans').MinutesTier;
}) {
  const supabase      = createAdminClient();
  const newToken      = randomUUID();
  const isCoordinator = !!(role.features as any)?.is_coordinator;
  const effectiveJornada: JornadaType = isCoordinator ? 'tareas' : (jornadaType ?? 'combinada');
  const tier          = (minutesPlan ?? base.minutes_plan ?? 'starter') as import('@/lib/billing/plans').MinutesTier;
  const alloc         = isCoordinator
    ? { minutes: 0, aiOps: NOX_MONTHLY_CONFIG[tier]?.aiOps ?? 500 }
    : JORNADA_CONFIG[effectiveJornada][tier];
  const features      = {
    ...role.features,
    role_color:      role.color,
    meerkat_role_id: role.id,
    ...(role.imagen ? { avatar: role.imagen } : {}),
  };

  const { data: newAgent, error } = await supabase
    .from('voice_agents')
    .insert({
      portal_email:          base.portal_email,
      portal_password_hash:  base.portal_password_hash,
      client_name:           base.client_name,
      client_email:          base.client_email,
      portal_token:          newToken,
      business_name:         base.business_name,
      plan:                  base.plan,
      jornada_type:          effectiveJornada,
      minutes_included:      alloc.minutes,
      ai_ops_limit:          alloc.aiOps,
      minutes_plan:          tier,
      minutes_used:          0,
      minutes_reset_date:    base.minutes_reset_date,
      stripe_customer_id:    base.stripe_customer_id,
      billing_status:        active ? (base.billing_status ?? 'activo') : 'pendiente_pago',
      active,
      timezone:              base.timezone ?? 'America/Monterrey',
      organization_mission:  base.organization_mission,
      service_definition:    base.service_definition,
      speech_style:          base.speech_style,
      auto_refill_enabled:   base.auto_refill_enabled,
      auto_refill_threshold: base.auto_refill_threshold,
      auto_refill_minutes:   base.auto_refill_minutes,
      onboarding_completed:  true,
      agent_name:            agentName,
      role:                  role.rol,
      features,
      ...(role.voiceId ? { elevenlabs_voice_id: role.voiceId } : {}),
      giro_template:         'general',
      phone_number:          '',
      capture_leads:         false,
      capture_appointments:  false,
      capture_orders:        false,
      wa_messages_included:  0,
      wa_messages_used:      0,
    })
    .select('id, portal_token')
    .single();

  if (error || !newAgent) throw new Error(error?.message ?? 'Failed to create agent');

  if (active) {
    const vapiId = await createVapiAssistant({ ...newAgent, ...base, agent_name: agentName, features } as any).catch(() => null);
    if (vapiId) {
      await supabase.from('voice_agents').update({ vapi_agent_id: vapiId }).eq('id', newAgent.id);
      resyncPeerAgents(base.portal_email, newAgent.id).catch(console.error);
    }
  }

  return newAgent;
}

// ─── POST /api/portal/[token]/agentes ────────────────────────────────────────
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  const cookieStore = await cookies();
  const session = await verifySession(cookieStore.get(PORTAL_COOKIE)?.value ?? '');
  if (!session || session.isSubUser) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  const body = await req.json() as { meerkat_role_id: MeerkatRoleId; agent_name?: string; minutes_plan?: string; jornada_type?: JornadaType };
  const { meerkat_role_id, agent_name, minutes_plan, jornada_type } = body;

  const role = MEERKAT_MAP[meerkat_role_id];
  if (!role) return NextResponse.json({ error: 'Invalid role' }, { status: 400 });

  const supabase = createAdminClient();
  const base = await getPrimaryAgentFromToken<{
    portal_email: string | null;
    portal_password_hash: string | null;
    client_name: string | null;
    client_email: string | null;
    business_name: string;
    plan: string | null;
    stripe_customer_id: string | null;
    billing_status: string | null;
    active: boolean | null;
    timezone: string | null;
    organization_mission: string | null;
    service_definition: string | null;
    speech_style: string | null;
    auto_refill_enabled: boolean | null;
    auto_refill_threshold: number | null;
    auto_refill_minutes: number | null;
    minutes_reset_date: string | null;
    minutes_plan: string | null;
    minutes_included: number | null;
  }>(token, 'portal_email, portal_password_hash, client_name, client_email, business_name, plan, stripe_customer_id, billing_status, active, timezone, organization_mission, service_definition, speech_style, auto_refill_enabled, auto_refill_threshold, auto_refill_minutes, minutes_reset_date, minutes_plan, minutes_included', supabase);

  if (!base) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (session.portalEmail && base.portal_email && session.portalEmail !== base.portal_email)
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const eligible = await requireStripeEligible(base.portal_email as string | null);
  if (!eligible.ok) {
    return NextResponse.json({ error: eligible.reason, message: eligible.message, contact: eligible.contact }, { status: 409 });
  }

  const agentName = agent_name?.trim() || role.nombre;

  // Tier del nuevo empleado (viene del body; el frontend MeerkatPicker lo manda).
  // Antes se leía de base.minutes_plan (el del primario) dentro de createPortalAgent,
  // por lo que si el primario no tenía tier caía a starter — bug del 2026-08-09
  // que dejó a Niva scale con alloc de starter (500 ops en vez de 3000).
  const tierFromBody = (minutes_plan ?? base.minutes_plan ?? 'starter') as import('@/lib/billing/plans').MinutesTier;

  // ── BYPASS: create agent directly (development / pre-production) ──────────
  const bypass = process.env.BYPASS_AGENT_PAYMENT === 'true';
  if (bypass) {
    try {
      const newAgent = await createPortalAgent({ base: base as any, role, agentName, active: true, jornadaType: jornada_type, minutesPlan: tierFromBody });
      // BYPASS también necesita actualizar el pool org-level.
      // En prod esto lo hace el webhook Stripe; en bypass hay que llamarlo aquí.
      if (base.portal_email) {
        const isCoord      = !!(role.features as any)?.is_coordinator;
        const effectiveJor: JornadaType = isCoord ? 'tareas' : (jornada_type ?? 'combinada');
        const alloc        = isCoord
          ? { minutes: 0, aiOps: NOX_MONTHLY_CONFIG[tierFromBody]?.aiOps ?? 500 }
          : JORNADA_CONFIG[effectiveJor][tierFromBody];
        if (alloc.minutes > 0) {
          await supabase.rpc('apply_ledger_entry', {
            p_portal_email: base.portal_email,
            p_agent_id:     newAgent.id,
            p_amount:       alloc.minutes,
            p_kind:         'setup_new_agent',
            p_reference_id: null,
            p_description:  `Bypass: activación nuevo empleado +${alloc.minutes} min`,
          });
        }
        // Recompute pool desde ai_ops_limit individuales (respeta tiers
        // heterogéneos). El nuevo agente ya tiene su ai_ops_limit correcto
        // sembrado por createPortalAgent (con el tier explícito).
        const { recomputeOrgOpsPool } = await import('@/lib/ai/ops-guard');
        await recomputeOrgOpsPool(base.portal_email);
      }
      return NextResponse.json({ token: newAgent.portal_token, agent_id: newAgent.id });
    } catch (e: any) {
      console.error('Error creating agent (bypass):', e);
      return NextResponse.json({ error: e.message ?? 'Failed to create agent' }, { status: 500 });
    }
  }

  // ── PRODUCTION: create pending agent → Stripe Checkout ───────────────────
  try {
    const pendingAgent = await createPortalAgent({ base: base as any, role, agentName, active: false, jornadaType: jornada_type, minutesPlan: tierFromBody });

    const plan       = (base.plan ?? 'pro') as Plan;
    const planCfg    = FEATURE_PLAN_CONFIG[plan];
    const tier       = tierFromBody;
    const isCoord2        = !!(role.features as any)?.is_coordinator;
    const monthlyCfg = isCoord2 ? NOX_MONTHLY_CONFIG[tier] : MONTHLY_CONFIG[plan]?.[tier];
    const customerId      = base.stripe_customer_id ?? undefined;
    const appUrl          = process.env.NEXT_PUBLIC_APP_URL!;
    const effectiveJornada: JornadaType = isCoord2 ? 'tareas' : ((jornada_type ?? 'combinada') as JornadaType);

    const checkoutSession = await stripe.checkout.sessions.create({
      ...(customerId ? { customer: customerId, customer_update: { address: 'auto', name: 'auto' } } : {}),
      mode: 'subscription',
      automatic_tax:      { enabled: true },
      tax_id_collection:  { enabled: true, required: 'if_supported' },
      line_items: [
        { price: planCfg.setupPriceId(), quantity: 1 },           // one-time setup fee
        ...(monthlyCfg ? [{ price: monthlyCfg.priceId(), quantity: 1 }] : []), // recurring jornada
      ],
      metadata: {
        type:         'new_agent',
        agent_id:     pendingAgent.id,
        agent_token:  pendingAgent.portal_token,
        minutes_plan: tier,
        jornada_type: effectiveJornada,
      },
      subscription_data: {
        metadata: { agent_id: pendingAgent.id, minutes_plan: tier },
      },
      success_url: `${appUrl}/portal/${token}/configurar?empleado_id=${pendingAgent.id}&checkout=success`,
      cancel_url:  `${appUrl}/portal/${token}/empleados`,
    });

    return NextResponse.json({ checkoutUrl: checkoutSession.url });
  } catch (e: any) {
    console.error('Error creating agent checkout:', e);
    return NextResponse.json({ error: e.message ?? 'Error al iniciar pago' }, { status: 500 });
  }
}
