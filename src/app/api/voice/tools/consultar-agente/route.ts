import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createAdminClient } from '@/lib/supabase/admin';
import { executeSearchFiles, executeReadFile } from '@/lib/services/connector-tools';
import { searchWeb } from '@/lib/search/web';
import { requireVapiAuth } from '@/lib/vapi/auth';

export const dynamic = 'force-dynamic';

const MAX_TURNS = 5;

// ── Tools available to the consulted agent ────────────────────────────────────

const AGENT_TOOLS: Anthropic.Tool[] = [
  {
    name: 'buscar_archivo',
    description: 'Busca un archivo en el Drive conectado (Google Drive u OneDrive) por nombre o descripción.',
    input_schema: {
      type: 'object' as const,
      properties: {
        busqueda: { type: 'string', description: 'Nombre o descripción del archivo.' },
      },
      required: ['busqueda'],
    },
  },
  {
    name: 'leer_archivo',
    description: 'Lee el contenido de un archivo encontrado con buscar_archivo.',
    input_schema: {
      type: 'object' as const,
      properties: {
        file_id:   { type: 'string', description: 'ID del archivo obtenido de buscar_archivo.' },
        file_name: { type: 'string', description: 'Nombre del archivo.' },
        mime_type: { type: 'string', description: 'Tipo MIME, ej: application/pdf.' },
      },
      required: ['file_id', 'file_name', 'mime_type'],
    },
  },
  {
    name: 'buscar_en_web',
    description: 'Busca información en internet cuando no está en el Drive ni en el conocimiento propio.',
    input_schema: {
      type: 'object' as const,
      properties: {
        query: { type: 'string', description: 'Términos de búsqueda.' },
      },
      required: ['query'],
    },
  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function normalize(s: string) {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9\s]/g, '');
}

function matchScore(query: string, candidate: { agent_name?: string | null; role?: string | null }): number {
  const q     = normalize(query);
  const name  = normalize(candidate.agent_name ?? '');
  const role  = normalize(candidate.role ?? '');
  if (name === q || role === q)              return 3;
  if (name.includes(q) || q.includes(name)) return 2;
  if (role.includes(q) || q.includes(role)) return 1;
  const qTokens = q.split(/\s+/);
  const all     = `${name} ${role}`;
  return qTokens.filter(t => t.length > 2 && all.includes(t)).length;
}

// ── Route ─────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  if (!requireVapiAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const agentId    = req.nextUrl.searchParams.get('agent_id') ?? '';
  const body       = await req.json() as Record<string, unknown>;
  const call       = (body.toolCallList as Record<string, unknown>[])?.[0];
  const rawArgs    = (call?.function as Record<string, unknown>)?.arguments ?? body;
  const args       = typeof rawArgs === 'string' ? JSON.parse(rawArgs) : rawArgs as Record<string, unknown>;
  const toolCallId = (call?.id as string) ?? 'call_1';

  const { rol, tarea, contexto } = args as { rol: string; tarea: string; contexto?: string };

  const fail = (msg: string) =>
    NextResponse.json({ results: [{ toolCallId, result: msg }] });

  if (!rol || !tarea) return fail('Parámetros insuficientes para consultar al agente.');

  const supabase = createAdminClient();

  // Identify calling agent
  const { data: caller } = await supabase
    .from('voice_agents')
    .select('portal_email, agent_name, business_name')
    .eq('id', agentId)
    .single();

  if (!caller?.portal_email) return fail('No se pudo identificar al agente consultante.');

  // Find sibling agents in the same account
  const { data: siblings } = await supabase
    .from('voice_agents')
    .select('id, agent_name, role, knowledge_base, role_knowledge_base')
    .eq('portal_email', caller.portal_email)
    .eq('active', true)
    .neq('id', agentId);

  if (!siblings?.length) return fail('No hay otros agentes disponibles en el equipo en este momento.');

  // Pick best match by name / role
  const target = siblings
    .map(s => ({ s, score: matchScore(rol, s) }))
    .sort((a, b) => b.score - a.score)[0].s;

  // Build system prompt for the consulted agent
  const parts: string[] = [
    `Eres ${target.agent_name || 'un agente especializado'} del equipo de ${caller.business_name}.`,
    target.role ? `Tu especialidad: ${target.role}.` : '',
    '',
    `Tu compañero ${caller.agent_name || 'recepcionista'} te está consultando porque tiene a un cliente esperando. Necesita que le des la información exacta lo antes posible.`,
    '',
    'REGLAS:',
    '- Si la información está en tu base de conocimiento, responde directamente.',
    '- Si no está en tu KB pero puede estar en el Drive o en internet, búscala — tienes herramientas para hacerlo. No digas que no sabes si aún no has buscado.',
    '- Cuando encuentres la respuesta, dala de forma concisa y directa. Tu respuesta va a transmitirse al cliente.',
    '- Si después de buscar genuinamente no encuentras nada, dilo claramente para que el compañero gestione la situación.',
    '- No menciones que eres IA ni que usaste herramientas. Solo da la respuesta.',
  ];

  if (target.knowledge_base?.trim())
    parts.push('', '## Tu base de conocimiento', target.knowledge_base.trim());
  if (target.role_knowledge_base?.trim())
    parts.push('', '## Conocimiento de tu rol', target.role_knowledge_base.trim());

  const systemPrompt = parts.filter(Boolean).join('\n');
  const userMsg      = contexto?.trim()
    ? `Contexto de la llamada: ${contexto.trim()}\n\nNecesito: ${tarea}`
    : tarea;

  // ── Agentic loop ─────────────────────────────────────────────────────────────

  const client   = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const messages: Anthropic.MessageParam[] = [{ role: 'user', content: userMsg }];

  try {
    for (let turn = 0; turn < MAX_TURNS; turn++) {
      const response = await client.messages.create({
        model:      'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        system:     systemPrompt,
        tools:      AGENT_TOOLS,
        messages,
      });

      // Agent answered — return to Nia
      if (response.stop_reason === 'end_turn') {
        const text = response.content
          .filter((b): b is Anthropic.TextBlock => b.type === 'text')
          .map(b => b.text)
          .join('')
          .trim();
        return NextResponse.json({
          results: [{ toolCallId, result: `[${target.agent_name || rol}]: ${text}` }],
        });
      }

      // Agent wants to use a tool
      if (response.stop_reason !== 'tool_use') break;

      messages.push({ role: 'assistant', content: response.content });

      const toolResults: Anthropic.ToolResultBlockParam[] = [];

      for (const block of response.content) {
        if (block.type !== 'tool_use') continue;

        const input  = block.input as Record<string, string>;
        let   result = '';

        if (block.name === 'buscar_archivo') {
          const r = await executeSearchFiles(target.id, input.busqueda, supabase);
          result  = r.message ?? r.error ?? 'Error al buscar archivo.';

        } else if (block.name === 'leer_archivo') {
          const r = await executeReadFile(target.id, input.file_id, input.file_name, input.mime_type, supabase);
          result  = (r.content as string | undefined) ?? r.error ?? 'No se pudo leer el archivo.';

        } else if (block.name === 'buscar_en_web') {
          const results = await searchWeb(input.query, 5);
          result = results.length
            ? results.map(r => `${r.title}: ${r.description}`).join('\n')
            : 'No se encontraron resultados en internet.';
        }

        toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: result });
      }

      messages.push({ role: 'user', content: toolResults });
    }

    return fail(`${target.agent_name || rol} no pudo encontrar la información solicitada.`);
  } catch (err) {
    console.error('consultar-agente error:', err);
    return fail('El agente no está disponible en este momento.');
  }
}
