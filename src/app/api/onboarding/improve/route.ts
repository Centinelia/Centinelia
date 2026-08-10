import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createAdminClient } from '@/lib/supabase/admin';
import { getPrimaryAgentFromToken } from '@/lib/portal/org-token';
import { logLlmCall } from '@/lib/observability/llm-log';

export const dynamic = 'force-dynamic';

// Sponsored AI improvement — no ops deduction.
// Only called during the one-time onboarding flow.

const PROMPTS: Record<string, string> = {
  mission: `Eres un redactor experto en comunicación institucional y organizacional.
El usuario escribió la misión de su organización con sus propias palabras. Tu tarea es mejorar el texto para que sea claro, inspirador y profesional, sin perder la esencia de lo que el usuario expresó.
Mantén el idioma (español), el punto de vista de primera persona plural ("Nuestro propósito es..."), y una extensión similar (1-3 oraciones).
No inventes información nueva. Solo mejora la redacción.
Responde únicamente con el texto mejorado, sin explicaciones ni comillas.`,

  service_definition: `Eres un redactor experto en servicio al cliente y comunicación institucional.
El usuario describió qué significa para su organización brindar un buen servicio. Tu tarea es mejorar ese texto para que sea concreto, orientado a la acción y memorable.
Mantén el idioma (español), la extensión similar y la voz del usuario. No inventes información nueva.
Responde únicamente con el texto mejorado, sin explicaciones ni comillas.`,

  behaviors: `Eres un consultor de experiencia al cliente. Se te proporciona la misión y la definición de buen servicio de una organización.
A partir de ellas, genera exactamente 3 comportamientos concretos que su equipo de atención va a adoptar.
Cada comportamiento debe ser específico, orientado a acción, y derivado directamente de lo que dijeron.
Formato de respuesta — únicamente 3 líneas, una por comportamiento, sin numeración ni viñetas. Ejemplo:
Cerrar cada llamada con el próximo paso claro y el nombre de quien lo seguirá
Escalar inmediatamente cuando no hay respuesta concreta que ofrecer
Usar "usted" y dirigirse por nombre al ciudadano en toda interacción`,
};

export async function POST(req: NextRequest) {
  const body = await req.json() as { token: string; text: string; field: 'mission' | 'service_definition' | 'behaviors'; context?: string };
  const { token, text, field, context } = body;

  if (!token || !field) return NextResponse.json({ error: 'Params missing' }, { status: 400 });

  // Verify token is valid (no session required — onboarding is pre-auth-cookie sometimes)
  const supabase = createAdminClient();
  const agent = await getPrimaryAgentFromToken<{ id: string; business_name: string }>(
    token, 'id, business_name', supabase,
  );

  if (!agent) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const systemPrompt = PROMPTS[field];
  if (!systemPrompt) return NextResponse.json({ error: 'Invalid field' }, { status: 400 });

  const userContent = field === 'behaviors'
    ? `Misión: ${text}\nBuen servicio significa: ${context ?? ''}`
    : text;

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const __t = Date.now();
  const __m = 'claude-haiku-4-5-20251001';
  let response;
  try {
    response = await client.messages.create({
      model:      __m,
      max_tokens: 300,
      system:     systemPrompt,
      messages:   [{ role: 'user', content: userContent }],
    });
    void logLlmCall({ source: 'onboarding_improve', model: __m, usage: response.usage, agentId: agent.id, latencyMs: Date.now() - __t, meta: { field } });
  } catch (err) {
    void logLlmCall({ source: 'onboarding_improve', model: __m, usage: { input_tokens: 0, output_tokens: 0 }, agentId: agent.id, latencyMs: Date.now() - __t, error: err instanceof Error ? err.message : String(err), meta: { field } });
    throw err;
  }

  const improved = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map(b => b.text).join('').trim();

  if (field === 'behaviors') {
    const behaviors = improved.split('\n').map(l => l.trim()).filter(Boolean).slice(0, 3);
    return NextResponse.json({ behaviors });
  }

  return NextResponse.json({ improved });
}
