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

async function computeProjection(supabase: ReturnType<typeof createAdminClient>): Promise<Projection> {
  // Agentes activos con plan asignado — computamos su consumo esperado mensual.
  const { data: agents } = await supabase
    .from('voice_agents')
    .select('id, jornada_type, minutes_plan, features')
    .eq('active', true)
    .not('minutes_plan', 'is', null);

  let totalMinutes = 0;
  let totalOps     = 0;
  let count        = 0;

  for (const agent of agents ?? []) {
    const jornada = agent.jornada_type as JornadaType | null;
    const tier    = agent.minutes_plan as MinutesTier | null;
    if (!tier) continue;

    const features = (agent.features ?? {}) as Record<string, unknown>;
    const isCoordinator = features.is_coordinator === true;

    if (isCoordinator) {
      const cfg = NOX_MONTHLY_CONFIG[tier];
      if (cfg) {
        totalMinutes += cfg.minutes;
        totalOps     += cfg.aiOps;
        count++;
      }
    } else if (jornada && JORNADA_CONFIG[jornada]?.[tier]) {
      const alloc = JORNADA_CONFIG[jornada][tier];
      totalMinutes += alloc.minutes;
      totalOps     += alloc.aiOps;
      count++;
    }
  }

  return {
    total_minutes:       totalMinutes,
    total_ops:           totalOps,
    active_agents:       count,
    vapi_projected:      totalMinutes * COST_PER_MIN_VAPI,
    twilio_projected:    totalMinutes * COST_PER_MIN_TWILIO,
    anthropic_projected: totalOps     * COST_PER_OP_ANTHROPIC,
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
  const projection = await computeProjection(supabase);

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
