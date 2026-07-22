import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

type SiblingAgent = {
  id: string;
  agent_name: string | null;
  role: string | null;
  knowledge_base: string | null;
  role_knowledge_base: string | null;
  transfer_whatsapp: string | null;
  portal_email: string;
  portal_token: string | null;
};

const MAX_ITER       = 4;
const TIME_BUDGET_MS = 22_000; // 22s — leaves buffer before Vapi's 30s tool-call timeout
const APP_URL        = process.env.NEXT_PUBLIC_APP_URL!;

// ── Target-agent matching (same logic as consultar-agente) ────────────────────

function normalize(s: string) {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9\s]/g, '');
}

function matchScore(query: string, c: { agent_name?: string | null; role?: string | null }) {
  const q    = normalize(query);
  const name = normalize(c.agent_name ?? '');
  const role = normalize(c.role ?? '');
  if (name === q || role === q)                       return 4;
  if (name.includes(q) || q.includes(name))          return 3;
  if (role.includes(q) || q.includes(role))          return 2;
  const tokens = q.split(/\s+/).filter(t => t.length > 2);
  return tokens.filter(t => `${name} ${role}`.includes(t)).length;
}

// ── Tools available to the delegated agent (Anthropic tool_use format) ────────

const DELEGATION_TOOLS: Anthropic.Tool[] = [
  {
    name:        'enviar_correo',
    description: 'Envía un correo electrónico a la persona indicada.',
    input_schema: {
      type: 'object',
      properties: {
        to:      { type: 'string', description: 'Dirección de correo del destinatario' },
        subject: { type: 'string', description: 'Asunto del correo' },
        body:    { type: 'string', description: 'Cuerpo del correo en texto plano' },
      },
      required: ['to', 'subject', 'body'],
    },
  },
  {
    name:        'crear_ticket',
    description: 'Crea un ticket en la mesa de ayuda IT.',
    input_schema: {
      type: 'object',
      properties: {
        titulo:      { type: 'string' },
        categoria:   { type: 'string', enum: ['red','servidores','usuario','software','hardware','accesos','otro'] },
        prioridad:   { type: 'string', enum: ['baja','normal','alta','critica'] },
        descripcion: { type: 'string' },
      },
      required: ['titulo', 'prioridad'],
    },
  },
  {
    name:        'crear_documento',
    description: 'Genera un documento PDF y lo envía al correo del dueño.',
    input_schema: {
      type: 'object',
      properties: {
        title:         { type: 'string' },
        content:       { type: 'string', description: 'Contenido. Usa # para secciones.' },
        filename:      { type: 'string' },
        template_type: { type: 'string', enum: ['general','proposal','letter'] },
        client_name:   { type: 'string' },
        client_email:  { type: 'string' },
        total_price:   { type: 'string' },
      },
      required: ['title', 'content'],
    },
  },
  {
    name:        'tarea_completada',
    description: 'Señala que la tarea fue completada. Llama a esta herramienta cuando hayas terminado todas las acciones necesarias. NO la llames antes de haber ejecutado las acciones.',
    input_schema: {
      type: 'object',
      properties: {
        resultado: { type: 'string', description: 'Descripción clara de lo que se hizo y el resultado obtenido.' },
      },
      required: ['resultado'],
    },
  },
];

// ── Internal tool executor — calls existing Vapi tool routes ──────────────────

async function executeToolOnAgent(
  toolName: string,
  toolArgs: Record<string, unknown>,
  targetAgentId: string,
): Promise<string> {
  const routeMap: Record<string, string> = {
    enviar_correo:  'enviar-correo',
    crear_ticket:   'crear-ticket',
    crear_documento: 'crear-documento',
  };

  const routePath = routeMap[toolName];
  if (!routePath) return `Herramienta "${toolName}" no disponible en delegación.`;

  try {
    const res = await fetch(`${APP_URL}/api/voice/tools/${routePath}?agent_id=${targetAgentId}`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        toolCallList: [{
          id:   `delegation_${Date.now()}`,
          type: 'function',
          function: { name: toolName, arguments: toolArgs },
        }],
      }),
    });

    if (!res.ok) return 'Error al ejecutar la acción.';
    const data = await res.json() as { results?: Array<{ result: string }> };
    return data.results?.[0]?.result ?? 'Acción ejecutada sin respuesta.';
  } catch {
    return 'Error de conexión al ejecutar la acción.';
  }
}

// ── Main handler ──────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const agentId = req.nextUrl.searchParams.get('agent_id') ?? '';
  const body    = await req.json() as Record<string, unknown>;

  const call      = (body.toolCallList as Record<string, unknown>[])?.[0];
  const rawArgs   = (call?.function as Record<string, unknown>)?.arguments ?? body;
  const args      = typeof rawArgs === 'string' ? JSON.parse(rawArgs) : rawArgs as Record<string, unknown>;
  const toolCallId = (call?.id as string) ?? 'call_1';

  const { agente, tarea, contexto } = args as { agente: string; tarea: string; contexto?: string };

  const fail = (msg: string) =>
    NextResponse.json({ results: [{ toolCallId, result: msg }] });

  if (!agente || !tarea) return fail('Parámetros insuficientes para delegar la tarea.');

  const supabase = createAdminClient();

  // Get calling agent
  const { data: caller } = await supabase
    .from('voice_agents')
    .select('portal_email, agent_name, business_name')
    .eq('id', agentId)
    .single();

  if (!caller?.portal_email) return fail('No se pudo identificar al agente que delega.');

  // Find sibling agents
  const { data: siblings } = await supabase
    .from('voice_agents')
    .select('id, agent_name, role, knowledge_base, role_knowledge_base, transfer_whatsapp, portal_email, portal_token')
    .eq('portal_email', caller.portal_email)
    .eq('active', true)
    .neq('id', agentId);

  if (!siblings?.length) return fail('No hay otros agentes disponibles en el equipo.');

  // Pick best match
  const target = [...siblings]
    .sort((a, b) => matchScore(agente, b) - matchScore(agente, a))[0] as SiblingAgent;

  // Build target agent system prompt (lean, task-focused)
  const promptLines = [
    `Eres ${target.agent_name || 'un agente especializado'} del equipo de ${caller.business_name}.`,
    target.role ? `Tu especialidad y rol: ${target.role}.` : '',
    '',
    `Un colega (${caller.agent_name || 'otro agente'}) te ha delegado una tarea. Debes ejecutarla usando las herramientas disponibles.`,
    'Reglas:',
    '- Ejecuta la tarea directamente. No pidas confirmación.',
    '- Si necesitas información que no tienes, usa lo que más se aproxime.',
    '- Cuando termines TODAS las acciones necesarias, llama a tarea_completada con un resumen de lo que hiciste.',
    '- No llames a tarea_completada antes de haber ejecutado las acciones.',
  ];

  if (target.knowledge_base?.trim()) {
    promptLines.push('', '## Base de conocimiento', target.knowledge_base.trim());
  }
  if (target.role_knowledge_base?.trim()) {
    promptLines.push('', '## Conocimiento de tu rol', target.role_knowledge_base.trim());
  }

  const systemPrompt = promptLines.filter(p => p !== undefined).join('\n');
  const userMsg      = contexto?.trim()
    ? `Contexto de la conversación: ${contexto.trim()}\n\nTarea a ejecutar: ${tarea}`
    : `Tarea a ejecutar: ${tarea}`;

  // ── Record task in agent_tasks ────────────────────────────────────────────
  const { data: taskRecord } = await supabase
    .from('agent_tasks')
    .insert({
      portal_email:   caller.portal_email,
      created_by:     agentId || null,
      assigned_to:    target.id,
      title:          tarea.slice(0, 200),
      description:    contexto?.trim() || null,
      status:         'in_progress',
      trigger_type:   'delegation',
      source_context: contexto?.trim() || null,
      started_at:     new Date().toISOString(),
    })
    .select('id')
    .single();

  const taskId = taskRecord?.id as string | undefined;

  // ── Agentic loop ──────────────────────────────────────────────────────────
  const client    = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const messages: Anthropic.MessageParam[] = [{ role: 'user', content: userMsg }];
  let finalResult = '';
  let taskDoneGlobal = false;
  const loopStart = Date.now();

  for (let i = 0; i < MAX_ITER; i++) {
    if (Date.now() - loopStart > TIME_BUDGET_MS) break;
    const response = await client.messages.create({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      system:     systemPrompt,
      tools:      DELEGATION_TOOLS,
      messages,
    });

    messages.push({ role: 'assistant', content: response.content });

    // Pure text response — agent decided no tools needed
    if (response.stop_reason === 'end_turn') {
      const text = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map(b => b.text).join('').trim();
      finalResult = text || finalResult;
      break;
    }

    if (response.stop_reason !== 'tool_use') break;

    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    let taskDone = false;

    for (const block of response.content) {
      if (block.type !== 'tool_use') continue;

      // tarea_completada — agent signals it's done
      if (block.name === 'tarea_completada') {
        finalResult    = (block.input as { resultado: string }).resultado;
        taskDone       = true;
        taskDoneGlobal = true;
        toolResults.push({
          type: 'tool_result', tool_use_id: block.id,
          content: 'Tarea marcada como completada.',
        });
        if (taskId) {
          await supabase
            .from('agent_tasks')
            .update({ status: 'completed', result: finalResult, completed_at: new Date().toISOString() })
            .eq('id', taskId);
        }
        break;
      }

      // Execute the tool on the target agent
      const toolResult = await executeToolOnAgent(block.name, block.input as Record<string, unknown>, target.id);
      finalResult      = `${block.name}: ${toolResult}`;

      toolResults.push({
        type: 'tool_result', tool_use_id: block.id,
        content: toolResult,
      });
    }

    if (taskDone) break;
    messages.push({ role: 'user', content: toolResults });
  }

  // Mark as failed if loop ended without tarea_completada
  if (taskId && !taskDoneGlobal) {
    await supabase
      .from('agent_tasks')
      .update({ status: 'failed', result: finalResult || 'Sin respuesta del agente.' })
      .eq('id', taskId);
  }

  const agentLabel = target.agent_name || agente;
  return NextResponse.json({
    results: [{
      toolCallId,
      result: `[${agentLabel}] ${finalResult || 'Tarea procesada.'}`,
    }],
  });
}
