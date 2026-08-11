import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { stripe } from '@/lib/stripe';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';
import { getPrimaryAgentFromToken } from '@/lib/portal/org-token';
import { FEATURE_PLAN_CONFIG, MONTHLY_CONFIG, resolveTierAllocation } from '@/lib/billing/plans';
import { setAiOpsLimit } from '@/lib/ai/ops-guard';
import { PLAN_FEATURES } from '@/types/agent';
import type { Plan } from '@/types/agent';
import type { MinutesTier } from '@/lib/billing/plans';
import { rateLimit, limiters } from '@/lib/ratelimit';
import { requireStripeEligible } from '@/lib/billing/require-stripe-eligible';

interface Params { params: Promise<{ token: string }> }

export async function POST(req: NextRequest, { params }: Params) {
  const rl = await rateLimit(req, limiters.payment);
  if (rl) return rl;

  const { token } = await params;

  const cookieStore = await cookies();
  const auth = await verifySession(cookieStore.get(PORTAL_COOKIE)?.value ?? '');
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { to_plan, to_minutes_tier } = await req.json() as { to_plan?: Plan; to_minutes_tier?: MinutesTier };

  if (to_plan && !['pro'].includes(to_plan))
    return NextResponse.json({ error: 'Plan inválido' }, { status: 400 });
  if (to_minutes_tier && !['starter', 'growth', 'scale'].includes(to_minutes_tier))
    return NextResponse.json({ error: 'Tier de minutos inválido' }, { status: 400 });

  const supabase = createAdminClient();
  const agent = await getPrimaryAgentFromToken<{
    id: string;
    business_name: string | null;
    plan: string | null;
    minutes_plan: string | null;
    jornada_type: string | null;
    features: Record<string, unknown> | null;
    stripe_customer_id: string | null;
    stripe_subscription_id: string | null;
  }>(token, 'id, business_name, plan, minutes_plan, jornada_type, features, stripe_customer_id, stripe_subscription_id', supabase);

  if (!agent) return NextResponse.json({ error: 'Agente no encontrado' }, { status: 404 });

  // We need portal_email for IDOR check — fetch it separately since current select omits it
  const { data: agentMeta } = await supabase
    .from('voice_agents').select('portal_email').eq('id', agent.id).single();
  if (auth.portalEmail && agentMeta?.portal_email && auth.portalEmail !== agentMeta.portal_email)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

  const eligible = await requireStripeEligible(agentMeta?.portal_email as string | null);
  if (!eligible.ok) {
    return NextResponse.json({ error: eligible.reason, message: eligible.message, contact: eligible.contact }, { status: 409 });
  }

  if (!agent.stripe_subscription_id) return NextResponse.json({ error: 'Sin suscripción activa' }, { status: 400 });

  const currentPlan  = agent.plan as Plan;
  const currentTier  = (agent.minutes_plan ?? 'starter') as MinutesTier;
  const newPlan      = to_plan ?? currentPlan;
  const newTier      = to_minutes_tier ?? currentTier;

  if (newPlan === currentPlan && newTier === currentTier)
    return NextResponse.json({ error: 'Ya estás en este plan' }, { status: 400 });

  const from_cfg  = FEATURE_PLAN_CONFIG[currentPlan];
  const to_cfg    = FEATURE_PLAN_CONFIG[newPlan];
  const setup_diff = to_cfg.setupFee - from_cfg.setupFee;

  if (setup_diff > 0) {
    // Agent type upgrade: charge setup difference via Checkout
    const appUrl = process.env.NEXT_PUBLIC_APP_URL!;
    const session = await stripe.checkout.sessions.create({
      ...(agent.stripe_customer_id ? { customer: agent.stripe_customer_id, customer_update: { address: 'auto', name: 'auto' } } : {}),
      mode:              'payment',
      automatic_tax:     { enabled: true },
      tax_id_collection: { enabled: true, required: 'if_supported' },
      line_items: [{
        quantity: 1,
        price_data: {
          currency:      'mxn',
          unit_amount:   setup_diff * 100,
          tax_behavior:  'exclusive',
          product_data: {
            name:        `Upgrade a ${to_cfg.label}, Centinelia`,
            description: `Diferencia de instalación: ${from_cfg.label} → ${to_cfg.label}`,
          },
        },
      }],
      metadata: {
        type:            'plan_upgrade',
        agent_id:        agent.id,
        to_plan:         newPlan,
        to_minutes_plan: newTier,
      },
      success_url: `${appUrl}/portal/${token}?tab=cuenta&upgrade=ok`,
      cancel_url:  `${appUrl}/portal/${token}?tab=cuenta`,
      locale:      'es',
    });
    return NextResponse.json({ url: session.url });
  }

  // Downgrade or minutes tier change: immediate, no setup fee
  const sub     = await stripe.subscriptions.retrieve(agent.stripe_subscription_id);
  const subItem = sub.items.data.find(item => item.price.recurring !== null);
  if (!subItem) return NextResponse.json({ error: 'Suscripción sin plan recurrente' }, { status: 400 });

  await stripe.subscriptions.update(agent.stripe_subscription_id, {
    items:              [{ id: subItem.id, price: MONTHLY_CONFIG[newPlan][newTier].priceId() }],
    proration_behavior: 'none',
  });

  const { data: updatedAgent } = await supabase
    .from('voice_agents')
    .select('portal_email')
    .eq('id', agent.id)
    .single();

  // Deltas de tier (fix H8 audit 2026-08-10 + fix drift MONTHLY_CONFIG vs
  // JORNADA_CONFIG 2026-08-11). Antes se leía MONTHLY_CONFIG.aiOps (100/200/300)
  // que quedó stale post-refactor jornadas — un cliente en jornada `tareas`
  // recibía +100 tareas cuando debería recibir +700. Ahora usa el resolver
  // que devuelve la asignación real (JORNADA_CONFIG o NOX_MONTHLY_CONFIG).
  // Ver [[feedback-audit-read-path-fidelity]].
  const meerkatRoleId  = ((agent.features as Record<string, unknown> | null)?.meerkat_role_id as string | undefined) ?? undefined;
  const jornadaType    = (agent.jornada_type as 'combinada' | 'minutos' | 'tareas' | null) ?? undefined;
  const oldAlloc = resolveTierAllocation(jornadaType, meerkatRoleId, currentTier);
  const newAlloc = resolveTierAllocation(jornadaType, meerkatRoleId, newTier);
  const oldMinutes = oldAlloc.minutes;
  const newMinutes = newAlloc.minutes;
  const oldOps     = oldAlloc.aiOps;
  const newOps     = newAlloc.aiOps;
  const minutesDelta = newMinutes - oldMinutes;
  const opsDelta     = newOps - oldOps;
  const changeLabel  = `${currentPlan}/${currentTier} → ${newPlan}/${newTier}`;
  const changeKind   = (minutesDelta < 0 || opsDelta < 0) ? 'plan_downgrade' : 'plan_upgrade';

  await supabase.from('voice_agents').update({
    plan:             newPlan,
    features:         PLAN_FEATURES[newPlan],
    minutes_plan:     newTier,
    minutes_included: newMinutes,
    ai_ops_limit:     newOps,
  }).eq('id', agent.id);

  const portalEmail = updatedAgent?.portal_email as string | null;

  // Minutes ledger: audit trail del cambio de tier. Delta puede ser + o -.
  // Ceiling nuevo se aplica inmediatamente en refresh_pool_cache siguiente.
  if (minutesDelta !== 0) {
    if (portalEmail) {
      const { error: ledErr } = await supabase.rpc('apply_ledger_entry', {
        p_portal_email: portalEmail,
        p_agent_id:     agent.id,
        p_amount:       minutesDelta,
        p_kind:         changeKind,
        p_reference_id: `plan_change_${agent.id}_${Date.now()}`,
        p_description:  `Cambio de plan ${changeLabel} · ${minutesDelta >= 0 ? '+' : ''}${minutesDelta} min`,
      });
      if (ledErr) console.error('[change-plan] apply_ledger_entry falló', ledErr);
    } else {
      await supabase.from('minutes_ledger').insert({
        agent_id:    agent.id,
        amount:      minutesDelta,
        description: `Cambio de plan ${changeLabel} · ${minutesDelta >= 0 ? '+' : ''}${minutesDelta} min`,
        source:      changeKind,   // 'plan_downgrade' | 'plan_upgrade' — label bonito en UI
        kind:        changeKind,
      });
    }
  }

  // Ops ledger paralelo (solo si org tiene ops_ledger habilitado).
  if (opsDelta !== 0 && portalEmail) {
    const { data: org } = await supabase
      .from('organizations')
      .select('ops_ledger_enabled')
      .eq('portal_email', portalEmail)
      .maybeSingle();
    if (org?.ops_ledger_enabled) {
      const { error: opsLedErr } = await supabase.rpc('apply_ops_ledger_entry', {
        p_portal_email: portalEmail,
        p_agent_id:     agent.id,
        p_amount:       opsDelta,
        p_kind:         changeKind,
        p_reference_id: `plan_change_${agent.id}_${Date.now()}`,
        p_description:  `Cambio de plan ${changeLabel} · ${opsDelta >= 0 ? '+' : ''}${opsDelta} tareas`,
      });
      if (opsLedErr) console.error('[change-plan] apply_ops_ledger_entry falló', opsLedErr);
    }
  }

  // Recompute pool de ops SIEMPRE (no solo cuando cambia plan). Un cambio de
  // tier también cambia ai_ops_limit del agente y por tanto la suma org-level.
  if (portalEmail) {
    const { recomputeOrgOpsPool } = await import('@/lib/ai/ops-guard');
    await recomputeOrgOpsPool(portalEmail);
    // Refresh minutes cache para reflejar el nuevo minutes_included del plan.
    const { error: refreshErr } = await supabase.rpc('refresh_pool_cache', { p_portal_email: portalEmail });
    if (refreshErr) console.error('[change-plan] refresh_pool_cache falló', refreshErr);
  }

  return NextResponse.json({ success: true });
}
