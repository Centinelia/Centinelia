# Opt-in Automations — Deploy 3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development.

**Goal:** Expand `learn` cron to extract learnings from calls + docs + tasks in addition to emails. Keep email as prerequisite (backward compat: users who opted in keep their setup unchanged). Reuse the `getAgentActivityWindow` helper from Deploy 2.

**Architecture:** Learn iterates opted-in agents with email connected (unchanged gate). For each agent, in parallel: fetch emails (existing) + fetch other 5 sources via activity helper. Build a single multi-source prompt that asks the LLM to extract learnings from ANY source. Save each learning with its correct `source` label ('email' | 'call' | 'document' | 'task').

**Tech Stack:** Next.js 16, Supabase, Anthropic SDK (Haiku), existing `saveLearnings` helper.

## Global Constraints

- Backward compat: an agent opted-in to `learn` with only emails connected keeps working; the cron just adds sources when available.
- `LearningSource` type extended to include 'document' | 'task' (in addition to existing 'call' | 'email' | 'chat').
- Rate-limit and ops accounting unchanged.
- Copy: Spanish MX. No em dashes. No "IA" in visible copy.
- Learn frequency unchanged (biweekly `0 9 8,22 * *`).
- Learn STILL requires email integration as opt-in prerequisite — spec D5 dependency preserved.
- Features JSONB MERGE-write pattern (Deploy 1 race-fix) preserved — no changes needed to features writes here.

## File Structure

**Modified files:**
- `src/lib/ai/save-learning.ts` — extend `LearningSource` type
- `src/app/api/cron/learn/route.ts` — multi-source extraction; prompt rewrite
- `src/app/portal/[token]/configurar/AutomationsSection.tsx` — learn card copy update
- `src/app/api/portal/[token]/agentes/[agentId]/automations/route.ts` — refine `ESTIMATED_TAREAS_MO.learn`
- `docs/superpowers/specs/2026-07-29-opt-in-automations-design.md` — note Deploy 3 live

**No SQL migrations required.** `agent_learnings.source` is a text column; existing rows with 'email' or 'call' stay valid.

---

## Task 1 — Extend LearningSource type

**Files:**
- Modify: `src/lib/ai/save-learning.ts`

**Interface:**
- Consumes: existing usage
- Produces: type accepts 'document' | 'task'

- [ ] **Step 1: Change the type union**

Line 5 currently: `export type LearningSource = 'call' | 'email' | 'chat';`

Change to: `export type LearningSource = 'call' | 'email' | 'chat' | 'document' | 'task';`

- [ ] **Step 2: tsc**

```bash
npx tsc --noEmit 2>&1 | tail -10
```

Expected: clean. No existing consumers pass 'document' or 'task' yet, so no breakage.

---

## Task 2 — Rewrite learn cron for multi-source extraction

**Files:**
- Modify: `src/app/api/cron/learn/route.ts`

**Interface:**
- Consumes: `getAgentActivityWindow`, `renderActivityBlocks` (Deploy 2), `saveLearnings` (existing), `fetchRecentGmail`/`fetchRecentOutlook` (existing)
- Produces: multi-source learnings

- [ ] **Step 1: Add imports**

```typescript
import { getAgentActivityWindow, renderActivityBlocks, type ActivityCaps } from '@/lib/ai/activity-window';
```

- [ ] **Step 2: Add constants**

Near top (below existing constants/imports):

```typescript
const LEARN_CAPS: ActivityCaps = { calls: 30, emails: 0, docs: 30, tasks: 30, appts: 0, civic: 0 };
```

(`emails: 0` because emails come from Gmail/Outlook API, not `ops_inbox`. `appts: 0` and `civic: 0` because those aren't learning-relevant.)

- [ ] **Step 3: Update `extractLearnings` signature to accept multi-source input**

The current function only accepts `emails`. Refactor to accept a bundle:

```typescript
interface ExtractionSource {
  emails:    Array<{ from: string; subject: string; snippet: string }>;
  activity:  { calls: Array<any>; docs: Array<any>; tasks: Array<any> };
}

interface ExtractedWithSource {
  content:    string;
  confidence: number;
  source:     'email' | 'call' | 'document' | 'task';
}

async function extractLearnings(opts: {
  businessName: string;
  role:         string;
  roleKb:       string;
  timezone:     string;
  sources:      ExtractionSource;
}): Promise<ExtractedWithSource[]> {
  // build blocks per source, similar to renderActivityBlocks
  const { businessName, role, roleKb, timezone, sources } = opts;
  const { emails, activity } = sources;

  const totalItems = emails.length + activity.calls.length + activity.docs.length + activity.tasks.length;
  if (totalItems === 0) return [];

  // Format email block (existing pattern)
  const emailLines = emails.slice(0, 60).map((e, i) =>
    `${i + 1}. Asunto: "${e.subject.slice(0, 100)}" | Preview: "${e.snippet.slice(0, 150)}"`,
  ).join('\n');

  // Reuse renderActivityBlocks for calls/docs/tasks (empty sections auto-skipped)
  const activityBlocks = renderActivityBlocks(
    { calls: activity.calls, emails: [], docs: activity.docs, tasks: activity.tasks, appts: [], civic: [] } as any,
    timezone,
  );

  const prompt = `Eres un extractor de conocimiento de negocios. Tu tarea es identificar reglas de decision implicitas relevantes para un rol especifico, a partir de la actividad reciente del empleado (correos + llamadas + documentos + tareas).

NEGOCIO: ${businessName}
ROL DEL EMPLEADO: ${role || 'Asistente general'}
${roleKb ? `\nCONTEXTO DEL ROL:\n${roleKb.slice(0, 600)}\n` : ''}

${emailLines ? `CORREOS RECIENTES (${emails.length}):\n${emailLines}\n\n` : ''}${activityBlocks !== 'Sin actividad registrada en este período.' ? `OTRAS FUENTES DE ACTIVIDAD:\n${activityBlocks}\n` : ''}

INSTRUCCIONES:
1. Identifica que items son RELEVANTES para el rol; ignora los que no tengan relacion directa.
2. Extrae reglas de decision que el empleado deberia conocer: como se toman decisiones, que se aprueba, que se escala, que politicas informales existen.
3. Asigna una confianza del 0 al 1 por cada regla: 1.0 = evidente en multiples items, 0.5 = inferencia razonable.
4. Marca la FUENTE de cada regla con uno de: "email", "call", "document", "task", segun el tipo de item que la evidencia.

RESTRICCIONES:
- NO incluyas nombres de personas ni datos de clientes identificables.
- Solo patrones generales, no casos unicos.
- Solo evidencia clara.

Responde UNICAMENTE con JSON valido:
{
  "learnings": [
    { "content": "Regla concreta y accionable", "confidence": 0.90, "source": "email" },
    { "content": "Otra regla", "confidence": 0.65, "source": "call" }
  ]
}

Maximo 8 aprendizajes. Si no hay evidencia suficiente, responde con learnings vacio.`;

  const response = await anthropic.messages.create({
    model:      'claude-haiku-4-5-20251001',
    max_tokens: 1000,
    messages:   [{ role: 'user', content: prompt }],
  });

  const raw   = response.content[0].type === 'text' ? response.content[0].text.trim() : '';
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return [];

  let parsed: { learnings?: unknown[] };
  try { parsed = JSON.parse(match[0]); } catch { return []; }

  const validSources = new Set(['email', 'call', 'document', 'task']);
  return (parsed.learnings ?? [])
    .filter((l): l is ExtractedWithSource =>
      typeof (l as any)?.content === 'string' &&
      (l as any).content.trim().length > 10 &&
      typeof (l as any)?.confidence === 'number' &&
      validSources.has((l as any)?.source),
    )
    .map(l => ({
      content:    l.content.trim().slice(0, 500),
      confidence: Math.min(1, Math.max(0, l.confidence)),
      source:     l.source,
    }))
    .slice(0, 8);
}
```

**No em dashes in the prompt.** Use commas or colons. The `renderActivityBlocks` output already avoids em dashes (Deploy 2 fix).

- [ ] **Step 4: Update the loop to fetch all sources + pass to extractor**

Inside the `for (const integration of filtered)` loop, replace the current single-source extract:

```typescript
// After ops guard passes:
const [emails, activity] = await Promise.all([
  (integration as any).provider === 'gmail'
    ? fetchRecentGmail(accessToken, since)
    : fetchRecentOutlook(accessToken, since),
  getAgentActivityWindow(agent.id, since.toISOString(), LEARN_CAPS, { includeCivic: false }),
]);

const extracted = await extractLearnings({
  businessName: agent.business_name,
  role:         agent.role ?? '',
  roleKb:       agent.role_knowledge_base ?? '',
  timezone:     (agent as any).timezone ?? 'America/Monterrey',
  sources:      {
    emails,
    activity: { calls: activity.calls, docs: activity.docs, tasks: activity.tasks },
  },
});

if (!extracted.length) continue;

const saved = await saveLearnings(
  extracted.map(e => ({
    agentId:     agent.id,
    portalEmail: agent.portal_email,
    content:     e.content,
    confidence:  e.confidence,
    source:      e.source, // LLM-tagged, no longer hardcoded 'email'
  })),
);
```

Add `timezone` to the joined `voice_agents!agent_id!inner (...)` select so `agent.timezone` is available. Add `timezone` to the type cast.

- [ ] **Step 5: Bump ops cost + max_tokens**

The cron currently consumes 30 ops per agent (`consumeAiOp(agent.id, 30)`). With expanded scope, expect ~40-50 ops per run. Change to 40.

- [ ] **Step 6: tsc**

```bash
npx tsc --noEmit 2>&1 | grep -i 'learn\|error' | head -10
```

---

## Task 3 — Update UI copy for learn

**Files:**
- Modify: `src/app/portal/[token]/configurar/AutomationsSection.tsx`

**Interface:**
- Consumes: existing META
- Produces: updated learn card copy

- [ ] **Step 1: Update learn desc**

Change the `learn` entry in `META`:

```typescript
learn: {
  title: 'Aprendizaje quincenal',
  desc:  'Cada 15 días tu empleado aprende reglas de tu negocio observando correos, llamadas, documentos y tareas de las últimas 2 semanas.',
  Icon:  Brain,
},
```

Verify: no em dashes, no "IA".

- [ ] **Step 2: tsc + commit ready**

---

## Task 4 — Refine cost estimates for learn

**Files:**
- Modify: `src/app/api/portal/[token]/agentes/[agentId]/automations/route.ts`

- [ ] **Step 1: Bump learn range**

Current after Deploy 2: `learn: 'aprox. 200-400 tareas/mes'`. With Deploy 3 expansion (~40 ops/run × 2 runs/mo = 80 ops/mo minimum, potentially higher with richer context):

Change to: `learn: 'aprox. 300-600 tareas/mes'`.

Update the comment block to note Deploy 3 expansion.

---

## Task 5 — Full E2E + deploy + memory

- [ ] **Step 1: tsc across all changes**

```bash
npx tsc --noEmit 2>&1 | tail -10
```

- [ ] **Step 2: Push**

```bash
git push origin main
```

Wait Vercel Ready.

- [ ] **Step 3: Prod smoke — trigger learn**

```bash
curl -H "Authorization: Bearer $CRON_SECRET" https://www.centinelia.mx/api/cron/learn
```

Expected: `{ok:true, processed:N, saved:M}` with N ≥ 0. If M > 0, check `agent_learnings` for rows with source values in ('email', 'call', 'document', 'task'). At least ONE should be non-'email' if the agent has activity in those sources.

- [ ] **Step 4: Mark spec live**

Update `docs/superpowers/specs/2026-07-29-opt-in-automations-design.md` Estado line to add "Deploy 3 live YYYY-MM-DD".

- [ ] **Step 5: Update memory**

Add session 44 memory entry noting Deploy 3 live, LearningSource extended, learn now multi-source.

---

## Out of scope

- Making email integration OPTIONAL for learn (Deploy 4+; would require reworking the opt-in dependency logic in the API endpoint).
- Enabling learn based on non-email activity alone.
- Dashboard for learning source distribution.
- Retroactive backfill of source tags on existing learnings (data migration out of scope).

## Self-review

**Spec coverage:** Deploy 3 goal met — `learn` processes correos + calls + docs + tasks. Confidence tagging + source labeling in output enables downstream analytics.

**Placeholder scan:** No TBD placeholders. Cost estimate is heuristic pending post-launch measurement (same pattern as Deploys 1-2).

**Type consistency:** `LearningSource` union extended in one place, consumed by `saveLearnings` unchanged. The extractor tags each learning with its source, matching the new union values.

**Scope check:** Focused on `learn` cron only. Heartbeat, weekly-insights, UI structure, other automations untouched.
