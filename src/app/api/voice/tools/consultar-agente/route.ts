import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

function normalize(s: string) {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9\s]/g, '');
}

function matchScore(query: string, candidate: { agent_name?: string | null; role?: string | null }): number {
  const q     = normalize(query);
  const name  = normalize(candidate.agent_name ?? '');
  const role  = normalize(candidate.role ?? '');
  if (name === q || role === q)           return 3;
  if (name.includes(q) || q.includes(name)) return 2;
  if (role.includes(q) || q.includes(role)) return 1;
  // Token overlap
  const qTokens = q.split(/\s+/);
  const all     = `${name} ${role}`;
  const overlap = qTokens.filter(t => t.length > 2 && all.includes(t)).length;
  return overlap;
}

export async function POST(req: NextRequest) {
  const agentId = req.nextUrl.searchParams.get('agent_id') ?? '';
  const body    = await req.json() as Record<string, unknown>;

  const call   = (body.toolCallList as Record<string, unknown>[])?.[0];
  const rawArgs = (call?.function as Record<string, unknown>)?.arguments ?? body;
  const args   = typeof rawArgs === 'string' ? JSON.parse(rawArgs) : rawArgs as Record<string, unknown>;
  const toolCallId = (call?.id as string) ?? 'call_1';

  const { rol, tarea, contexto } = args as { rol: string; tarea: string; contexto?: string };

  const fail = (msg: string) =>
    NextResponse.json({ results: [{ toolCallId, result: msg }] });

  if (!rol || !tarea) return fail('Parámetros insuficientes para consultar al agente.');

  const supabase = createAdminClient();

  // Get calling agent context
  const { data: caller } = await supabase
    .from('voice_agents')
    .select('portal_email, agent_name, business_name')
    .eq('id', agentId)
    .single();

  if (!caller?.portal_email) return fail('No se pudo identificar al agente consultante.');

  // Find sibling agents in the same account
  const { data: siblings } = await supabase
    .from('voice_agents')
    .select('id, agent_name, role, knowledge_base, role_knowledge_base, business_description')
    .eq('portal_email', caller.portal_email)
    .eq('active', true)
    .neq('id', agentId);

  if (!siblings?.length) return fail('No hay otros agentes disponibles en el equipo en este momento.');

  // Pick best match by role/name
  const scored  = siblings.map(s => ({ s, score: matchScore(rol, s) })).sort((a, b) => b.score - a.score);
  const target  = scored[0].s;

  // Build a lean system prompt for the target agent
  const promptParts: string[] = [
    `Eres ${target.agent_name || 'un agente especializado'} del equipo de ${caller.business_name}.`,
    target.role ? `Tu especialidad: ${target.role}.` : '',
    '',
    `Un compañero agente (${caller.agent_name || 'recepcionista'}) te está consultando sobre algo que está fuera de su área.`,
    'Responde directamente con la información o el resultado que necesitan. Sé conciso — tu respuesta se transmitirá a quien está atendiendo al cliente.',
    'No expliques que eres una IA. Solo actúa como lo haría un experto de tu área.',
  ];

  if (target.knowledge_base?.trim()) {
    promptParts.push('', '## Tu base de conocimiento', target.knowledge_base.trim());
  }
  if (target.role_knowledge_base?.trim()) {
    promptParts.push('', '## Conocimiento específico de tu rol', target.role_knowledge_base.trim());
  }

  const systemPrompt = promptParts.filter(p => p !== undefined).join('\n');

  const userMsg = contexto?.trim()
    ? `Contexto de la conversación: ${contexto.trim()}\n\nTarea o pregunta para ti: ${tarea}`
    : tarea;

  try {
    const client  = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const message = await client.messages.create({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 512,
      system:     systemPrompt,
      messages:   [{ role: 'user', content: userMsg }],
    });

    const text = (message.content[0] as { type: string; text: string })?.text?.trim()
      ?? 'El agente no pudo generar una respuesta.';

    return NextResponse.json({
      results: [{
        toolCallId,
        result: `[${target.agent_name || rol}]: ${text}`,
      }],
    });
  } catch (err) {
    console.error('consultar-agente error:', err);
    return fail('El agente no está disponible en este momento.');
  }
}
