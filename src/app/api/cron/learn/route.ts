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
import { refreshIfNeeded } from '@/lib/connectors';
import type { IntegrationRow } from '@/lib/connectors';
import { fetchRecentGmail, fetchRecentOutlook } from '@/lib/email/fetch-recent';
import { saveLearnings } from '@/lib/ai/save-learning';
import { consumeAiOp } from '@/lib/ai/ops-guard';
import { maybeSendQuotaEmail } from '@/lib/ai/quota-email';
import { getAgentActivityWindow, renderActivityBlocks, LEARN_CAPS } from '@/lib/ai/activity-window';
import type { ActivityWindow } from '@/lib/ai/activity-window';
import Anthropic from '@anthropic-ai/sdk';

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

export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = req.headers.get('authorization');
    if (auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const supabase = createAdminClient();

  // Get all active agents with a valid email integration.
  // !inner ensures PostgREST uses INNER JOIN so the .eq() on the joined column
  // filters rows at the SQL level rather than just filtering nested objects.
  const { data: integrations } = await supabase
    .from('email_integrations')
    .select(`
      agent_id,
      provider,
      access_token,
      refresh_token,
      token_expiry,
      needs_reauth,
      voice_agents!agent_id!inner (
        id, agent_name, business_name, role, role_knowledge_base, portal_email, active,
        client_email, ai_ops_used, ai_ops_limit, minutes_reset_date, portal_token, features, timezone
      )
    `)
    .eq('needs_reauth', false)
    .eq('voice_agents.features->automations->learn->>enabled', 'true');

  // Belt-and-suspenders: re-filter in memory in case the JSONB filter on the
  // joined column silently fails (PostgREST version mismatch, etc.).
  const filtered = (integrations ?? []).filter(row => {
    const agent = (row as any).voice_agents;
    return agent?.features?.automations?.learn?.enabled === true;
  });

  if (!filtered.length) {
    return NextResponse.json({ ok: true, processed: 0 });
  }

  const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000); // last 14 days (biweekly cadence)
  let processed = 0;
  let totalSaved = 0;

  for (const integration of filtered) {
    const agent = (integration as any).voice_agents as {
      id: string;
      agent_name: string | null;
      business_name: string;
      role: string | null;
      role_knowledge_base: string | null;
      portal_email: string | null;
      active: boolean;
      client_email: string | null;
      ai_ops_used: number;
      ai_ops_limit: number;
      minutes_reset_date: string | null;
      portal_token: string | null;
      features: any;
      timezone: string | null;
    } | null;

    if (!agent?.active || !agent.portal_email) continue;

    try {
      const ops = await consumeAiOp(agent.id, 40); // learn is heavy (multi-source); refine post-launch with prod data
      if (!ops.ok) {
        await maybeSendQuotaEmail(agent, 'learn');
        continue;
      }

      const accessToken = await refreshIfNeeded(integration as unknown as IntegrationRow, supabase);
      const agentTimezone = agent.timezone ?? 'America/Monterrey';

      // Fetch emails from mail API and agent activity from Supabase in parallel
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

  return NextResponse.json({ ok: true, processed, saved: totalSaved });
}
