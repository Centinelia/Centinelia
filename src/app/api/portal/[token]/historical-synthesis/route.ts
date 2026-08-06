export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';
import { consumeAiOp } from '@/lib/ai/ops-guard';
import Anthropic from '@anthropic-ai/sdk';
import { logLlmCall } from '@/lib/observability/llm-log';

const anthropic = new Anthropic();

const OUTCOME_LABELS: Record<string, string> = {
  lead_created:       'Lead',
  appointment_booked: 'Cita',
  order_taken:        'Pedido',
  transferred:        'Transferida',
  info_provided:      'Informativa',
  escalated_whatsapp: 'Escalada',
  missed:             'Perdida',
  unanswered:         'Sin respuesta',
  other:              'Completada',
};

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const cookie  = req.cookies.get(PORTAL_COOKIE)?.value ?? '';
  const session = await verifySession(cookie);
  if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const { token } = await params;
  const supabase  = createAdminClient();

  const { data: agent } = await supabase
    .from('voice_agents')
    .select('id, agent_name, business_name, role, role_knowledge_base, portal_email')
    .eq('portal_token', token)
    .single();

  if (!agent) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (session.portalEmail && agent.portal_email && session.portalEmail !== agent.portal_email)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

  // Consume 6 ops for batch analysis
  const opsResult = await consumeAiOp(agent.id, 6);
  if (!opsResult.ok) {
    return NextResponse.json({ error: 'Sin tareas disponibles para esta operación.' }, { status: 402 });
  }

  const since60 = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();

  const [callsRes, learningsRes] = await Promise.all([
    supabase
      .from('voice_calls')
      .select('outcome, summary, self_eval_score, self_eval_notes, duration_seconds')
      .eq('agent_id', agent.id)
      .gte('created_at', since60)
      .not('outcome', 'eq', 'unanswered')
      .order('created_at', { ascending: false })
      .limit(200),

    supabase
      .from('agent_learnings')
      .select('content')
      .eq('agent_id', agent.id)
      .eq('status', 'approved')
      .limit(50),
  ]);

  const calls     = callsRes.data    ?? [];
  const learnings = learningsRes.data ?? [];

  if (calls.length < 5) {
    return NextResponse.json({
      error: 'Se necesitan al menos 5 llamadas para generar un análisis significativo.',
    }, { status: 422 });
  }

  // Build call summary lines
  const callLines = calls.slice(0, 120).map(c => {
    const parts = [
      OUTCOME_LABELS[c.outcome as string] ?? c.outcome,
      c.summary ? `"${(c.summary as string).slice(0, 120)}"` : null,
      c.self_eval_score ? `Eval: ${c.self_eval_score}/5` : null,
      c.self_eval_notes ? `(${(c.self_eval_notes as string).slice(0, 80)})` : null,
    ].filter(Boolean);
    return `- ${parts.join(' · ')}`;
  }).join('\n');

  const learningLines = learnings.length > 0
    ? learnings.map(l => `- ${(l.content as string).slice(0, 150)}`).join('\n')
    : 'Ninguno aún.';

  const roleLine = [(agent.agent_name as string | null)?.trim(), (agent.role as string | null)?.trim()].filter(Boolean).join(' · ');

  const prompt = `Eres un analista de rendimiento para equipos de atención a clientes.

EMPLEADO: ${roleLine || agent.business_name}
NEGOCIO: ${agent.business_name}
PERÍODO: últimos 60 días · ${calls.length} llamadas analizadas

HISTORIAL DE LLAMADAS:
${callLines}

APRENDIZAJES YA INCORPORADOS:
${learningLines}

Analiza este historial y genera un reporte estructurado. Sé específico y accionable.

Responde ÚNICAMENTE con JSON válido en este formato exacto:
{
  "total": ${calls.length},
  "patterns": ["patrón frecuente 1 (con dato concreto si posible)", "patrón 2", "patrón 3"],
  "gaps": ["brecha 1: qué pregunta o situación genera transferencias o problemas sin resolución", "brecha 2"],
  "wins": ["qué hizo bien el empleado de forma consistente", "patrón exitoso 2"],
  "suggestions": ["Sugerencia concreta para agregar al manual: texto listo para copiar.", "Sugerencia 2.", "Sugerencia 3."]
}

Máximo: 4 items por sección. Las sugerencias deben ser texto listo para pegar en el manual del empleado, no instrucciones para el dueño.`;

  const __t = Date.now();
  const __m = 'claude-haiku-4-5-20251001';
  let response;
  try {
    response = await anthropic.messages.create({
      model:      __m,
      max_tokens: 1000,
      messages: [{ role: 'user', content: prompt }],
    });
    void logLlmCall({ source: 'historical_synthesis', model: __m, usage: response.usage, agentId: agent.id, latencyMs: Date.now() - __t });
  } catch (err) {
    void logLlmCall({ source: 'historical_synthesis', model: __m, usage: { input_tokens: 0, output_tokens: 0 }, agentId: agent.id, latencyMs: Date.now() - __t, error: err instanceof Error ? err.message : String(err) });
    throw err;
  }

  const raw   = response.content[0].type === 'text' ? response.content[0].text.trim() : '';
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return NextResponse.json({ error: 'Error al procesar el análisis.' }, { status: 500 });

  let result: unknown;
  try { result = JSON.parse(match[0]); } catch {
    return NextResponse.json({ error: 'Error al procesar el análisis.' }, { status: 500 });
  }

  return NextResponse.json(result);
}
