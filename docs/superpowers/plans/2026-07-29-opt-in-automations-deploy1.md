# Opt-in Automations — Deploy 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship opt-in gating for the 3 ops-hungry crons (heartbeat, weekly-insights, learn) with a portal UI at `/portal/[token]/configurar/automatizaciones`, quota-exhausted email flow, and biweekly schedule for learn. Copy uses narrow scope (calls/emails only) honestly — expansion of cron scope happens in Deploy 2+3.

**Architecture:** Each ops-hungry cron filters agents by `voice_agents.features->automations->{name}->>enabled = 'true'` before iterating. Portal UI writes to that JSONB field via PATCH endpoint. When `consumeAiOp` fails inside a cron, we call `maybeSendQuotaEmail(agent, feature)` which rate-limits to 1 email per (agent × feature) per 7 days via `features.automations.<name>.last_quota_email_sent_at`.

**Tech Stack:** Next.js 16, React 19, Supabase (PostgreSQL + service role), Anthropic SDK, Resend (email), Tailwind CSS.

## Global Constraints

- Next.js version is 16.2.9 with breaking changes vs training data — check `node_modules/next/dist/docs/` before writing route/server-component code
- Portal copy language: **Spanish MX**. No em dashes (use `:`, `,`, or `.`). No emojis in UI (Lucide icons only). Avoid the word "IA" in visible copy; prefer "empleado digital" per project conventions
- All portal API routes require token validation (`portal_token` on `voice_agents`) + org ownership verification (IDOR pattern). Sub-user routes also honor `portal_users.modules` array
- Ops accounting is atomic via Postgres `consume_ai_ops` RPC — always route through `consumeAiOp(agentId, count)` helper, never write to `ai_ops_used` directly
- Emails sent via `sendEmail` helper from `@/lib/email/send` (Resend backed). Templates must use the existing `C` color palette and `shell()` wrapper for brand consistency
- Feature flags live in `voice_agents.features` (JSONB). Merge-write only — never replace the entire `features` object
- Cron authentication: `Bearer ${process.env.CRON_SECRET}` on the `Authorization` header. Exception: `push-conversational-prompts` uses query param `?secret=`
- Do NOT modify `heartbeat_config` schema. Sync `features.automations.heartbeat.enabled` ↔ `heartbeat_config.enabled` in the PATCH endpoint only. The heartbeat cron keeps reading from `heartbeat_config`
- Do NOT touch `batch-eval` or `batch-eval-retrieve` — Centinelia absorbs those costs (spec D1)
- Frequency of `learn` after this deploy: `0 9 8,22 * *` (day 8 and 22 of each month at 9am)

## File Structure

**New files:**
- `src/lib/ai/quota-email.ts` — `maybeSendQuotaEmail(agent, feature)` helper with 7-day rate limit
- `src/app/api/portal/[token]/agentes/[agentId]/automations/route.ts` — GET + PATCH endpoint
- `src/app/portal/[token]/configurar/automatizaciones/page.tsx` — server component (data fetch)
- `src/app/portal/[token]/configurar/automatizaciones/AutomationsClient.tsx` — client component (toggles)
- `docs/superpowers/plans/2026-07-29-opt-in-automations-cost-validation.md` — Task 0 output (measured costs)

**Modified files:**
- `src/app/api/cron/weekly-insights/route.ts` — add opt-in filter + per-agent `consumeAiOp` + quota email hook
- `src/app/api/cron/learn/route.ts` — add opt-in filter + `consumeAiOp` + quota email hook
- `src/app/api/cron/heartbeat/route.ts` — add quota email hook only (already has opt-in + consumeAiOp)
- `vercel.json` — change `learn` schedule to `0 9 8,22 * *`
- `src/app/portal/[token]/configurar/ConfigurarSidebar.tsx` — add "Automatizaciones" nav item

**No SQL migrations required** — `voice_agents.features` is already JSONB; adding nested keys is transparent.

---

## Task 0 — Pre-work: Validate costs on demo agent

**Files:**
- Create: `docs/superpowers/plans/2026-07-29-opt-in-automations-cost-validation.md`

**Interfaces:**
- Consumes: nothing
- Produces: measured tareas/month ranges for heartbeat, weekly-insights, learn (referenced by Task 6 UI copy)

This is done manually before code — outputs feed the UI copy. No commit needed for measurements themselves; just the markdown summary.

- [ ] **Step 1: Trigger heartbeat manually on demo agent 3 times**

Get the CRON_SECRET from `.env.local`, then:

```bash
for i in 1 2 3; do
  curl -H "Authorization: Bearer $CRON_SECRET" \
       https://www.centinelia.mx/api/cron/heartbeat
  sleep 5
done
```

Note the ops consumed per execution from the Anthropic dashboard (input + output tokens for `claude-haiku-4-5` calls in that window). Multiply by frequency (daily = 30/mo, weekly = 4/mo). Record range.

- [ ] **Step 2: Trigger weekly-insights on demo agent**

Same pattern. Only need 1-2 runs since it processes a full week of calls each time.

- [ ] **Step 3: Trigger learn on demo agent**

Same pattern. Run 1-2 times (it's expensive).

- [ ] **Step 4: Write measurements to markdown**

Create `docs/superpowers/plans/2026-07-29-opt-in-automations-cost-validation.md` with:

```markdown
# Cost Validation — 2026-07-29

Measured on DEMO_AGENT_ID = 10a70b8b-dad7-432d-bdfb-28f2876071f3

| Feature | Tokens/run | Ops/run | Frequency | Range mo |
|---|---|---|---|---|
| heartbeat (daily) | X | Y | 30/mo | ~A-B |
| weekly-insights | X | Y | 4/mo | ~A-B |
| learn (biweekly) | X | Y | 2/mo | ~A-B |
```

- [ ] **Step 5: Commit**

```bash
git add docs/superpowers/plans/2026-07-29-opt-in-automations-cost-validation.md
git commit -m "docs(plan): cost validation measurements for opt-in automations"
```

---

## Task 1 — Extend `voice_agents.features` type

**Files:**
- Modify: `src/types/agent.ts`

**Interfaces:**
- Consumes: existing `VoiceAgent.features` shape
- Produces: `AutomationsConfig` type consumed by Tasks 2, 3, 5, 6, 7

- [ ] **Step 1: Add type**

In `src/types/agent.ts`, near other feature-related types, add:

```typescript
export type AutomationName = 'heartbeat' | 'weekly_insights' | 'learn';

export interface AutomationConfig {
  enabled: boolean;
  last_ran_at?: string;
  last_quota_email_sent_at?: string;
}

export type AutomationsConfig = Partial<Record<AutomationName, AutomationConfig>>;
```

Extend the existing `features` type on `VoiceAgent` (or the `features` JSONB shape wherever it's declared) to include optional `automations?: AutomationsConfig`.

- [ ] **Step 2: Run tsc to verify no regressions**

```bash
npx tsc --noEmit 2>&1 | tail -20
```

Expected: clean (0 new errors).

- [ ] **Step 3: Commit**

```bash
git add src/types/agent.ts
git commit -m "feat(types): add AutomationsConfig for opt-in cron gating"
```

---

## Task 2 — `maybeSendQuotaEmail` helper

**Files:**
- Create: `src/lib/ai/quota-email.ts`
- Test: `src/lib/ai/quota-email.test.ts` (or existing test infra pattern)

**Interfaces:**
- Consumes: `AutomationName` type, `sendEmail` from `@/lib/email/send`, `createAdminClient` from `@/lib/supabase/admin`
- Produces: `maybeSendQuotaEmail(agentRow, automation)` used by Tasks 3, 4, 5

- [ ] **Step 1: Write the test**

```typescript
// src/lib/ai/quota-email.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { maybeSendQuotaEmail } from './quota-email';

vi.mock('@/lib/email/send', () => ({ sendEmail: vi.fn().mockResolvedValue({ ok: true }) }));
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({
      update: () => ({ eq: () => Promise.resolve({ error: null }) }),
    }),
  }),
}));

describe('maybeSendQuotaEmail', () => {
  beforeEach(() => vi.clearAllMocks());

  it('sends email if last_quota_email_sent_at is null', async () => {
    const { sendEmail } = await import('@/lib/email/send');
    const agent = {
      id: 'a1', client_email: 'x@y.com', agent_name: 'Nia', business_name: 'B',
      ai_ops_used: 300, ai_ops_limit: 300, minutes_reset_date: '2026-08-01',
      portal_token: 'tok',
      features: { automations: { learn: { enabled: true } } },
    };
    const result = await maybeSendQuotaEmail(agent as any, 'learn');
    expect(result.sent).toBe(true);
    expect(sendEmail).toHaveBeenCalledOnce();
  });

  it('skips if last_quota_email_sent_at is within 7 days', async () => {
    const { sendEmail } = await import('@/lib/email/send');
    const recent = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
    const agent = {
      id: 'a1', client_email: 'x@y.com', agent_name: 'Nia', business_name: 'B',
      ai_ops_used: 300, ai_ops_limit: 300, minutes_reset_date: '2026-08-01',
      portal_token: 'tok',
      features: { automations: { learn: { enabled: true, last_quota_email_sent_at: recent } } },
    };
    const result = await maybeSendQuotaEmail(agent as any, 'learn');
    expect(result.sent).toBe(false);
    expect(sendEmail).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test and verify it fails**

```bash
npx vitest run src/lib/ai/quota-email.test.ts
```

Expected: FAIL (module not found).

- [ ] **Step 3: Implement the helper**

```typescript
// src/lib/ai/quota-email.ts
import { sendEmail } from '@/lib/email/send';
import { createAdminClient } from '@/lib/supabase/admin';
import type { AutomationName } from '@/types/agent';

const LABELS: Record<AutomationName, string> = {
  heartbeat:        'el reporte diario',
  weekly_insights:  'las recomendaciones semanales',
  learn:            'el aprendizaje quincenal',
};

const RATE_LIMIT_MS = 7 * 24 * 60 * 60 * 1000;

interface AgentSubset {
  id:                 string;
  client_email:       string | null;
  agent_name:         string | null;
  business_name:      string | null;
  ai_ops_used:        number;
  ai_ops_limit:       number;
  minutes_reset_date: string | null;
  portal_token:       string | null;
  features:           any;
}

export async function maybeSendQuotaEmail(agent: AgentSubset, automation: AutomationName): Promise<{ sent: boolean }> {
  if (!agent.client_email) return { sent: false };
  const last = agent.features?.automations?.[automation]?.last_quota_email_sent_at as string | undefined;
  if (last) {
    const age = Date.now() - new Date(last).getTime();
    if (age < RATE_LIMIT_MS) return { sent: false };
  }

  const label = LABELS[automation];
  const resetDate = agent.minutes_reset_date ?? '';
  const portalUrl = agent.portal_token
    ? `https://www.centinelia.mx/portal/${agent.portal_token}/cuenta`
    : 'https://www.centinelia.mx';

  await sendEmail({
    to:      agent.client_email,
    subject: `Tu empleado necesita más tareas`,
    html: `
      <p>Hola,</p>
      <p>${agent.agent_name ?? 'Tu empleado'} intentó ejecutar ${label} pero se acabó tu pool
      mensual de tareas (${agent.ai_ops_used}/${agent.ai_ops_limit}).</p>
      <p>El feature se pausa automáticamente hasta que:</p>
      <ul>
        <li>El pool se resetee el ${resetDate}, o</li>
        <li>Compres un paquete extra de tareas</li>
      </ul>
      <p><a href="${portalUrl}">Comprar tareas extras</a></p>
      <p>Si crees que esto es un error, respóndenos a hola@centinelia.mx.</p>
      <p>Centinelia</p>
    `,
  });

  const supabase = createAdminClient();
  const nextFeatures = {
    ...(agent.features ?? {}),
    automations: {
      ...((agent.features?.automations ?? {}) as object),
      [automation]: {
        ...((agent.features?.automations?.[automation] ?? {}) as object),
        last_quota_email_sent_at: new Date().toISOString(),
      },
    },
  };
  await supabase.from('voice_agents').update({ features: nextFeatures }).eq('id', agent.id);

  return { sent: true };
}
```

- [ ] **Step 4: Run tests and verify they pass**

```bash
npx vitest run src/lib/ai/quota-email.test.ts
```

Expected: both tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/ai/quota-email.ts src/lib/ai/quota-email.test.ts
git commit -m "feat(ai): add maybeSendQuotaEmail with 7-day rate limit per (agent, automation)"
```

---

## Task 3 — Gate `weekly-insights` cron by opt-in + quota email

**Files:**
- Modify: `src/app/api/cron/weekly-insights/route.ts`

**Interfaces:**
- Consumes: `consumeAiOp` (`@/lib/ai/ops-guard`), `maybeSendQuotaEmail` (Task 2)
- Produces: gated behavior — only agents with `features.automations.weekly_insights.enabled = true` are processed

Look at the current file first (lines 26-33) to see the query. The change adds a filter + wraps each agent iteration in an ops check.

- [ ] **Step 1: Add opt-in filter to the agents query**

Modify the `.from('voice_agents').select(...)` around line 27-31 to include `client_email, ai_ops_used, ai_ops_limit, minutes_reset_date, portal_token, features` in the select AND add the filter:

```typescript
const { data: agents } = await supabase
  .from('voice_agents')
  .select('id, business_name, role, portal_email, client_email, agent_name, ai_ops_used, ai_ops_limit, minutes_reset_date, portal_token, features')
  .eq('active', true)
  .not('portal_email', 'is', null)
  .eq('features->automations->weekly_insights->>enabled', 'true');
```

- [ ] **Step 2: Add ops guard + quota email inside the agent loop**

Inside the `for (const agent of agents ?? [])` loop, before the LLM/rules call, add:

```typescript
import { consumeAiOp } from '@/lib/ai/ops-guard';
import { maybeSendQuotaEmail } from '@/lib/ai/quota-email';

// ... inside loop, before any LLM work:
const cost = mode === 'rules' ? 0 : 3; // 3 tareas per insights run (adjust after Task 0)
if (cost > 0) {
  const ops = await consumeAiOp(agent.id, cost);
  if (!ops.ok) {
    await maybeSendQuotaEmail(agent, 'weekly_insights');
    continue;
  }
}
```

- [ ] **Step 3: Update last_ran_at after successful run**

After a successful iteration (before the next `for` iteration), update the JSONB:

```typescript
await supabase
  .from('voice_agents')
  .update({
    features: {
      ...(agent.features ?? {}),
      automations: {
        ...(agent.features?.automations ?? {}),
        weekly_insights: {
          ...(agent.features?.automations?.weekly_insights ?? {}),
          enabled: true,
          last_ran_at: new Date().toISOString(),
        },
      },
    },
  })
  .eq('id', agent.id);
```

- [ ] **Step 4: TypeScript check**

```bash
npx tsc --noEmit 2>&1 | grep -i "weekly-insights\|error"
```

Expected: no new errors.

- [ ] **Step 5: Manual smoke test locally**

Run the dev server, hit the endpoint with a valid CRON_SECRET when no agents have the flag:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/weekly-insights
```

Expected response: `{ok: true, totalRecs: 0}` (0 agents match the filter until someone opts in).

- [ ] **Step 6: Commit**

```bash
git add src/app/api/cron/weekly-insights/route.ts
git commit -m "feat(cron): gate weekly-insights by features.automations.weekly_insights.enabled"
```

---

## Task 4 — Gate `learn` cron + change schedule to biweekly

**Files:**
- Modify: `src/app/api/cron/learn/route.ts`
- Modify: `vercel.json`

**Interfaces:**
- Consumes: `consumeAiOp`, `maybeSendQuotaEmail`
- Produces: gated behavior + biweekly schedule

- [ ] **Step 1: Add opt-in filter**

In `src/app/api/cron/learn/route.ts`, find the query that fetches agents (or email integrations joined to agents). Add the filter:

```typescript
.eq('features->automations->learn->>enabled', 'true')
```

Adjust the `.select()` to include `client_email, agent_name, business_name, ai_ops_used, ai_ops_limit, minutes_reset_date, portal_token, features` for the quota email helper.

- [ ] **Step 2: Add ops guard + quota email**

Similar to Task 3 Step 2: import `consumeAiOp` and `maybeSendQuotaEmail`, wrap the per-agent processing:

```typescript
const cost = 30; // Rough — learn is heavy. Refine after Task 0.
const ops = await consumeAiOp(agent.id, cost);
if (!ops.ok) {
  await maybeSendQuotaEmail(agent, 'learn');
  continue;
}
```

- [ ] **Step 3: Update `last_ran_at` after success**

Same pattern as Task 3 Step 3 but writing to `automations.learn`.

- [ ] **Step 4: Change cron schedule in `vercel.json`**

Find the line:

```json
{ "path": "/api/cron/learn", "schedule": "0 9 * * 1" },
```

Replace with:

```json
{ "path": "/api/cron/learn", "schedule": "0 9 8,22 * *" },
```

This runs on the 8th and 22nd of each month at 9:00 UTC — approximately biweekly.

- [ ] **Step 5: TypeScript + local smoke test**

```bash
npx tsc --noEmit 2>&1 | grep -i "learn\|error"
curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/learn
```

Expected: no TS errors; endpoint returns without processing any agent (filter matches 0).

- [ ] **Step 6: Commit**

```bash
git add src/app/api/cron/learn/route.ts vercel.json
git commit -m "feat(cron): gate learn by opt-in + move to biweekly schedule (0 9 8,22 * *)"
```

---

## Task 5 — Add quota email hook to `heartbeat` cron

**Files:**
- Modify: `src/app/api/cron/heartbeat/route.ts`

**Interfaces:**
- Consumes: `maybeSendQuotaEmail` (Task 2)
- Produces: quota email when heartbeat can't consume ops

Heartbeat already has opt-in (`heartbeat_config.enabled`) and calls `consumeAiOp` (line 68). Only missing piece is the quota email on failure.

- [ ] **Step 1: Import + call helper**

At line 68 of the current file (`if (!opsResult.ok) continue;`), replace with:

```typescript
if (!opsResult.ok) {
  await maybeSendQuotaEmail(agent, 'heartbeat');
  continue;
}
```

Also extend the `.select(...)` around line 32 to include `client_email, business_name, ai_ops_used, ai_ops_limit, minutes_reset_date, portal_token, features`:

```typescript
.select('id, agent_name, business_name, client_email, timezone, heartbeat_config, heartbeat_last_run_at, ai_ops_used, ai_ops_limit, minutes_reset_date, portal_token, features')
```

Add import at top:

```typescript
import { maybeSendQuotaEmail } from '@/lib/ai/quota-email';
```

- [ ] **Step 2: TypeScript check**

```bash
npx tsc --noEmit 2>&1 | grep -i "heartbeat\|error"
```

Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/cron/heartbeat/route.ts
git commit -m "feat(cron): heartbeat emails client when pool exhausted (rate-limited 7d)"
```

---

## Task 6 — GET + PATCH `/api/portal/[token]/agentes/[agentId]/automations`

**Files:**
- Create: `src/app/api/portal/[token]/agentes/[agentId]/automations/route.ts`

**Interfaces:**
- Consumes: `AutomationName`, `AutomationsConfig` types (Task 1)
- Produces: HTTP endpoint used by Task 7 UI

Follow the existing pattern from a peer route (e.g. `src/app/api/portal/[token]/agentes/[agentId]/route.ts`) for token+ownership validation. The endpoint validates the token, confirms the agent belongs to the token's org, then reads/writes `features.automations`.

- [ ] **Step 1: Scaffold the file**

```typescript
// src/app/api/portal/[token]/agentes/[agentId]/automations/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import type { AutomationName, AutomationsConfig } from '@/types/agent';

const VALID_AUTOMATIONS: AutomationName[] = ['heartbeat', 'weekly_insights', 'learn'];

// Cost estimates in tareas per month. Refined in Task 0 output.
// TODO: replace with values from cost-validation.md after Task 0 completes.
const ESTIMATED_TAREAS_MO: Record<AutomationName, string> = {
  heartbeat:        'aprox. TBD tareas/mes',
  weekly_insights:  'aprox. TBD tareas/mes',
  learn:            'aprox. TBD tareas/mes',
};

async function loadAgent(token: string, agentId: string) {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from('voice_agents')
    .select('id, portal_token, portal_email, ai_ops_used, ai_ops_limit, minutes_reset_date, features, heartbeat_config')
    .eq('id', agentId)
    .single();

  if (!data || data.portal_token !== token) return null;
  return data;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string; agentId: string }> }) {
  const { token, agentId } = await params;
  const agent = await loadAgent(token, agentId);
  if (!agent) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const auto = (agent.features?.automations as AutomationsConfig | undefined) ?? {};
  const emailConnected = await hasEmailIntegration(agent.portal_email as string);

  const response = {
    automations: VALID_AUTOMATIONS.reduce((acc, name) => {
      acc[name] = {
        enabled: !!auto[name]?.enabled,
        estimated_tareas_mo: ESTIMATED_TAREAS_MO[name],
        last_ran_at: auto[name]?.last_ran_at ?? null,
        requires_email: name === 'learn',
        available: name === 'learn' ? emailConnected : true,
      };
      return acc;
    }, {} as Record<AutomationName, unknown>),
    quota: {
      used:      agent.ai_ops_used,
      limit:     agent.ai_ops_limit,
      resets_at: agent.minutes_reset_date,
    },
  };

  return NextResponse.json(response);
}

async function hasEmailIntegration(portalEmail: string): Promise<boolean> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from('integration_accounts')
    .select('id')
    .eq('portal_email', portalEmail)
    .in('provider', ['gmail', 'outlook'])
    .eq('status', 'active')
    .limit(1);
  return (data?.length ?? 0) > 0;
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ token: string; agentId: string }> }) {
  const { token, agentId } = await params;
  const agent = await loadAgent(token, agentId);
  if (!agent) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const body = (await req.json().catch(() => null)) as { automation?: string; enabled?: boolean } | null;
  if (!body || !body.automation || typeof body.enabled !== 'boolean') {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }
  if (!VALID_AUTOMATIONS.includes(body.automation as AutomationName)) {
    return NextResponse.json({ error: 'Unknown automation' }, { status: 400 });
  }
  const name = body.automation as AutomationName;

  if (name === 'learn' && body.enabled) {
    const hasEmail = await hasEmailIntegration(agent.portal_email as string);
    if (!hasEmail) return NextResponse.json({ error: 'Requiere correo conectado' }, { status: 400 });
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
  if (name === 'heartbeat') {
    // Keep heartbeat_config.enabled in sync so the existing cron reads the same value
    const hcfg = (agent.heartbeat_config as Record<string, unknown> | null) ?? {};
    updates.heartbeat_config = { ...hcfg, enabled: body.enabled };
  }

  const { error } = await supabase.from('voice_agents').update(updates).eq('id', agentId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, automation: name, enabled: body.enabled });
}
```

- [ ] **Step 2: Refine `ESTIMATED_TAREAS_MO` values with Task 0 output**

Open `docs/superpowers/plans/2026-07-29-opt-in-automations-cost-validation.md`. Copy the measured ranges (e.g. "aprox. 150-250 tareas/mes") into the constants above the endpoint.

- [ ] **Step 3: Manual test with curl**

Start local dev, use a real portal token + agent id from your dev DB:

```bash
curl -s http://localhost:3000/api/portal/$TOKEN/agentes/$AGENT_ID/automations | jq
```

Expected: JSON with `automations` (heartbeat/weekly_insights/learn keys) + `quota` object.

Toggle learn on when email not connected:

```bash
curl -s -X PATCH http://localhost:3000/api/portal/$TOKEN/agentes/$AGENT_ID/automations \
  -H "Content-Type: application/json" \
  -d '{"automation":"learn","enabled":true}'
```

Expected: `400 Requiere correo conectado`.

Toggle heartbeat on:

```bash
curl -s -X PATCH http://localhost:3000/api/portal/$TOKEN/agentes/$AGENT_ID/automations \
  -H "Content-Type: application/json" \
  -d '{"automation":"heartbeat","enabled":true}'
```

Expected: 200 + verify in DB that BOTH `features.automations.heartbeat.enabled` and `heartbeat_config.enabled` are now true.

- [ ] **Step 4: TypeScript check**

```bash
npx tsc --noEmit 2>&1 | grep -i "automations\|error"
```

Expected: no new errors.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/portal/[token]/agentes/[agentId]/automations/route.ts
git commit -m "feat(api): GET+PATCH portal/agentes/[id]/automations for opt-in toggles"
```

---

## Task 7 — Portal UI: `/configurar/automatizaciones` page

**Files:**
- Create: `src/app/portal/[token]/configurar/automatizaciones/page.tsx`
- Create: `src/app/portal/[token]/configurar/automatizaciones/AutomationsClient.tsx`

**Interfaces:**
- Consumes: GET/PATCH endpoint from Task 6
- Produces: URL `/portal/[token]/configurar/automatizaciones` accessible from sidebar (Task 8)

Look at an existing peer configurar page (e.g. `src/app/portal/[token]/configurar/page.tsx`) to match the layout wrapper and imports.

- [ ] **Step 1: Server component (page.tsx)**

```tsx
// src/app/portal/[token]/configurar/automatizaciones/page.tsx
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import AutomationsClient from './AutomationsClient';
import { createAdminClient } from '@/lib/supabase/admin';

export default async function AutomatizacionesPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const supabase = createAdminClient();

  const { data: agents } = await supabase
    .from('voice_agents')
    .select('id, agent_name, business_name')
    .eq('portal_token', token)
    .eq('active', true)
    .order('agent_name');

  if (!agents?.length) redirect(`/portal/${token}`);

  return <AutomationsClient token={token} agents={agents} />;
}
```

- [ ] **Step 2: Client component (AutomationsClient.tsx)**

```tsx
'use client';
import { useState, useEffect } from 'react';
import { Bell, Lightbulb, Brain } from 'lucide-react';

type AutomationName = 'heartbeat' | 'weekly_insights' | 'learn';

interface AutomationView {
  enabled:             boolean;
  estimated_tareas_mo: string;
  last_ran_at:         string | null;
  requires_email:      boolean;
  available:           boolean;
}

const META: Record<AutomationName, { title: string; desc: string; Icon: typeof Bell }> = {
  heartbeat: {
    title: 'Reporte diario de llamadas',
    desc: 'Cada mañana tu empleado te manda un email con resumen de las llamadas del día anterior.',
    Icon: Bell,
  },
  weekly_insights: {
    title: 'Recomendaciones semanales',
    desc: 'Cada lunes recibes 2-4 recomendaciones accionables basadas en tus llamadas de la semana.',
    Icon: Lightbulb,
  },
  learn: {
    title: 'Aprendizaje quincenal',
    desc: 'Cada 15 días tu empleado aprende reglas de tu negocio observando los correos recientes.',
    Icon: Brain,
  },
};

interface Props {
  token:  string;
  agents: Array<{ id: string; agent_name: string | null; business_name: string | null }>;
}

export default function AutomationsClient({ token, agents }: Props) {
  const [agentId, setAgentId] = useState(agents[0]?.id ?? '');
  const [state,   setState]   = useState<Record<AutomationName, AutomationView> | null>(null);
  const [quota,   setQuota]   = useState<{ used: number; limit: number; resets_at: string | null } | null>(null);
  const [pending, setPending] = useState<AutomationName | null>(null);
  const [error,   setError]   = useState<string | null>(null);

  async function load() {
    setError(null);
    const res = await fetch(`/api/portal/${token}/agentes/${agentId}/automations`);
    if (!res.ok) { setError('No se pudo cargar la configuración.'); return; }
    const json = await res.json();
    setState(json.automations);
    setQuota(json.quota);
  }

  useEffect(() => { if (agentId) load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [agentId]);

  async function toggle(name: AutomationName, enabled: boolean) {
    setPending(name);
    setError(null);
    const res = await fetch(`/api/portal/${token}/agentes/${agentId}/automations`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ automation: name, enabled }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(j.error ?? 'No se pudo actualizar.');
    } else {
      await load();
    }
    setPending(null);
  }

  return (
    <div className="mx-auto max-w-3xl p-6">
      <h1 className="text-2xl font-semibold mb-2">Automatizaciones</h1>
      <p className="text-sm text-gray-400 mb-6">
        Programa tareas para que tu empleado las realice automáticamente. Cada una consume tareas de tu pool mensual.
      </p>

      {agents.length > 1 && (
        <label className="block mb-6">
          <span className="text-xs uppercase tracking-wide text-gray-500">Empleado</span>
          <select
            className="mt-1 w-full rounded-lg bg-white/5 border border-white/10 p-2"
            value={agentId}
            onChange={(e) => setAgentId(e.target.value)}
          >
            {agents.map((a) => (
              <option key={a.id} value={a.id}>{a.agent_name ?? 'Sin nombre'}</option>
            ))}
          </select>
        </label>
      )}

      {quota && (
        <div className="rounded-lg bg-white/5 border border-white/10 px-4 py-2 mb-4 text-sm">
          Pool mensual: <strong>{quota.used}/{quota.limit}</strong> tareas usadas.
          {quota.resets_at && <> Se resetea el {quota.resets_at}.</>}
        </div>
      )}

      {error && (
        <div className="rounded-lg bg-red-500/10 border border-red-500/30 px-4 py-2 mb-4 text-sm text-red-300">
          {error}
        </div>
      )}

      <div className="space-y-3">
        {(['heartbeat', 'weekly_insights', 'learn'] as AutomationName[]).map((name) => {
          const meta = META[name];
          const cfg  = state?.[name];
          const disabled = !cfg?.available || pending === name;
          return (
            <div key={name} className="rounded-xl bg-white/5 border border-white/10 p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex gap-3">
                  <meta.Icon size={20} className="mt-0.5 text-purple-300" />
                  <div>
                    <h3 className="font-medium">{meta.title}</h3>
                    <p className="text-sm text-gray-400 mt-1">{meta.desc}</p>
                    <p className="text-xs text-gray-500 mt-2">
                      Costo estimado: {cfg?.estimated_tareas_mo ?? '—'}
                    </p>
                    {cfg?.requires_email && !cfg.available && (
                      <p className="text-xs text-amber-400 mt-1">Requiere correo conectado.</p>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => toggle(name, !cfg?.enabled)}
                  disabled={disabled}
                  className={`px-3 py-1.5 rounded-full text-sm font-medium transition ${
                    cfg?.enabled
                      ? 'bg-purple-500 text-white'
                      : 'bg-white/10 text-gray-300 hover:bg-white/15'
                  } ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`}
                >
                  {cfg?.enabled ? 'Activo' : 'Activar'}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Local visual test**

Run the dev server and navigate to `/portal/<token>/configurar/automatizaciones`. Verify:
- Cards render with icons + description + cost placeholder
- Toggle changes state after PATCH
- Learn card shows "Requiere correo conectado" when the agent has no email integration
- Quota bar shows used/limit

- [ ] **Step 4: Commit**

```bash
git add src/app/portal/[token]/configurar/automatizaciones/
git commit -m "feat(portal): Automatizaciones page with per-agent opt-in toggles"
```

---

## Task 8 — Add "Automatizaciones" to ConfigurarSidebar

**Files:**
- Modify: `src/app/portal/[token]/configurar/ConfigurarSidebar.tsx`

**Interfaces:**
- Consumes: existing sidebar item structure
- Produces: link entry to `/portal/[token]/configurar/automatizaciones`

- [ ] **Step 1: Read the sidebar file**

```bash
head -100 src/app/portal/[token]/configurar/ConfigurarSidebar.tsx
```

Locate the array/list of nav items (likely a JSX map or const array of items with `{ label, href, icon }`).

- [ ] **Step 2: Add the item**

Add a new entry using Lucide's `Sparkles` icon (or similar):

```typescript
{ label: 'Automatizaciones', href: `/portal/${token}/configurar/automatizaciones`, icon: Sparkles },
```

Add `import { Sparkles } from 'lucide-react';` at the top if not already imported.

Place the item near "Cuenta" or wherever a settings-adjacent item makes sense in the current order.

- [ ] **Step 3: Verify visually**

Reload the portal, open the Configurar sidebar, click "Automatizaciones". Confirm it navigates to the new page.

- [ ] **Step 4: Commit**

```bash
git add src/app/portal/[token]/configurar/ConfigurarSidebar.tsx
git commit -m "feat(portal): add Automatizaciones item to Configurar sidebar"
```

---

## Task 9 — Full manual E2E + deploy

**Files:**
- None (verification only)

**Interfaces:**
- Consumes: everything above

- [ ] **Step 1: Local E2E happy path**

With `npm run dev` and a test agent:

1. Open portal, go to Configurar → Automatizaciones
2. Toggle heartbeat ON → verify DB has `features.automations.heartbeat.enabled=true` AND `heartbeat_config.enabled=true`
3. Toggle learn ON while no email connected → error message shows
4. Connect email integration in a different tab, refresh, toggle learn ON → succeeds
5. Trigger each cron manually via curl → verify only opted-in agents processed

- [ ] **Step 2: Local E2E quota exhaustion**

1. In DB, set the test agent's `ai_ops_used = ai_ops_limit`
2. Trigger heartbeat cron
3. Verify: (a) DB shows no new `ai_ops_log` row for this agent, (b) client_email inbox receives quota email, (c) `features.automations.heartbeat.last_quota_email_sent_at` was set
4. Trigger heartbeat again immediately → verify NO second email sent (rate limit works)
5. Manually set `last_quota_email_sent_at` to 8 days ago → trigger → verify email resent

- [ ] **Step 3: Push + verify Vercel build**

```bash
git push origin main
npx vercel@latest ls centinelia_product 2>&1 | head -5
```

Wait for build to go Ready (or use background poll pattern from earlier session).

- [ ] **Step 4: Prod smoke**

1. Open production portal
2. Confirm Automatizaciones page loads without JS errors
3. Toggle a feature on a real agent
4. Wait for next cron window and check `ai_ops_log` for the expected row

- [ ] **Step 5: Update memory + spec status**

Add a line to the project memory noting Deploy 1 is live. Update the spec doc's `Estado` header from `Draft` to `Deploy 1 live 2026-XX-XX`.

- [ ] **Step 6: Final commit (docs update)**

```bash
git add docs/superpowers/specs/2026-07-29-opt-in-automations-design.md
git commit -m "docs(spec): mark opt-in automations Deploy 1 as live"
git push
```

---

## Out of scope for this plan

- **Deploy 2** (expansion of heartbeat + weekly-insights to all activity sources): calls + emails + docs + tasks + appointments. Separate spec + plan when Deploy 1 is verified stable in prod.
- **Deploy 3** (expansion of learn to include calls + docs + tasks). Separate spec + plan.
- `batch-eval` billing — stays absorbed by Centinelia (spec D1).
- Auto-refill Stripe flow — already exists via `auto_refill_ops` in organizations; no changes.
- Historical consumption dashboard per feature — nice-to-have, out of scope.

## Self-review

**Spec coverage:** ✅ D1 respected (no batch-eval changes). D2 satisfied (Task 7). D3 satisfied (Tasks 2, 3, 4, 5). D4 satisfied (Tasks 7, 8). D5 satisfied (Task 6 + Task 7 UI). D6/D7 out of scope for Deploy 1 (noted). D8 satisfied (Task 4 Step 4). D9 satisfied (Task 6 Step 1). D10 satisfied (Task 0 + Task 6 Step 2). D11 satisfied (this plan is Deploy 1 only).

**Placeholder scan:** One intentional `TBD` in Task 6 Step 1 — the cost strings get replaced in Step 2 after Task 0 measurements. Not a plan failure; it's a two-step process explicitly instructed.

**Type consistency:** `AutomationName` and `AutomationsConfig` are declared in Task 1 and consumed identically in Tasks 2, 3, 4, 5, 6, 7. `maybeSendQuotaEmail(agent, name)` signature is defined in Task 2 and called with the same shape in Tasks 3, 4, 5.

**Scope check:** Deploy 1 is one cohesive delivery (backend gating + UI + email). Deploy 2 and 3 are separate plans. Appropriate.
