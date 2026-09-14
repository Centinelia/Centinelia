export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { withPortalAuth } from '@/lib/portal/with-portal-auth';
import type { AutomationName, AutomationsConfig } from '@/types/agent';

const VALID_AUTOMATIONS: AutomationName[] = ['heartbeat', 'weekly_insights', 'learn'];

const LEARN_EMAIL_PROVIDERS = ['gmail', 'outlook'] as const;

// Cost estimates (aprox.) per month. Grounded in the hardcoded consumeAiOp
// calls in each cron × monthly cadence.
const ESTIMATED_TAREAS_MO: Record<AutomationName, string> = {
  heartbeat:       'aprox. 20-150 tareas/mes',
  weekly_insights: 'aprox. 0-12 tareas/mes',
  learn:           'aprox. 80 tareas/mes',
  brief_del_dia:   'aprox. 25 tareas/mes',
};

interface AgentRow {
  id:                     string;
  portal_email:           string;
  ai_ops_used:            number | null;
  ai_ops_limit:           number | null;
  minutes_reset_date:     string | null;
  features:               Record<string, unknown> | null;
  heartbeat_config:       Record<string, unknown> | null;
  heartbeat_last_run_at:  string | null;
}

// Email integration check — fail-open ante error de DB para no desactivar
// toggles por hiccup temporal.
async function hasEmailIntegration(portalEmail: string): Promise<boolean> {
  const supabase = createAdminClient();

  const { data: orgAcct, error: orgErr } = await supabase
    .from('integration_accounts')
    .select('provider, status')
    .eq('portal_email', portalEmail)
    .in('provider', [...LEARN_EMAIL_PROVIDERS])
    .neq('status', 'needs_reauth')
    .limit(1);
  if (orgErr) {
    console.error('[automations] hasEmailIntegration org query failed:', orgErr);
    return true;
  }
  if ((orgAcct?.length ?? 0) > 0) return true;

  const { data, error: perAgentErr } = await (supabase
    .from('email_integrations')
    .select('agent_id, voice_agents!inner(portal_email)')
    .eq('voice_agents.portal_email', portalEmail)
    .in('provider', [...LEARN_EMAIL_PROVIDERS])
    .eq('needs_reauth', false)
    .limit(1) as unknown as Promise<{ data: unknown[] | null; error: unknown }>);
  if (perAgentErr) {
    console.error('[automations] hasEmailIntegration per-agent query failed:', perAgentErr);
    return true;
  }
  return (data?.length ?? 0) > 0;
}

// GET — return automations state + quota
export const GET = withPortalAuth<AgentRow>(
  async (_req, { agent }) => {
    const auto = (agent!.features?.automations as AutomationsConfig | undefined) ?? {};
    const emailConnected = await hasEmailIntegration(agent!.portal_email);

    const automations = VALID_AUTOMATIONS.reduce(
      (acc, name) => {
        acc[name] = {
          enabled:              !!auto[name]?.enabled,
          estimated_tareas_mo:  ESTIMATED_TAREAS_MO[name],
          last_ran_at:          name === 'heartbeat'
            ? (auto.heartbeat?.last_ran_at ?? agent!.heartbeat_last_run_at ?? null)
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
        used:      agent!.ai_ops_used,
        limit:     agent!.ai_ops_limit,
        resets_at: agent!.minutes_reset_date,
      },
    });
  },
  {
    loadAgent:   true,
    agentSelect: 'id, portal_token, portal_email, ai_ops_used, ai_ops_limit, minutes_reset_date, features, heartbeat_config, heartbeat_last_run_at',
  },
);

// PATCH — toggle one automation
export const PATCH = withPortalAuth<AgentRow>(
  async (req, { agent, supabase, agentId }) => {
    const body = (await req.json().catch(() => null)) as {
      automation?: string;
      enabled?:    boolean;
    } | null;

    if (!body || !body.automation || typeof body.enabled !== 'boolean') {
      return NextResponse.json({ error: 'Body inválido' }, { status: 400 });
    }
    if (!VALID_AUTOMATIONS.includes(body.automation as AutomationName)) {
      return NextResponse.json({ error: 'Automatización desconocida' }, { status: 400 });
    }

    const name = body.automation as AutomationName;

    if (name === 'learn' && body.enabled) {
      const hasEmail = await hasEmailIntegration(agent!.portal_email);
      if (!hasEmail) {
        return NextResponse.json({ error: 'Requiere correo conectado' }, { status: 400 });
      }
    }

    // Re-SELECT fresco para evitar clobber de writes concurrentes.
    const { data: fresh } = await supabase
      .from('voice_agents')
      .select('features, heartbeat_config')
      .eq('id', agentId!)
      .eq('portal_email', agent!.portal_email)
      .maybeSingle();

    const currentFeatures = (fresh?.features ?? agent!.features ?? {}) as Record<string, unknown>;
    const currentAuto = ((currentFeatures as { automations?: AutomationsConfig }).automations) ?? {};

    const nextFeatures = {
      ...currentFeatures,
      automations: {
        ...currentAuto,
        [name]: { ...(currentAuto[name] ?? {}), enabled: body.enabled },
      },
    };

    const updates: Record<string, unknown> = { features: nextFeatures };

    // Constraint D9: heartbeat cron reads heartbeat_config.enabled — keep in sync.
    if (name === 'heartbeat') {
      const hcfg = (fresh?.heartbeat_config ?? agent!.heartbeat_config ?? {}) as Record<string, unknown>;
      updates.heartbeat_config = { ...hcfg, enabled: body.enabled };
    }

    const { error: dbError } = await supabase
      .from('voice_agents')
      .update(updates)
      .eq('id', agentId!)
      .eq('portal_email', agent!.portal_email);

    if (dbError) {
      console.error('[automations] PATCH update failed:', dbError);
      return NextResponse.json({ error: 'No pudimos guardar el cambio' }, { status: 500 });
    }

    return NextResponse.json({ ok: true, automation: name, enabled: body.enabled });
  },
  {
    loadAgent:       true,
    agentSelect:     'id, portal_token, portal_email, ai_ops_used, ai_ops_limit, minutes_reset_date, features, heartbeat_config, heartbeat_last_run_at',
    rateLimit:       'configWrite',
    rateLimitPrefix: 'automations',
  },
);
