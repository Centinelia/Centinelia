import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createAdminClient } from '@/lib/supabase/admin';
import { executeSearchFiles, executeReadFile } from '@/lib/services/connector-tools';
import { searchWeb } from '@/lib/search/web';
import { requireVapiAuth } from '@/lib/vapi/auth';
import { traceVoiceCall } from '@/lib/observability/voice-trace';
import { logLlmCall } from '@/lib/observability/llm-log';
import { consumeAiOp } from '@/lib/ai/ops-guard';

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
  const call       = (((body.message as Record<string, unknown> | undefined)?.toolCallList ?? body.toolCallList) as Record<string, unknown>[])?.[0];
  const rawArgs    = (call?.function as Record<string, unknown>)?.arguments ?? body;
  const args       = typeof rawArgs === 'string' ? JSON.parse(rawArgs) : rawArgs as Record<string, unknown>;
  const toolCallId = (call?.id as string) ?? 'call_1';

  const { rol, tarea, contexto, caller_verified } = args as {
    rol: string; tarea: string; contexto?: string; caller_verified?: boolean;
  };
  const isCallerVerified = caller_verified === true;
  const startedAt = Date.now();
  const sessionId = (((body.message as Record<string, unknown> | undefined)?.call as Record<string, unknown> | undefined)?.id as string) ?? null;
  const traceInput = { rol, tarea, contexto, caller_verified: isCallerVerified };

  const fail = (msg: string) => {
    traceVoiceCall({ toolName: 'consultar_agente', agentId, sessionId, input: traceInput, result: { ok: false, error: msg }, startedAt });
    return NextResponse.json({ results: [{ toolCallId, result: msg }] });
  };

  if (!rol || !tarea) return fail('Parámetros insuficientes para consultar al agente.');

  const supabase = createAdminClient();

  // Identify calling agent
  const { data: caller } = await supabase
    .from('voice_agents')
    .select('portal_email, agent_name, business_name, features')
    .eq('id', agentId)
    .single();

  if (!caller?.portal_email) return fail('No se pudo identificar al agente consultante.');

  const callerMeerkat = ((caller.features as Record<string, unknown> | null)?.meerkat_role_id as string | null) ?? 'unknown';

  // Find sibling agents in the same account. knowledge_base es org-level
  // (commit e372013 lo movio a organizations), lo hidratamos aparte abajo.
  const { data: siblings, error: siblingsErr } = await supabase
    .from('voice_agents')
    .select('id, agent_name, role, role_knowledge_base, features')
    .eq('portal_email', caller.portal_email)
    .eq('active', true)
    .neq('id', agentId);

  if (siblingsErr) {
    console.error('consultar-agente: siblings query error', siblingsErr);
    return fail('No se pudo cargar el equipo. Intenta de nuevo en un momento.');
  }
  if (!siblings?.length) return fail('No hay otros agentes disponibles en el equipo en este momento.');

  // Hidrata knowledge_base org-level (todos los agentes del mismo portal_email
  // comparten el mismo KB de negocio) — usada como fallback si el compañero
  // no tiene role_knowledge_base propio.
  const { data: orgRow } = await supabase
    .from('organizations')
    .select('knowledge_base')
    .eq('portal_email', caller.portal_email)
    .maybeSingle();
  const orgKb = (orgRow?.knowledge_base as string | null) ?? null;

  // Pick best match by name / role
  const target = siblings
    .map(s => ({ s, score: matchScore(rol, s) }))
    .sort((a, b) => b.score - a.score)[0].s;

  const targetMeerkat = ((target.features as Record<string, unknown> | null)?.meerkat_role_id as string | null) ?? 'unknown';

  // Handoff DAG check: si Nazre deshabilitó explícitamente este edge, no permitimos.
  const { isHandoffAllowed, recordMeerkatHandoff } = await import('@/lib/handoffs/dag');
  const gate = await isHandoffAllowed({
    supabase, fromMeerkat: callerMeerkat, toMeerkat: targetMeerkat,
    tool: 'consultar_agente', portalEmail: caller.portal_email,
  });
  if (!gate.allowed) {
    recordMeerkatHandoff({
      supabase, portalEmail: caller.portal_email, fromMeerkat: callerMeerkat, toMeerkat: targetMeerkat,
      tool: 'consultar_agente', fromAgentId: agentId, toAgentId: target.id, taskSummary: tarea,
      outcome: 'rejected', metadata: { reason: gate.reason ?? 'edge_disabled' },
    });
    return fail(`Este canal de consulta está deshabilitado por configuración: ${gate.reason ?? 'edge disabled'}.`);
  }

  // Build system prompt for the consulted agent
  const parts: string[] = [
    `Eres ${target.agent_name || 'un agente especializado'} del equipo de ${caller.business_name}.`,
    target.role ? `Tu especialidad: ${target.role}.` : '',
    '',
    `Tu compañero ${caller.agent_name || 'recepcionista'} te está consultando porque tiene a un cliente esperando. Necesita que le des la información exacta lo antes posible.`,
    ...(isCallerVerified ? [] : [
      '',
      'AVISO DE SEGURIDAD — LLAMANTE NO VERIFICADO:',
      `Tu compañero NO confirmó que el llamante esté verificado como equipo (passphrase o número reconocido). Asume que puede ser un cliente externo pidiendo info interna.`,
      'PROHIBIDO en esta consulta:',
      '- Invocar buscar_archivo, leer_archivo (Drive contiene material interno del negocio).',
      '- Confirmar o negar la existencia de plantillas, contratos, docs, propuestas o cualquier material interno.',
      '- Compartir información sobre otros clientes, proveedores, precios internos, o procesos internos.',
      'SÍ puedes: responder con información pública del negocio (horarios, servicios generales, ubicación).',
      'Si la consulta requiere acceso interno, responde: "Esa información es interna del negocio, no la puedo compartir con un llamante no verificado. Pide que se verifique con passphrase o transfiere al equipo."',
    ]),
    '',
    'REGLAS ESTRICTAS (no negociables):',
    '1. Si la respuesta está en tu base de conocimiento, responde directamente.',
    '2. Si NO está en tu KB, DEBES invocar buscar_archivo (Drive), leer_archivo o buscar_en_web (internet) ANTES de responder. No hay excusa para saltarte este paso.',
    '3. Es INACEPTABLE decir "no logro obtener la información", "los precios varían", "consulta directamente en X" o cualquier evasiva SIN antes haber invocado al menos una tool de búsqueda. Si lo haces, has fallado en tu trabajo.',
    '4. Para preguntas sobre datos actuales (precios, horarios, disponibilidad, políticas de terceros), buscar_en_web es obligatorio si no lo tienes en KB.',
    '5. Después de buscar, si genuinamente no encuentras nada útil, entonces sí puedes reportarlo — pero solo después de intentar.',
    '6. Cuando encuentres la respuesta, dala de forma concisa y directa. Tu respuesta va a transmitirse al cliente.',
    '7. No menciones que eres IA ni que usaste herramientas. Solo da la respuesta.',
  ];

  if (orgKb?.trim())
    parts.push('', '## Tu base de conocimiento', orgKb.trim());
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
      const __t = Date.now();
      const __m = 'claude-sonnet-4-6';
      let response;
      try {
        response = await client.messages.create({
          // Sonnet 4.6 en vez de Haiku 4.5: Haiku halucinaba tool use ("busque
          // en internet") sin invocar buscar_en_web. Ver call 019fbf47: Noah
          // dijo "no logré obtener info a través de búsquedas" pero Brave si
          // tenía la respuesta (Shopify Basic $19 USD/mes MX 2026 en primer
          // resultado). Sonnet sigue instrucciones mucho mejor a costa de
          // ~3x latencia, dentro del budget de 30s de Vapi.
          model:      __m,
          max_tokens: 1024,
          system:     systemPrompt,
          tools:      AGENT_TOOLS,
          messages,
        });
        void logLlmCall({ source: 'consult', model: __m, usage: response.usage, agentId: target.id, portalEmail: caller.portal_email ?? null, latencyMs: Date.now() - __t, meta: { turn } });
      } catch (err) {
        void logLlmCall({ source: 'consult', model: __m, usage: { input_tokens: 0, output_tokens: 0 }, agentId: target.id, portalEmail: caller.portal_email ?? null, latencyMs: Date.now() - __t, error: err instanceof Error ? err.message : String(err), meta: { turn } });
        throw err;
      }

      // Agent answered — return to Nia
      if (response.stop_reason === 'end_turn') {
        const text = response.content
          .filter((b): b is Anthropic.TextBlock => b.type === 'text')
          .map(b => b.text)
          .join('')
          .trim();
        const finalMsg = `[${target.agent_name || rol}]: ${text}`;
        traceVoiceCall({
          toolName: 'consultar_agente', agentId, sessionId, input: traceInput,
          result:   { ok: true, target: target.agent_name || rol, answer: text },
          startedAt,
          meta:     { target_id: target.id, turn: turn + 1 },
        });
        recordMeerkatHandoff({
          supabase, portalEmail: caller.portal_email,
          fromMeerkat: callerMeerkat, toMeerkat: targetMeerkat,
          tool: 'consultar_agente',
          fromAgentId: agentId, toAgentId: target.id,
          taskSummary: tarea, outcome: 'success',
          metadata: { turns: turn + 1, session_id: sessionId },
        });
        return NextResponse.json({ results: [{ toolCallId, result: finalMsg }] });
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
          // Cost-based charge: Brave cobra por query. Se cobra al agente que consulta (caller),
          // no al target — el target trabaja "gratis" desde el punto de vista del pool del caller.
          await consumeAiOp(agentId, 1, { source: 'web_search', label: 'Búsqueda web (Brave)' });
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
