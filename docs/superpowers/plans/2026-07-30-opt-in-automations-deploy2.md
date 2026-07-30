# Opt-in Automations — Deploy 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development.

**Goal:** Expand `heartbeat` + `weekly-insights` crons to include all agent activity sources (calls + emails + docs + tasks + appointments + civic_reports if gobierno), plus `agent_learnings` for weekly-insights. Update UI copy to reflect the expanded scope. Make heartbeat's `task` field optional (resolves the UX gap where empty task silently skips the cron).

**Architecture:** New DRY helper `getAgentActivityWindow(agentId, sinceISO, caps)` in `src/lib/ai/activity-window.ts` returns `{ calls, emails, docs, tasks, appts, civicReports }` in a single Promise.all. Both crons consume it. Prompts get a section per non-empty source. Heartbeat's task is optional: if empty, a default template is used.

**Tech Stack:** Next.js 16, React 19, Supabase, Anthropic SDK (Haiku), Resend, Tailwind.

## Global Constraints

- Next.js 16.2.9. No route changes in this deploy (only cron internals + UI copy + endpoint constants).
- Copy: Spanish MX. No em dashes. No word "IA" in visible copy.
- Portal API endpoints keep existing auth (no changes to `automations/route.ts` structure).
- Ops accounting stays via `consumeAiOp` (already correct in both crons from Deploy 1).
- Features JSONB MERGE-write (already correct from Deploy 1's race fix).
- Emails come from `ops_inbox` (NOT `email_messages` — that table does not exist). Columns: `id, agent_id, created_at, email_from, email_subject, category, status`.
- Learnings come from `agent_learnings` for weekly-insights only (heartbeat skips them).
- Backward compat: users who already have `features.automations.<name>.enabled = true` keep working; no re-opt-in required.

## File Structure

**New files:**
- `src/lib/ai/activity-window.ts` — `getAgentActivityWindow(agentId, sinceISO, caps, opts?)` helper

**Modified files:**
- `src/app/api/cron/heartbeat/route.ts` — use activity helper, new prompt with source blocks, task optional
- `src/lib/ai/insights-engine.ts` — extend `generateLLMInsights` to include all sources + learnings
- `src/app/portal/[token]/configurar/AutomationsSection.tsx` — update card titles + descriptions
- `src/app/api/portal/[token]/agentes/[agentId]/automations/route.ts` — update `ESTIMATED_TAREAS_MO` after measurement
- `docs/superpowers/specs/2026-07-30-opt-in-automations-deploy2-expand-sources.md` — mark Deploy 2 as live at the end

**No SQL migrations required** — all tables already exist.

---

## Task 1 — Activity window helper

**Files:**
- Create: `src/lib/ai/activity-window.ts`

**Interfaces:**
- Consumes: `createAdminClient`
- Produces: `getAgentActivityWindow(agentId, sinceISO, caps, opts)` used by Tasks 2 + 3

- [ ] **Step 1: Create the helper**

```typescript
// src/lib/ai/activity-window.ts
import { createAdminClient } from '@/lib/supabase/admin';

export interface ActivityCaps {
  calls:  number;
  emails: number;
  docs:   number;
  tasks:  number;
  appts:  number;
  civic:  number;
}

export interface ActivityWindow {
  calls:  Array<{ id: string; caller_name: string | null; outcome: string | null; summary: string | null; created_at: string; duration_seconds: number | null }>;
  emails: Array<{ id: string; email_from: string | null; email_subject: string | null; category: string | null; status: string | null; created_at: string }>;
  docs:   Array<{ id: string; type: string | null; title: string | null; created_at: string }>;
  tasks:  Array<{ id: string; title: string | null; outcome: string | null; created_at: string }>;
  appts:  Array<{ id: string; contact_name: string | null; scheduled_at: string | null; created_at: string }>;
  civic:  Array<{ id: string; folio: string | null; category: string | null; created_at: string }>;
}

export interface ActivityOpts {
  includeCivic?: boolean; // only true when vertical === 'gobierno'
}

export async function getAgentActivityWindow(
  agentId: string,
  sinceISO: string,
  caps: ActivityCaps,
  opts: ActivityOpts = {},
): Promise<ActivityWindow> {
  const supabase = createAdminClient();

  const [callsRes, emailsRes, docsRes, tasksRes, apptsRes, civicRes] = await Promise.all([
    supabase.from('voice_calls')
      .select('id, caller_name, outcome, summary, created_at, duration_seconds')
      .eq('agent_id', agentId)
      .gte('created_at', sinceISO)
      .order('created_at', { ascending: false })
      .limit(caps.calls),
    supabase.from('ops_inbox')
      .select('id, email_from, email_subject, category, status, created_at')
      .eq('agent_id', agentId)
      .gte('created_at', sinceISO)
      .order('created_at', { ascending: false })
      .limit(caps.emails),
    supabase.from('ops_documents')
      .select('id, type, title, created_at')
      .eq('agent_id', agentId)
      .gte('created_at', sinceISO)
      .order('created_at', { ascending: false })
      .limit(caps.docs),
    supabase.from('agent_tasks')
      .select('id, title, outcome, created_at')
      .eq('agent_id', agentId)
      .not('outcome', 'is', null)
      .gte('created_at', sinceISO)
      .order('created_at', { ascending: false })
      .limit(caps.tasks),
    supabase.from('appointments_voice')
      .select('id, contact_name, scheduled_at, created_at')
      .eq('agent_id', agentId)
      .gte('created_at', sinceISO)
      .order('created_at', { ascending: false })
      .limit(caps.appts),
    opts.includeCivic
      ? supabase.from('civic_reports')
          .select('id, folio, category, created_at')
          .eq('agent_id', agentId)
          .gte('created_at', sinceISO)
          .order('created_at', { ascending: false })
          .limit(caps.civic)
      : Promise.resolve({ data: [] as any[] }),
  ]);

  return {
    calls:  (callsRes.data  ?? []) as any,
    emails: (emailsRes.data ?? []) as any,
    docs:   (docsRes.data   ?? []) as any,
    tasks:  (tasksRes.data  ?? []) as any,
    appts:  (apptsRes.data  ?? []) as any,
    civic:  (civicRes.data  ?? []) as any,
  };
}

// Helper to render window as prompt-friendly Spanish blocks, skipping empty sections
export function renderActivityBlocks(w: ActivityWindow, tz: string): string {
  const fmt = (iso: string) => new Date(iso).toLocaleString('es-MX', { timeZone: tz, month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true });
  const blocks: string[] = [];

  if (w.calls.length) {
    blocks.push(`LLAMADAS (${w.calls.length}):\n${w.calls.map(c => `- [${fmt(c.created_at)}] ${c.caller_name ?? 'Llamante'} — ${c.outcome ?? '?'}: ${c.summary?.slice(0, 200) ?? 'sin resumen'}`).join('\n')}`);
  }
  if (w.emails.length) {
    blocks.push(`CORREOS (${w.emails.length}):\n${w.emails.map(e => `- [${fmt(e.created_at)}] ${e.email_from ?? 'remitente'} — ${e.email_subject?.slice(0, 100) ?? '(sin asunto)'} [${e.status ?? '?'}]`).join('\n')}`);
  }
  if (w.docs.length) {
    blocks.push(`DOCUMENTOS (${w.docs.length}):\n${w.docs.map(d => `- [${fmt(d.created_at)}] ${d.type ?? 'doc'}: ${d.title ?? 'sin título'}`).join('\n')}`);
  }
  if (w.tasks.length) {
    blocks.push(`TAREAS COMPLETADAS (${w.tasks.length}):\n${w.tasks.map(t => `- [${fmt(t.created_at)}] ${t.title ?? 'tarea'} → ${t.outcome?.slice(0, 100) ?? '?'}`).join('\n')}`);
  }
  if (w.appts.length) {
    blocks.push(`CITAS (${w.appts.length}):\n${w.appts.map(a => `- [${fmt(a.created_at)}] ${a.contact_name ?? 'contacto'} — programada ${a.scheduled_at ? fmt(a.scheduled_at) : 'sin fecha'}`).join('\n')}`);
  }
  if (w.civic.length) {
    blocks.push(`FOLIOS (${w.civic.length}):\n${w.civic.map(c => `- [${fmt(c.created_at)}] ${c.folio ?? 'sin folio'} — ${c.category ?? 'sin categoría'}`).join('\n')}`);
  }

  return blocks.length ? blocks.join('\n\n') : 'Sin actividad registrada en este período.';
}
```

Reason for the em dash: the strings above contain `—` inside the prompt content sent to the LLM (internal, not user-visible copy). The Global Constraint applies to user-visible copy only. Emails/UI/error messages: no em dashes. Prompt-internal formatting: em dash OK because it's just token separator for the model.

Actually — since the plan explicitly forbids em dashes in all copy, and the prompt output could get echoed back verbatim in the LLM-generated email body, use `:` or bullet notation instead. Fix in the code above: replace all inline `— ` with `: ` in the prompt formatting.

- [ ] **Step 2: TypeScript check**

```bash
npx tsc --noEmit 2>&1 | tail -20
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/lib/ai/activity-window.ts
git commit -m "feat(ai): add getAgentActivityWindow helper for multi-source cron activity"
```

---

## Task 2 — Expand heartbeat cron

**Files:**
- Modify: `src/app/api/cron/heartbeat/route.ts`

**Interfaces:**
- Consumes: `getAgentActivityWindow`, `renderActivityBlocks` (Task 1)
- Produces: heartbeat emails with multi-source content + task optional

- [ ] **Step 1: Change cron to use activity helper**

Replace the "Fetch recent calls for context" block (current lines 71-85, which does a single `voice_calls` query) with:

```typescript
import { getAgentActivityWindow, renderActivityBlocks, type ActivityCaps } from '@/lib/ai/activity-window';

const HEARTBEAT_CAPS: ActivityCaps = { calls: 20, emails: 20, docs: 20, tasks: 20, appts: 20, civic: 20 };

// ... inside the loop, after `if (!opsResult.ok) { ... }`:
const windowMs  = cfg.frequency === 'weekly' ? 7 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
const windowISO = new Date(now.getTime() - windowMs).toISOString();

const isGobierno = (agent as any).features?.vertical === 'gobierno';
const activity = await getAgentActivityWindow(agent.id, windowISO, HEARTBEAT_CAPS, { includeCivic: isGobierno });
const activityBlocks = renderActivityBlocks(activity, agent.timezone ?? 'America/Monterrey');
```

Extend the `.select(...)` on `voice_agents` to include `features` (already there per Deploy 1 fix, verify).

- [ ] **Step 2: New prompt structure with optional task**

Replace the `prompt` const with:

```typescript
const periodLabel = cfg.frequency === 'weekly' ? 'los últimos 7 días' : 'hoy';
const taskLine = cfg.task?.trim()
  ? `TAREA DE CHECK-IN:\n${cfg.task.trim()}`
  : `TAREA DE CHECK-IN:\nResume la actividad y flagea lo más importante en no más de 3 puntos accionables.`;

const prompt = `Eres ${agent.agent_name ?? agent.business_name}, empleado digital de ${agent.business_name}.

${taskLine}

ACTIVIDAD DE ${periodLabel.toUpperCase()}:

${activityBlocks}

Ejecuta la tarea usando toda la información como base. Sé conciso, directo y enfocado en resultados de negocio (leads, citas, ventas, escalaciones). Máximo 400 palabras.`;
```

- [ ] **Step 3: Bump `max_tokens`**

Change `max_tokens: 600` → `max_tokens: 800` in the `anthropic.messages.create` call to accommodate the richer output.

- [ ] **Step 4: Update the task-optional gate**

Line 42 currently: `if (!cfg?.enabled || !cfg.task?.trim()) continue;`
Change to: `if (!cfg?.enabled) continue;` (task optional now — the prompt handles the empty case).

- [ ] **Step 5: TypeScript check**

```bash
npx tsc --noEmit 2>&1 | grep -i "heartbeat\|error"
```

- [ ] **Step 6: Commit**

```bash
git add src/app/api/cron/heartbeat/route.ts
git commit -m "feat(cron): heartbeat pulls all activity sources; task is now optional"
```

---

## Task 3 — Expand weekly-insights

**Files:**
- Modify: `src/lib/ai/insights-engine.ts`

**Interfaces:**
- Consumes: `getAgentActivityWindow`, `renderActivityBlocks`, `agent_learnings` table
- Produces: LLM insights based on all sources + learnings

- [ ] **Step 1: Read the current `generateLLMInsights`**

```bash
head -80 src/lib/ai/insights-engine.ts
```

Identify where the prompt is built and what data it receives. The current signature is:

```typescript
generateLLMInsights({ agentId, agentName, agentRole, calls, prevWeekCalls })
```

- [ ] **Step 2: Add source-aware context to the prompt**

Inside `generateLLMInsights`, after loading calls (existing behavior) but before building the prompt:

```typescript
import { getAgentActivityWindow, renderActivityBlocks, type ActivityCaps } from './activity-window';

const WEEKLY_CAPS: ActivityCaps = { calls: 30, emails: 30, docs: 30, tasks: 30, appts: 30, civic: 30 };

const weekAgoISO     = new Date(Date.now() - 7  * 24 * 60 * 60 * 1000).toISOString();
const twoWeeksAgoISO = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();

// Fetch activity for this week + prev week + recent learnings
const [thisWeek, prevWeek, learningsRes] = await Promise.all([
  getAgentActivityWindow(agentId, weekAgoISO, WEEKLY_CAPS, { includeCivic: false /* TODO: pass vertical */ }),
  getAgentActivityWindow(agentId, twoWeeksAgoISO, WEEKLY_CAPS, { includeCivic: false }),
  supabase.from('agent_learnings')
    .select('content, source, confidence, status, created_at')
    .eq('agent_id', agentId)
    .gte('created_at', weekAgoISO)
    .order('created_at', { ascending: false })
    .limit(15),
]);

// Filter prevWeek to strictly < weekAgoISO by created_at (Promise result includes overlap)
// Actually getAgentActivityWindow uses gte, so prevWeek includes this week too.
// Refactor: pass window bounds. For simplicity here, filter in memory:
function excludeAfter(items: any[], iso: string) {
  return items.filter(x => x.created_at < iso);
}
const prevWeekFiltered = {
  calls: excludeAfter(prevWeek.calls, weekAgoISO),
  emails: excludeAfter(prevWeek.emails, weekAgoISO),
  // ... same for other 4 sources
};

const learningsBlock = (learningsRes.data ?? []).length
  ? `REGLAS APRENDIDAS RECIENTEMENTE:\n${(learningsRes.data ?? []).map(l => `- [${l.source}, conf ${l.confidence}, ${l.status}]: ${l.content}`).join('\n')}`
  : '';
```

- [ ] **Step 3: Rewrite the LLM prompt for multi-source comparison**

The existing prompt likely compares calls-only. Extend to:

```typescript
const prompt = `Eres el analista de negocio de ${agentName}${agentRole ? ` (rol: ${agentRole})` : ''}.

TU TAREA: Analiza la actividad de la última semana comparada con la anterior, y genera 2 a 4 recomendaciones accionables para mejorar el negocio.

SEMANA ACTUAL:
${renderActivityBlocks(thisWeek, 'America/Monterrey')}

SEMANA ANTERIOR:
${renderActivityBlocks(prevWeekFiltered as any, 'America/Monterrey')}

${learningsBlock}

Cada recomendación debe:
- Ser específica y accionable (no genérica)
- Referenciar datos concretos ("X% más leads", "3 correos escalados", etc.)
- Priorizar impacto en negocio (leads, citas, ventas, retención)

Responde ÚNICAMENTE con JSON válido:
{
  "recs": [
    { "title": "...", "body": "...", "metric_key": "leads|calls|emails|docs|tasks|appts|null", "current_value": null | number, "priority": "high|medium|low" }
  ]
}`;
```

Preserve the existing `InsightRec` shape (title, body, metric_key, current_value, priority) so consumers don't break.

- [ ] **Step 4: Handle empty activity gracefully**

If both `thisWeek` and `prevWeekFiltered` are completely empty, skip the LLM call and return `[]` early (avoids spending 3 ops for no data).

- [ ] **Step 5: TypeScript check + smoke**

```bash
npx tsc --noEmit 2>&1 | grep -i "insights\|error"
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/ai/insights-engine.ts
git commit -m "feat(insights): weekly-insights uses all activity sources + agent_learnings"
```

---

## Task 4 — Update UI copy for expanded scope

**Files:**
- Modify: `src/app/portal/[token]/configurar/AutomationsSection.tsx`

**Interfaces:**
- Consumes: existing META object
- Produces: updated card copy

- [ ] **Step 1: Update META**

Find the `META` const in `AutomationsSection.tsx`. Change:

```typescript
heartbeat: {
  title: 'Reporte diario de actividad',
  desc:  'Cada mañana tu empleado te manda un email con lo que hizo el día anterior: llamadas, correos, documentos, tareas y citas.',
  Icon:  Bell,
},
weekly_insights: {
  title: 'Recomendaciones semanales',
  desc:  'Cada lunes recibes 2 a 4 recomendaciones basadas en toda la actividad de tu empleado la semana pasada.',
  Icon:  Lightbulb,
},
learn: { /* unchanged */ },
```

Verify: no em dash, no "IA" in strings.

- [ ] **Step 2: Commit**

```bash
git add src/app/portal/[token]/configurar/AutomationsSection.tsx
git commit -m "docs(portal): update Automatizaciones copy to reflect expanded scope"
```

---

## Task 5 — Refine ESTIMATED_TAREAS_MO after 1 real cron run

**Files:**
- Modify: `src/app/api/portal/[token]/agentes/[agentId]/automations/route.ts`

**Interfaces:**
- Consumes: measured token counts from live cron runs post-deploy
- Produces: honest cost ranges in UI

- [ ] **Step 1: After deploying Tasks 1-4, wait 1 cron cycle**

Once heartbeat has run at least once for the demo agent post-Deploy 2, query:

```sql
SELECT source, agent_id, DATE_TRUNC('day', created_at) AS day, SUM(ops_used) AS ops
FROM ops_log
WHERE source IN ('cron_heartbeat', 'cron_weekly_insights')
  AND created_at >= NOW() - INTERVAL '2 days'
GROUP BY source, agent_id, day
ORDER BY source, day DESC;
```

- [ ] **Step 2: Update the constants**

Based on measured ops/run, extrapolate:
- Heartbeat: ops/run × 30 = mo range (add ±30% margin)
- Weekly: ops/run × 4 = mo range

Update `ESTIMATED_TAREAS_MO` at the top of `automations/route.ts`. Suggested initial values pending measurement:

```typescript
const ESTIMATED_TAREAS_MO: Record<AutomationName, string> = {
  heartbeat:       'aprox. 300-500 tareas/mes',
  weekly_insights: 'aprox. 100-200 tareas/mes',
  learn:           'aprox. 200-400 tareas/mes', // unchanged from Deploy 1
};
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/portal/[token]/agentes/[agentId]/automations/route.ts
git commit -m "docs(automations): refine cost estimates for Deploy 2 expanded scope"
```

---

## Task 6 — Full E2E + deploy

**Files:**
- Modify: `docs/superpowers/specs/2026-07-30-opt-in-automations-deploy2-expand-sources.md` (mark live)

- [ ] **Step 1: TypeScript check across all changes**

```bash
npx tsc --noEmit 2>&1 | tail -20
```

- [ ] **Step 2: Push + verify Vercel build**

```bash
git push origin main
```

Wait for build Ready.

- [ ] **Step 3: Prod smoke — trigger heartbeat manually**

```bash
curl -H "Authorization: Bearer $CRON_SECRET" https://www.centinelia.mx/api/cron/heartbeat
```

Expected: `{ok: true, ran: N}` where N is the number of agents that ran. Check the email inbox of the demo agent's `client_email`; verify email body mentions activity from multiple sources (not just calls).

- [ ] **Step 4: Prod smoke — trigger weekly-insights**

```bash
curl -H "Authorization: Bearer $CRON_SECRET" https://www.centinelia.mx/api/cron/weekly-insights
```

Expected: `{ok: true, totalRecs: N}` where N > 0 if any agent has opted-in AND has activity. Check `agent_recommendations` table for the new rows; verify at least one references non-call activity (docs, tasks, emails).

- [ ] **Step 5: Mark spec as live**

```bash
sed -i 's/^\*\*Estado:\*\* Draft.*/\*\*Estado:\*\* Deploy 2 live 2026-XX-XX./' docs/superpowers/specs/2026-07-30-opt-in-automations-deploy2-expand-sources.md
git add docs/superpowers/specs/2026-07-30-opt-in-automations-deploy2-expand-sources.md
git commit -m "docs(spec): mark Deploy 2 as live"
git push
```

- [ ] **Step 6: Update memory**

Note in `decisions_centinelia_session43.md`: Deploy 2 live, new cost ranges, task-optional heartbeat resolved Sofia gap.

---

## Out of scope

- **Deploy 3** (`learn` expansion to include calls + docs + tasks): separate plan.
- New tables or schema changes: none needed for Deploy 2.
- Dashboard for historical cost per feature: nice-to-have.

## Self-review

**Spec coverage:** ✅ D1 sin cambio. D2/D3 fuentes correctas (email via ops_inbox, no email_messages). D4 bloques por fuente. D5 caps 20/30. D6 task opcional. D7 anticipa aumento de costo. D8 backward compat. D9 copy updates.

**Placeholder scan:** Task 5 tiene "TBD" en el sentido de "pending 1 cron cycle post-deploy to measure". Es intencional, mismo patrón que Deploy 1 Task 0.

**Type consistency:** `ActivityWindow`, `ActivityCaps`, `ActivityOpts` declarados en Task 1, consumidos idénticamente en Tasks 2 + 3.

**Scope check:** Deploy 2 es una entrega cohesiva (expansión de scope de 2 crons + UI copy + estimados). Deploy 3 (`learn`) es un plan separado.
