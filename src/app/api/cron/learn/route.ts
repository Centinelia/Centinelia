// Frecuencia: biweekly. vercel.json schedule "0 9 8,22 * *" (día 8 y 22 a las 9:00 UTC).
//
// Procesa aprendizaje continuo para todos los agentes con correo conectado y opt-in activo:
// - Ventana móvil de 14 días para alinear con la cadencia biweekly (evita gaps).
// - Fuentes: correos (Gmail/Outlook API) + llamadas + documentos + tareas (Supabase).
// - Confianza alta (>=0.85) auto-aprobada y sincronizada a Vapi.
// - Confianza baja queda en "pendiente" para revisión del dueño.

export const maxDuration = 300;

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifyCronAuth } from '@/lib/auth/cron-auth';
import { refreshIfNeeded } from '@/lib/connectors';
import type { IntegrationRow } from '@/lib/connectors';
import { fetchRecentGmail, fetchRecentOutlook } from '@/lib/email/fetch-recent';
import { saveLearnings } from '@/lib/ai/save-learning';
import { consumeAiOp } from '@/lib/ai/ops-guard';
import { maybeSendQuotaEmail } from '@/lib/ai/quota-email';
import { getAgentActivityWindow, renderActivityBlocks, LEARN_CAPS } from '@/lib/ai/activity-window';
import type { ActivityWindow } from '@/lib/ai/activity-window';
import Anthropic from '@anthropic-ai/sdk';
import { logLlmCall } from '@/lib/observability/llm-log';

const anthropic = new Anthropic();

interface ExtractionSource {
  emails:   Array<{ from: string; subject: string; snippet: string }>;
  activity: Pick<ActivityWindow, 'calls' | 'docs' | 'tasks'>;
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
  const { businessName, role, roleKb, timezone, sources } = opts;
  const { emails, activity } = sources;

  const totalItems = emails.length + activity.calls.length + activity.docs.length + activity.tasks.length;
  if (totalItems === 0) return [];

  // Format email block
  const emailLines = emails.slice(0, 60).map((e, i) =>
    `${i + 1}. Asunto: "${e.subject.slice(0, 100)}" | Preview: "${e.snippet.slice(0, 150)}"`,
  ).join('\n');

  // Reuse renderActivityBlocks for calls/docs/tasks (empty sections auto-skipped)
  const activityBlocks = renderActivityBlocks(
    { calls: activity.calls, emails: [] as ActivityWindow['emails'], docs: activity.docs, tasks: activity.tasks, appts: [] as ActivityWindow['appts'], civic: [] as ActivityWindow['civic'] },
    timezone,
  );

  const prompt = `Eres un extractor de conocimiento de negocios. Tu tarea es identificar reglas de decisión implícitas relevantes para un rol específico, a partir de la actividad reciente del empleado (correos + llamadas + documentos + tareas).

NEGOCIO: ${businessName}
ROL DEL EMPLEADO: ${role || 'Asistente general'}
${roleKb ? `\nCONTEXTO DEL ROL:\n${roleKb.slice(0, 600)}\n` : ''}
${emailLines ? `CORREOS RECIENTES (${emails.length}):\n${emailLines}\n\n` : ''}${activityBlocks !== 'Sin actividad registrada en este período.' ? `OTRAS FUENTES DE ACTIVIDAD:\n${activityBlocks}\n` : ''}
INSTRUCCIONES:
1. Identifica qué items son RELEVANTES para el rol; ignora los que no tengan relación directa.
2. Extrae reglas de decisión que el empleado debería conocer: cómo se toman decisiones, qué se aprueba, qué se escala, qué políticas informales existen.
3. Asigna una confianza del 0 al 1 por cada regla: 1.0 = evidente en múltiples items, 0.5 = inferencia razonable.
4. Marca la FUENTE de cada regla con uno de: "email", "call", "document", "task", según el tipo de item que la evidencia.

RESTRICCIONES:
- NO incluyas nombres de personas ni datos de clientes identificables.
- Solo patrones generales, no casos únicos.
- Solo evidencia clara.

Responde ÚNICAMENTE con JSON válido:
{
  "learnings": [
    { "content": "Regla concreta y accionable", "confidence": 0.90, "source": "email" },
    { "content": "Otra regla", "confidence": 0.65, "source": "call" }
  ]
}

Máximo 8 aprendizajes. Si no hay evidencia suficiente, responde con learnings vacío.`;

  const __t = Date.now();
  const __m = 'claude-haiku-4-5-20251001';
  let response;
  try {
    response = await anthropic.messages.create({
      model:      __m,
      max_tokens: 1000,
      messages:   [{ role: 'user', content: prompt }],
    });
    void logLlmCall({ source: 'learn_cron', model: __m, usage: response.usage, latencyMs: Date.now() - __t, meta: { businessName, role } });
  } catch (err) {
    void logLlmCall({ source: 'learn_cron', model: __m, usage: { input_tokens: 0, output_tokens: 0 }, latencyMs: Date.now() - __t, error: err instanceof Error ? err.message : String(err), meta: { businessName, role } });
    throw err;
  }

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

export async function GET(req: NextRequest) {
  if (!verifyCronAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createAdminClient();

  // Iterar por agents con learn.enabled=true directamente. Antes hacíamos
  // INNER JOIN a email_integrations, lo cual excluía silenciosamente a los
  // que tienen el correo conectado solo per-org (integration_accounts).
  // Ver commits ae177a76 y patrón synthetic org row en connector-tools.ts.
  const { data: agents } = await supabase
    .from('voice_agents')
    .select('id, agent_name, business_name, role, role_knowledge_base, portal_email, active, client_email, ai_ops_used, ai_ops_limit, minutes_reset_date, portal_token, features, timezone')
    .eq('active', true)
    .eq('features->automations->learn->>enabled', 'true');

  const filtered = (agents ?? []).filter(a =>
    (a as any).features?.automations?.learn?.enabled === true && a.portal_email
  );

  if (!filtered.length) {
    return NextResponse.json({ ok: true, processed: 0 });
  }

  const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000); // last 14 days (biweekly cadence)
  let processed = 0;
  let totalSaved = 0;
  let skippedNoEmail = 0;

  for (const agent of filtered as any[]) {
    if (!agent?.active || !agent.portal_email) continue;

    // Resolver integración: per-org primero, per-agent fallback.
    let integration: IntegrationRow | null = null;
    const { data: orgAcct } = await supabase
      .from('integration_accounts')
      .select('provider, account_label, access_token, refresh_token, expires_at, status')
      .eq('portal_email', agent.portal_email)
      .in('provider', ['gmail', 'outlook'])
      .maybeSingle();
    if (orgAcct && (orgAcct as any).status !== 'needs_reauth') {
      integration = {
        id:                 `org:${agent.portal_email}:${(orgAcct as any).provider}`,
        agent_id:           agent.id,
        provider:           (orgAcct as any).provider as 'gmail' | 'outlook',
        email:              ((orgAcct as any).account_label as string | null) ?? '',
        access_token:       ((orgAcct as any).access_token as string | null) ?? '',
        refresh_token:      ((orgAcct as any).refresh_token as string | null) ?? null,
        token_expires_at:   ((orgAcct as any).expires_at as string | null) ?? null,
        last_sync_at:       null,
        needs_reauth:       false,
        reauth_notified_at: null,
      };
    }
    if (!integration) {
      const { data: perAgent } = await supabase
        .from('email_integrations')
        .select('*')
        .eq('agent_id', agent.id)
        .eq('needs_reauth', false)
        .maybeSingle();
      if (perAgent) integration = perAgent as IntegrationRow;
    }
    if (!integration) { skippedNoEmail++; continue; }

    try {
      const accessToken = await refreshIfNeeded(integration, supabase);
      const agentTimezone = agent.timezone ?? 'America/Monterrey';

      // Fetch emails from mail API and agent activity from Supabase in parallel
      const [emails, activity] = await Promise.all([
        (integration as any).provider === 'gmail'
          ? fetchRecentGmail(accessToken, since)
          : fetchRecentOutlook(accessToken, since),
        getAgentActivityWindow(agent.id, since.toISOString(), LEARN_CAPS, { includeCivic: false }),
      ]);

      // Probe primero: si NO hay data nueva desde la última corrida, no
      // llamar al LLM ni cobrar 40 ops. Fix 2026-08-10.
      const totalSources = emails.length + activity.calls.length + activity.docs.length + activity.tasks.length;
      if (totalSources === 0) continue;

      const ops = await consumeAiOp(agent.id, 40, { source: 'learn', label: 'Aprendizaje continuo del negocio' }); // learn is heavy (multi-source)
      if (!ops.ok) {
        await maybeSendQuotaEmail(agent, 'learn');
        continue;
      }

      const extracted = await extractLearnings({
        businessName: agent.business_name,
        role:         agent.role ?? '',
        roleKb:       agent.role_knowledge_base ?? '',
        timezone:     agentTimezone,
        sources: {
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

      totalSaved += saved;
      processed++;

      // Re-SELECT fresh features to avoid clobbering concurrent PATCH toggles
      const { data: freshAgent } = await supabase
        .from('voice_agents')
        .select('features')
        .eq('id', agent.id)
        .single();
      const currentFeatures = (freshAgent?.features ?? (agent as any).features ?? {}) as Record<string, any>;
      const currentAuto     = (currentFeatures.automations ?? {}) as Record<string, any>;
      const currentEntry    = (currentAuto.learn ?? {}) as Record<string, any>;

      await supabase
        .from('voice_agents')
        .update({
          features: {
            ...currentFeatures,
            automations: {
              ...currentAuto,
              learn: {
                ...currentEntry,
                enabled: true,
                last_ran_at: new Date().toISOString(),
              },
            },
          },
        })
        .eq('id', agent.id);
    } catch (err) {
      console.error(`[cron/learn] agent ${agent.id} failed:`, err);
    }
  }

  return NextResponse.json({ ok: true, processed, saved: totalSaved, skippedNoEmail });
}
