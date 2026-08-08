import { NextRequest, NextResponse } from 'next/server';
import { isAdmin } from '@/lib/admin/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { JORNADA_CONFIG, NOX_MONTHLY_CONFIG } from '@/lib/billing/plans';
import type { JornadaType } from '@/types/agent';
import type { MinutesTier } from '@/lib/billing/plans';

export const dynamic = 'force-dynamic';

// Costos unitarios reales (agosto 2026, ver decisions_centinelia_session70).
const COST_PER_MIN_VAPI     = 0.06;
const COST_PER_MIN_TWILIO   = 0.02;
const COST_PER_OP_ANTHROPIC = 0.05;
const SAFETY_BUFFER         = 1.30;

type Platform = 'vapi' | 'twilio' | 'anthropic';
const PLATFORMS: readonly Platform[] = ['vapi', 'twilio', 'anthropic'];

interface Projection {
  total_minutes:      number;
  total_ops:          number;
  active_agents:      number;
  vapi_projected:     number;
  twilio_projected:   number;
  anthropic_projected: number;
}

interface AtRiskAgent {
  agent_id:             string;
  agent_name:           string | null;
  business_name:        string | null;
  portal_email:         string | null;
  grace_period_ends_at: string | null;
  days_remaining:       number | null;
  minutes:              number;
  aiOps:                number;
}

async function computeProjectionAndAtRisk(
  supabase: ReturnType<typeof createAdminClient>,
): Promise<{ projection: Projection; at_risk: AtRiskAgent[] }> {
  // Solo cuentan clientes cuya suscripción está al día. Los que están en
  // `pago_fallido` van a la lista "en riesgo" — no engordan la proyección
  // hasta que sepamos si pagan o pausan.
  const { data: agents } = await supabase
    .from('voice_agents')
    .select('id, agent_name, business_name, portal_email, jornada_type, minutes_plan, features, billing_status, grace_period_ends_at')
    .eq('active', true)
    .not('minutes_plan', 'is', null);

  let totalMinutes = 0;
  let totalOps     = 0;
  let count        = 0;
  const atRisk: AtRiskAgent[] = [];
  const nowMs = Date.now();

  for (const agent of agents ?? []) {
    const jornada = agent.jornada_type as JornadaType | null;
    const tier    = agent.minutes_plan as MinutesTier | null;
    if (!tier) continue;

    const features = (agent.features ?? {}) as Record<string, unknown>;
    const isCoordinator = features.is_coordinator === true;

    let alloc: { minutes: number; aiOps: number } | null = null;
    if (isCoordinator) {
      const cfg = NOX_MONTHLY_CONFIG[tier];
      if (cfg) alloc = { minutes: cfg.minutes, aiOps: cfg.aiOps };
    } else if (jornada && JORNADA_CONFIG[jornada]?.[tier]) {
      alloc = JORNADA_CONFIG[jornada][tier];
    }
    if (!alloc) continue;

    const billingStatus = agent.billing_status as string | null;
    if (billingStatus === 'pago_fallido') {
      const graceEnd = agent.grace_period_ends_at as string | null;
      const daysRemaining = graceEnd
        ? Math.max(0, Math.ceil((new Date(graceEnd).getTime() - nowMs) / (24 * 60 * 60 * 1000)))
        : null;
      atRisk.push({
        agent_id:             agent.id as string,
        agent_name:           (agent.agent_name    as string | null) ?? null,
        business_name:        (agent.business_name as string | null) ?? null,
        portal_email:         (agent.portal_email  as string | null) ?? null,
        grace_period_ends_at: graceEnd,
        days_remaining:       daysRemaining,
        minutes:              alloc.minutes,
        aiOps:                alloc.aiOps,
      });
      continue;
    }

    totalMinutes += alloc.minutes;
    totalOps     += alloc.aiOps;
    count++;
  }

  return {
    projection: {
      total_minutes:       totalMinutes,
      total_ops:           totalOps,
      active_agents:       count,
      vapi_projected:      totalMinutes * COST_PER_MIN_VAPI,
      twilio_projected:    totalMinutes * COST_PER_MIN_TWILIO,
      anthropic_projected: totalOps     * COST_PER_OP_ANTHROPIC,
    },
    at_risk: atRisk,
  };
}

function startOfMonthIso(): string {
  const d = new Date();
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

export async function GET() {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = createAdminClient();
  const { projection, at_risk } = await computeProjectionAndAtRisk(supabase);

  const { data: balances } = await supabase
    .from('platform_balances')
    .select('platform, current_balance_usd, balance_updated_at, notes');

  const monthStart = startOfMonthIso();
  const { data: topups } = await supabase
    .from('platform_topups')
    .select('id, platform, amount_usd, topped_up_at, performed_by, notes')
    .gte('topped_up_at', monthStart)
    .order('topped_up_at', { ascending: false });

  const { data: allTopups } = await supabase
    .from('platform_topups')
    .select('id, platform, amount_usd, topped_up_at, performed_by, notes')
    .order('topped_up_at', { ascending: false })
    .limit(30);

  const byPlatform = new Map<Platform, {
    balance: number;
    balance_updated_at: string | null;
    notes: string | null;
    topped_up_this_month: number;
    projected_monthly: number;
    recommended_topup: number;
  }>();

  for (const p of PLATFORMS) {
    const bRow = (balances ?? []).find(b => b.platform === p);
    const currentBalance = Number(bRow?.current_balance_usd ?? 0);
    const monthTopups = (topups ?? []).filter(t => t.platform === p);
    const toppedUpThisMonth = monthTopups.reduce((sum, t) => sum + Number(t.amount_usd), 0);

    const projected = p === 'vapi'      ? projection.vapi_projected
                    : p === 'twilio'    ? projection.twilio_projected
                    : projection.anthropic_projected;
    const needed = projected * SAFETY_BUFFER;
    const recommended = Math.max(0, needed - currentBalance);

    byPlatform.set(p, {
      balance:              currentBalance,
      balance_updated_at:   (bRow?.balance_updated_at as string | null) ?? null,
      notes:                (bRow?.notes as string | null) ?? null,
      topped_up_this_month: toppedUpThisMonth,
      projected_monthly:    projected,
      recommended_topup:    Math.round(recommended * 100) / 100,
    });
  }

  return NextResponse.json({
    projection,
    platforms: Object.fromEntries(byPlatform),
    topups_this_month: topups ?? [],
    topups_recent:     allTopups ?? [],
    at_risk,
  });
}

export async function POST(req: NextRequest) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => null) as {
    action?:   'update_balance' | 'record_topup';
    platform?: Platform;
    amount?:   number;
    notes?:    string | null;
  } | null;

  if (!body || !body.platform || !PLATFORMS.includes(body.platform)) {
    return NextResponse.json({ error: 'platform inválida' }, { status: 400 });
  }
  const platform = body.platform;
  const amount = Number(body.amount);
  if (!Number.isFinite(amount) || amount < 0) {
    return NextResponse.json({ error: 'amount inválido' }, { status: 400 });
  }

  const supabase = createAdminClient();

  if (body.action === 'update_balance') {
    const { error } = await supabase
      .from('platform_balances')
      .upsert({
        platform,
        current_balance_usd: amount,
        balance_updated_at:  new Date().toISOString(),
        notes:               body.notes ?? null,
        updated_at:          new Date().toISOString(),
      }, { onConflict: 'platform' });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, platform, balance: amount });
  }

  if (body.action === 'record_topup') {
    if (amount === 0) return NextResponse.json({ error: 'amount debe ser > 0' }, { status: 400 });
    const { data, error } = await supabase
      .from('platform_topups')
      .insert({
        platform,
        amount_usd:  amount,
        performed_by: 'admin',
        notes:        body.notes ?? null,
      })
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Suma automática al balance actual: si registró recarga, actualiza el snapshot.
    const { data: prev } = await supabase
      .from('platform_balances')
      .select('current_balance_usd')
      .eq('platform', platform)
      .maybeSingle();
    const newBalance = Number(prev?.current_balance_usd ?? 0) + amount;
    await supabase
      .from('platform_balances')
      .upsert({
        platform,
        current_balance_usd: newBalance,
        balance_updated_at:  new Date().toISOString(),
        updated_at:          new Date().toISOString(),
      }, { onConflict: 'platform' });

    return NextResponse.json({ ok: true, topup: data, new_balance: newBalance });
  }

  return NextResponse.json({ error: 'action inválida' }, { status: 400 });
}
