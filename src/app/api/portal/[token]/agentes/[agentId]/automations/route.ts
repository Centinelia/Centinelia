export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse }       from 'next/server';
import { cookies }                          from 'next/headers';
import { createAdminClient }               from '@/lib/supabase/admin';
import { verifySession, PORTAL_COOKIE }    from '@/lib/portal/auth';
import type { AutomationName, AutomationsConfig } from '@/types/agent';

const VALID_AUTOMATIONS: AutomationName[] = ['heartbeat', 'weekly_insights', 'learn'];

const LEARN_EMAIL_PROVIDERS = ['gmail', 'outlook'] as const;

// Cost estimates (aprox.) per month. Source: cost-validation.md 2026-07-29.
// Refine after 2 weeks of prod data (query ops_log by source = cron_heartbeat/etc).
// Deploy 2 (2026-07-30) expanded heartbeat + weekly-insights to include all
// activity sources (calls + emails + docs + tasks + appts + civic_reports).
// Deploy 3 (2026-07-30) expanded learn to include calls + docs + tasks
// alongside the existing emails, bumping the per-run ops cost from 30 to 40.
const ESTIMATED_TAREAS_MO: Record<AutomationName, string> = {
  heartbeat:       'aprox. 300-500 tareas/mes',
  weekly_insights: 'aprox. 100-200 tareas/mes',
  learn:           'aprox. 300-600 tareas/mes',
};

// ─── Auth helper ──────────────────────────────────────────────────────────────
// Follows the pattern from src/app/api/portal/[token]/integrations/agents/route.ts
// to handle multi-agent orgs (anchor agent owns the portal_token; other agents share
// the same portal_email but carry different portal_token values).

async function loadAgent(token: string, agentId: string) {
  const cookieStore = await cookies();
  const session = await verifySession(cookieStore.get(PORTAL_COOKIE)?.value ?? '');
  if (!session) return { agent: null, error: 'Unauthorized', status: 401 };

  const supabase = createAdminClient();

  // Resolve the org via the anchor agent that owns this token
  const { data: anchor } = await supabase
    .from('voice_agents')
    .select('portal_email')
    .eq('portal_token', token)
    .single();
  if (!anchor?.portal_email) return { agent: null, error: 'Not found', status: 404 };
  if (session.portalEmail && anchor.portal_email !== session.portalEmail)
    return { agent: null, error: 'Unauthorized', status: 403 };

  // Load the target agent and verify it belongs to the same org
  const { data: agent } = await supabase
    .from('voice_agents')
    .select('id, portal_token, portal_email, ai_ops_used, ai_ops_limit, minutes_reset_date, features, heartbeat_config, heartbeat_last_run_at')
    .eq('id', agentId)
    .single();
  if (!agent) return { agent: null, error: 'Not found', status: 404 };
  if (agent.portal_email !== anchor.portal_email)
    return { agent: null, error: 'Forbidden', status: 403 };

  return { agent, error: null, status: 200 };
}

// ─── Email integration check ──────────────────────────────────────────────────
// Single query via embedded FK join: email_integrations → voice_agents.portal_email.

async function hasEmailIntegration(portalEmail: string): Promise<boolean> {
  const supabase = createAdminClient();
  const { data } = await (supabase
    .from('email_integrations')
    .select('agent_id, voice_agents!inner(portal_email)')
    .eq('voice_agents.portal_email', portalEmail)
    .in('provider', [...LEARN_EMAIL_PROVIDERS])
    .eq('needs_reauth', false)
    .limit(1) as any);
  return (data?.length ?? 0) > 0;
}

// ─── GET — return automations state + quota ───────────────────────────────────

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string; agentId: string }> },
) {
  const { token, agentId } = await params;
  const { agent, error, status } = await loadAgent(token, agentId);
  if (!agent) return NextResponse.json({ error }, { status });

  const auto = (agent.features?.automations as AutomationsConfig | undefined) ?? {};
  const emailConnected = await hasEmailIntegration(agent.portal_email as string);

  const automations = VALID_AUTOMATIONS.reduce(
    (acc, name) => {
      acc[name] = {
        enabled:              !!auto[name]?.enabled,
        estimated_tareas_mo:  ESTIMATED_TAREAS_MO[name],
        last_ran_at:          name === 'heartbeat'
          ? (auto.heartbeat?.last_ran_at ?? (agent as any).heartbeat_last_run_at ?? null)
          : (auto[name]?.last_ran_at ?? null),
        requires_email:       name === 'learn',
        available:            name === 'learn' ? emailConnected : true,
      };
      return acc;
    },
    {} as Record<AutomationName, unknown>,
  );

  return NextResponse.json({
    automations,
    quota: {
      used:      agent.ai_ops_used,
      limit:     agent.ai_ops_limit,
      resets_at: agent.minutes_reset_date,
    },
  });
}

// ─── PATCH — toggle one automation ───────────────────────────────────────────

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ token: string; agentId: string }> },
) {
  const { token, agentId } = await params;
  const { agent, error, status } = await loadAgent(token, agentId);
  if (!agent) return NextResponse.json({ error }, { status });

  const body = (await req.json().catch(() => null)) as {
    automation?: string;
    enabled?: boolean;
  } | null;

  if (!body || !body.automation || typeof body.enabled !== 'boolean') {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }
  if (!VALID_AUTOMATIONS.includes(body.automation as AutomationName)) {
    return NextResponse.json({ error: 'Unknown automation' }, { status: 400 });
  }

  const name = body.automation as AutomationName;

  // learn requires an active email integration
  if (name === 'learn' && body.enabled) {
    const hasEmail = await hasEmailIntegration(agent.portal_email as string);
    if (!hasEmail) {
      return NextResponse.json({ error: 'Requiere correo conectado' }, { status: 400 });
    }
  }

  const supabase = createAdminClient();
  const currentAuto = (agent.features?.automations as AutomationsConfig | undefined) ?? {};

  const nextFeatures = {
    ...(agent.features ?? {}),
    automations: {
      ...currentAuto,
      [name]: { ...(currentAuto[name] ?? {}), enabled: body.enabled },
    },
  };

  const updates: Record<string, unknown> = { features: nextFeatures };

  // Constraint D9: heartbeat cron reads heartbeat_config.enabled — keep in sync
  if (name === 'heartbeat') {
    const hcfg = (agent.heartbeat_config as Record<string, unknown> | null) ?? {};
    updates.heartbeat_config = { ...hcfg, enabled: body.enabled };
  }

  const { error: dbError } = await supabase
    .from('voice_agents')
    .update(updates)
    .eq('id', agentId);

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });

  return NextResponse.json({ ok: true, automation: name, enabled: body.enabled });
}
