// Frecuencia recomendada: "0 9 * * 1" (lunes a las 9:00 AM UTC)
// Agregar a vercel.json cuando se active en producción (fuera del límite de Vercel Hobby).
//
// Procesa aprendizaje continuo para todos los agentes con correo conectado:
// - Correos de los últimos 7 días (ventana móvil, no acumulativa)
// - Confianza alta (≥0.85) → auto-aprobado y sincronizado a Vapi
// - Confianza baja → queda en "pendiente" para revisión del dueño

export const maxDuration = 300;

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { refreshIfNeeded } from '@/lib/connectors';
import type { IntegrationRow } from '@/lib/connectors';
import { fetchRecentGmail, fetchRecentOutlook } from '@/lib/email/fetch-recent';
import { saveLearnings } from '@/lib/ai/save-learning';
import { consumeAiOp } from '@/lib/ai/ops-guard';
import { maybeSendQuotaEmail } from '@/lib/ai/quota-email';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic();

interface ExtractedLearning {
  content:    string;
  confidence: number;
}

async function extractLearnings(opts: {
  businessName: string;
  role:         string;
  roleKb:       string;
  emails:       Array<{ from: string; subject: string; snippet: string }>;
}): Promise<ExtractedLearning[]> {
  const { businessName, role, roleKb, emails } = opts;
  if (!emails.length) return [];

  const emailLines = emails.slice(0, 60).map((e, i) =>
    `${i + 1}. Asunto: "${e.subject.slice(0, 100)}" | Preview: "${e.snippet.slice(0, 150)}"`,
  ).join('\n');

  const prompt = `Eres un extractor de conocimiento de negocios. Tu tarea es identificar reglas de decisión implícitas relevantes para un rol específico, a partir de correos de un negocio.

NEGOCIO: ${businessName}
ROL DEL EMPLEADO: ${role || 'Asistente general'}
${roleKb ? `\nCONTEXTO DEL ROL:\n${roleKb.slice(0, 600)}` : ''}

CORREOS RECIENTES (${emails.length} correos, últimos 7 días):
${emailLines}

INSTRUCCIONES:
1. Identifica cuáles correos son RELEVANTES para el rol (ignora los que no tienen relación directa)
2. De los relevantes, extrae reglas de decisión que el empleado debería conocer: cómo se toman decisiones, qué se aprueba, qué se escala, qué políticas informales existen
3. Asigna una confianza del 0 al 1 por cada regla: 1.0 = evidente en múltiples correos, 0.5 = inferencia razonable

RESTRICCIONES:
- NO incluyas nombres de personas ni datos de clientes identificables
- Solo incluye patrones generales, no casos únicos
- Solo incluye lo que tenga evidencia clara

Responde ÚNICAMENTE con JSON válido:
{
  "learnings": [
    { "content": "Regla concreta y accionable", "confidence": 0.90 },
    { "content": "Otra regla", "confidence": 0.65 }
  ]
}

Máximo 6 aprendizajes. Si no hay evidencia suficiente, responde con learnings vacío.`;

  const response = await anthropic.messages.create({
    model:      'claude-haiku-4-5-20251001',
    max_tokens: 800,
    messages: [{ role: 'user', content: prompt }],
  });

  const raw   = response.content[0].type === 'text' ? response.content[0].text.trim() : '';
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return [];

  let parsed: { learnings?: unknown[] };
  try { parsed = JSON.parse(match[0]); } catch { return []; }

  return (parsed.learnings ?? [])
    .filter((l): l is ExtractedLearning =>
      typeof (l as any)?.content === 'string' &&
      (l as any).content.trim().length > 10 &&
      typeof (l as any)?.confidence === 'number',
    )
    .map(l => ({
      content:    l.content.trim().slice(0, 500),
      confidence: Math.min(1, Math.max(0, l.confidence)),
    }))
    .slice(0, 6);
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
        client_email, ai_ops_used, ai_ops_limit, minutes_reset_date, portal_token, features
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

  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // last 7 days
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
    } | null;

    if (!agent?.active || !agent.portal_email) continue;

    try {
      const ops = await consumeAiOp(agent.id, 30); // learn is heavy; refine post-launch with prod data
      if (!ops.ok) {
        await maybeSendQuotaEmail(agent, 'learn');
        continue;
      }

      const accessToken = await refreshIfNeeded(integration as unknown as IntegrationRow, supabase);

      const emails = (integration as any).provider === 'gmail'
        ? await fetchRecentGmail(accessToken, since)
        : await fetchRecentOutlook(accessToken, since);

      if (!emails.length) continue;

      const extracted = await extractLearnings({
        businessName: agent.business_name,
        role:         agent.role ?? '',
        roleKb:       agent.role_knowledge_base ?? '',
        emails,
      });

      if (!extracted.length) continue;

      const saved = await saveLearnings(
        extracted.map(e => ({
          agentId:     agent.id,
          portalEmail: agent.portal_email,
          content:     e.content,
          confidence:  e.confidence,
          source:      'email' as const,
        })),
      );

      totalSaved += saved;
      processed++;

      await supabase
        .from('voice_agents')
        .update({
          features: {
            ...((agent as any).features ?? {}),
            automations: {
              ...((agent as any).features?.automations ?? {}),
              learn: {
                ...((agent as any).features?.automations?.learn ?? {}),
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
