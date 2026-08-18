import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';
import { requirePortalAccess } from '@/lib/portal/access';
import { getPrimaryAgentFromToken } from '@/lib/portal/org-token';
import { createAdminClient } from '@/lib/supabase/admin';
import { stripe } from '@/lib/stripe';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const cookieStore = await cookies();
  const session = await verifySession(cookieStore.get(PORTAL_COOKIE)?.value ?? '');
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = createAdminClient();
  const agent = await getPrimaryAgentFromToken<{
    auto_refill_enabled: boolean | null;
    auto_refill_threshold: number | null;
    auto_refill_minutes: number | null;
    auto_refill_ops_enabled: boolean | null;
    auto_refill_ops_threshold: number | null;
    auto_refill_ops_amount: number | null;
    stripe_customer_id: string | null;
    portal_email: string | null;
  }>(token, 'auto_refill_enabled, auto_refill_threshold, auto_refill_minutes, auto_refill_ops_enabled, auto_refill_ops_threshold, auto_refill_ops_amount, stripe_customer_id, portal_email', supabase);

  if (!agent) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (session.portalEmail && agent.portal_email && session.portalEmail !== agent.portal_email)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

  let hasCard = false;
  if (agent.stripe_customer_id) {
    const pms = await stripe.paymentMethods.list({ customer: agent.stripe_customer_id, type: 'card' });
    hasCard = pms.data.length > 0;
  }

  return NextResponse.json({
    enabled:          agent.auto_refill_enabled          ?? false,
    threshold:        agent.auto_refill_threshold        ?? 50,
    minutes:          agent.auto_refill_minutes          ?? 100,
    opsEnabled:       agent.auto_refill_ops_enabled      ?? false,
    opsThreshold:     agent.auto_refill_ops_threshold    ?? 50,
    opsAmount:        agent.auto_refill_ops_amount       ?? 100,
    hasCard,
  });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  // Owner-only: auto-refill dispara cargos automáticos con la tarjeta del
  // owner cuando cruza threshold. Sub-user no debe activarlo/desactivarlo
  // ni ajustar el monto. Ver Scope D3 CRIT-1.
  const gate = await requirePortalAccess(req, { ownerOnly: true });
  if (!gate.ok) return gate.response;
  const session = gate.session;

  const body = await req.json() as {
    enabled: boolean; threshold: number; minutes: number;
    opsEnabled: boolean; opsThreshold: number; opsAmount: number;
  };

  if (
    typeof body.enabled      !== 'boolean'          ||
    ![25, 50, 75, 100].includes(body.threshold)     ||
    ![100, 200].includes(body.minutes)              ||
    typeof body.opsEnabled   !== 'boolean'          ||
    ![50, 100, 150, 200].includes(body.opsThreshold) ||
    ![100, 300].includes(body.opsAmount)
  ) {
    return NextResponse.json({ error: 'Invalid parameters' }, { status: 400 });
  }

  const supabase = createAdminClient();

  // IDOR guard: verify the token belongs to the session's account
  const agentCheck = await getPrimaryAgentFromToken<{ id: string; portal_email: string | null }>(token, 'id, portal_email', supabase);
  if (!agentCheck) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (session.portalEmail && agentCheck.portal_email && session.portalEmail !== agentCheck.portal_email)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

  // Auto-refill es org-level: propagar a TODOS los meerkats del org.
  // Ver [[handoff-peer-discrimination-fix]] audit 2026-08-18.
  const query = supabase.from('voice_agents').update({
    auto_refill_enabled:        body.enabled,
    auto_refill_threshold:      body.threshold,
    auto_refill_minutes:        body.minutes,
    auto_refill_ops_enabled:    body.opsEnabled,
    auto_refill_ops_threshold:  body.opsThreshold,
    auto_refill_ops_amount:     body.opsAmount,
  });
  const { error } = agentCheck.portal_email
    ? await query.eq('portal_email', agentCheck.portal_email)
    : await query.eq('id', agentCheck.id);

  if (error) return NextResponse.json({ error: 'DB error' }, { status: 500 });
  return NextResponse.json({ ok: true });
}
