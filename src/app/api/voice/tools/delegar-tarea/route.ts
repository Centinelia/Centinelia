import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireVapiAuth } from '@/lib/vapi/auth';

export const dynamic = 'force-dynamic';

type SiblingAgent = {
  id: string;
  agent_name: string | null;
  role: string | null;
  role_knowledge_base: string | null;
  transfer_whatsapp: string | null;
  portal_email: string;
  portal_token: string | null;
};

const MAX_TOOL_ITER  = 6;       // max tool calls per attempt
const DEFAULT_GOAL_ITER = 3;    // default goal-loop retries when success_criteria is set
const TIME_BUDGET_MS = 26_000;  // leaves buffer before Vapi's 30s tool-call timeout
const APP_URL        = process.env.NEXT_PUBLIC_APP_URL!;

// ── Target-agent matching ──────────────────────────────────────────────────────

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

// ── Tools available to the delegated agent ────────────────────────────────────

const DELEGATION_TOOLS: Anthropic.Tool[] = [
  {
    name:        'buscar_archivo',
    description: 'Busca un archivo en el Drive del negocio por nombre o descripción.',
    input_schema: {
      type: 'object',
      properties: { busqueda: { type: 'string', description: 'Nombre o descripción del archivo.' } },
      required: ['busqueda'],
    },
  },
  {
    name:        'leer_archivo',
    description: 'Lee el contenido de un archivo del Drive encontrado con buscar_archivo.',
    input_schema: {
      type: 'object',
      properties: {
        file_id:   { type: 'string', description: 'ID del archivo.' },
        file_name: { type: 'string', description: 'Nombre del archivo.' },
        mime_type: { type: 'string', description: 'Tipo MIME del archivo.' },
      },
      required: ['file_id', 'file_name'],
    },
  },
  {
    name:        'buscar_en_web',
    description: 'Busca información en internet cuando no está en el KB ni en el Drive.',
    input_schema: {
      type: 'object',
      properties: { query: { type: 'string', description: 'Términos de búsqueda.' } },
      required: ['query'],
    },
  },
  {
    name:        'enviar_correo',
    description: 'Envía un correo electrónico directamente. Úsala solo cuando ya sepas qué escribir y a quién. Si el correo es delicado o el destinatario no está claro, prefiere pedir información primero.',
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
    name:        'llamar_a',
    description: 'Inicia una llamada saliente al cliente para entregar información o hacer seguimiento. Úsala solo si el cliente lo pidió explícitamente o si tienes autorización para llamar. Nunca para prospección fría.',
    input_schema: {
      type: 'object',
      properties: {
        numero:  { type: 'string', description: 'Número de teléfono con código de país. Ej: +528112345678' },
        nombre:  { type: 'string', description: 'Nombre del cliente (opcional)' },
        mensaje: { type: 'string', description: 'Motivo de la llamada o información a comunicar al cliente.' },
      },
      required: ['numero', 'mensaje'],
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
    description: 'Señala que la tarea fue completada. Llama a esta herramienta cuando hayas terminado TODAS las acciones necesarias.',
    input_schema: {
      type: 'object',
      properties: {
        resultado: { type: 'string', description: 'Descripción clara de lo que se hizo y el resultado obtenido.' },
      },
      required: ['resultado'],
    },
  },
];

// ── Internal tool executor ─────────────────────────────────────────────────────

async function executeToolOnAgent(
  toolName: string,
  toolArgs: Record<string, unknown>,
  targetAgentId: string,
): Promise<string> {
  const routeMap: Record<string, string> = {
    buscar_archivo:  'buscar-archivo',
    leer_archivo:    'leer-archivo',
    buscar_en_web:   'buscar-en-web',
    enviar_correo:   'enviar-correo',
    llamar_a:        'llamar-a',
    crear_ticket:    'crear-ticket',
    crear_documento: 'crear-documento',
  };

  const routePath = routeMap[toolName];
  if (!routePath) return `Herramienta "${toolName}" no disponible en delegación.`;

  try {
    const res = await fetch(`${APP_URL}/api/voice/tools/${routePath}?agent_id=${targetAgentId}`, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        ...(process.env.VAPI_SERVER_SECRET ? { 'x-vapi-secret': process.env.VAPI_SERVER_SECRET } : {}),
      },
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

// ── Goal evaluation ────────────────────────────────────────────────────────────

async function evaluateGoal(
  client: Anthropic,
  successCriteria: string,
  result: string,
): Promise<{ met: boolean; notes: string }> {
  // F5.1 — model tiering: Sonnet para la evaluación de goal-completion.
  // Es 1 llamada por intento de goal-loop (máx 3 por tarea). El juicio es
  // matiz — "¿realmente cumplió, o solo dijo que sí?" — y Haiku falla en
  // casos borderline. Cost delta absoluto muy pequeño, calidad muy notable.
  const evalMsg = await client.messages.create({
    model:      'claude-sonnet-4-6',
    max_tokens: 200,
    messages: [{
      role:    'user',
      content: `Evalúa si el resultado de una tarea cumplió el criterio de éxito.

Criterio: ${successCriteria}

Resultado obtenido: ${result}

Sé estricto: si el resultado dice que hizo algo pero no hay evidencia clara, marca NO_CUMPLIDO.

Responde ÚNICAMENTE con una de estas dos formas:
CUMPLIDO - [razón breve de por qué sí cumplió]
NO_CUMPLIDO - [qué faltó o falló específicamente]`,
    }],
  });

  const text = evalMsg.content[0]?.type === 'text' ? evalMsg.content[0].text.trim() : '';
  return { met: text.startsWith('CUMPLIDO'), notes: text };
}

// ── Main handler ───────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  if (!requireVapiAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const agentId = req.nextUrl.searchParams.get('agent_id') ?? '';
  const body    = await req.json() as Record<string, unknown>;

  const call      = (((body.message as Record<string, unknown> | undefined)?.toolCallList ?? body.toolCallList) as Record<string, unknown>[])?.[0];
  const rawArgs   = (call?.function as Record<string, unknown>)?.arguments ?? body;
  const args      = typeof rawArgs === 'string' ? JSON.parse(rawArgs) : rawArgs as Record<string, unknown>;
  const toolCallId = (call?.id as string) ?? 'call_1';

  const {
    agente,
    tarea,
    contexto,
    success_criteria,
    max_iterations,
  } = args as {
    agente:            string;
    tarea:             string;
    contexto?:         string;
    success_criteria?: string;
    max_iterations?:   number;
  };

  const fail = (msg: string) =>
    NextResponse.json({ results: [{ toolCallId, result: msg }] });

  if (!agente || !tarea) return fail('Parámetros insuficientes para delegar la tarea.');

  const goalIter   = success_criteria ? Math.min(max_iterations ?? DEFAULT_GOAL_ITER, 5) : 1;
  const supabase   = createAdminClient();

  // Get calling agent
  const { data: caller } = await supabase
    .from('voice_agents')
    .select('portal_email, agent_name, business_name')
    .eq('id', agentId)
    .single();

  if (!caller?.portal_email) return fail('No se pudo identificar al agente que delega.');

  // Find sibling agents. knowledge_base es org-level (commit e372013 lo movio
  // a organizations), lo hidratamos aparte abajo.
  const { data: siblings, error: siblingsErr } = await supabase
    .from('voice_agents')
    .select('id, agent_name, role, role_knowledge_base, transfer_whatsapp, portal_email, portal_token')
    .eq('portal_email', caller.portal_email)
    .eq('active', true)
    .neq('id', agentId);

  if (siblingsErr) {
    console.error('delegar-tarea: siblings query error', siblingsErr);
    return fail('No se pudo cargar el equipo. Intenta de nuevo en un momento.');
  }
  if (!siblings?.length) return fail('No hay otros agentes disponibles en el equipo.');

  const target = [...siblings]
    .sort((a, b) => matchScore(agente, b) - matchScore(agente, a))[0] as SiblingAgent;

  // Hidrata knowledge_base org-level
  const { data: orgRow } = await supabase
    .from('organizations')
    .select('knowledge_base')
    .eq('portal_email', caller.portal_email)
    .maybeSingle();
  const orgKb = (orgRow?.knowledge_base as string | null) ?? null;

  // Build target agent system prompt
  const promptLines = [
    `Eres ${target.agent_name || 'un agente especializado'} del equipo de ${caller.business_name}.`,
    target.role ? `Tu especialidad y rol: ${target.role}.` : '',
    '',
    `Un colega (${caller.agent_name || 'otro agente'}) te ha delegado una tarea. Debes ejecutarla usando las herramientas disponibles.`,
    'Reglas:',
    '- Ejecuta la tarea directamente. No pidas confirmación.',
    '- Si necesitas información, usa buscar_archivo, leer_archivo o buscar_en_web antes de actuar.',
    '- Si la tarea incluye llamar de vuelta al cliente, usa llamar_a DESPUÉS de tener la información lista.',
    '- Cuando termines TODAS las acciones necesarias, llama a tarea_completada con un resumen de lo que hiciste.',
    '- No llames a tarea_completada antes de haber ejecutado las acciones.',
  ];

  if (success_criteria) {
    promptLines.push('', `## Criterio de éxito`, `La tarea se considera completada cuando: ${success_criteria}`);
  }
  if (orgKb?.trim()) {
    promptLines.push('', '## Base de conocimiento', orgKb.trim());
  }
  if (target.role_knowledge_base?.trim()) {
    promptLines.push('', '## Conocimiento de tu rol', target.role_knowledge_base.trim());
  }

  const systemPrompt  = promptLines.filter(p => p !== undefined).join('\n');
  const baseUserMsg   = contexto?.trim()
    ? `Contexto de la conversación: ${contexto.trim()}\n\nTarea a ejecutar: ${tarea}`
    : `Tarea a ejecutar: ${tarea}`;

  // Record task
  const { data: taskRecord } = await supabase
    .from('agent_tasks')
    .insert({
      portal_email:     caller.portal_email,
      created_by:       agentId || null,
      assigned_to:      target.id,
      title:            tarea.slice(0, 200),
      description:      contexto?.trim() || null,
      status:           'in_progress',
      trigger_type:     'delegation',
      source_context:   contexto?.trim() || null,
      started_at:       new Date().toISOString(),
      success_criteria: success_criteria || null,
      max_iterations:   goalIter,
    })
    .select('id')
    .single();

  const taskId     = taskRecord?.id as string | undefined;
  const client     = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const loopStart  = Date.now();

  let finalResult  = '';
  let goalMet      = false;
  let evalNotes    = '';

  // ── Goal-completion outer loop ────────────────────────────────────────────
  for (let attempt = 0; attempt < goalIter; attempt++) {
    if (Date.now() - loopStart > TIME_BUDGET_MS) break;

    // Build user message: first attempt uses base, retries include eval feedback
    const userMsg = attempt === 0
      ? baseUserMsg
      : `${baseUserMsg}\n\n## Intento anterior (${attempt}/${goalIter}) no cumplió el criterio\n${evalNotes}\nIntenta de nuevo con un enfoque diferente.`;

    const messages: Anthropic.MessageParam[] = [{ role: 'user', content: userMsg }];
    let attemptDone = false;

    // ── Inner tool loop ───────────────────────────────────────────────────
    for (let i = 0; i < MAX_TOOL_ITER; i++) {
      if (Date.now() - loopStart > TIME_BUDGET_MS) break;

      const response = await client.messages.create({
        model:      'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        system: [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }],
        tools:      DELEGATION_TOOLS,
        messages,
      });

      messages.push({ role: 'assistant', content: response.content });

      if (response.stop_reason === 'end_turn') {
        const text = response.content
          .filter((b): b is Anthropic.TextBlock => b.type === 'text')
          .map(b => b.text).join('').trim();
        finalResult = text || finalResult;
        attemptDone = true;
        break;
      }

      if (response.stop_reason !== 'tool_use') break;

      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      const toolBlocks = response.content.filter(
        (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use',
      );

      // Short-circuit: tarea_completada es un marcador sin trabajo async
      const completadaBlock = toolBlocks.find(b => b.name === 'tarea_completada');
      if (completadaBlock) {
        finalResult = (completadaBlock.input as { resultado: string }).resultado;
        attemptDone = true;
        toolResults.push({
          type: 'tool_result', tool_use_id: completadaBlock.id,
          content: 'Tarea marcada como completada.',
        });
        for (const b of toolBlocks) {
          if (b.id === completadaBlock.id) continue;
          toolResults.push({ type: 'tool_result', tool_use_id: b.id, content: 'Omitido: tarea completada.' });
        }
      } else {
        // Fan-out paralelo: ejecuta tools independientes en paralelo con Promise.allSettled.
        // Un fallo aislado no rompe el batch.
        const parallel = await Promise.allSettled(
          toolBlocks.map(b => executeToolOnAgent(b.name, b.input as Record<string, unknown>, target.id)),
        );
        for (let ti = 0; ti < toolBlocks.length; ti++) {
          const b = toolBlocks[ti];
          const r = parallel[ti];
          const toolResult = r.status === 'fulfilled' ? r.value : `Error: ${String(r.reason)}`;
          finalResult = `${b.name}: ${toolResult}`;
          toolResults.push({ type: 'tool_result', tool_use_id: b.id, content: toolResult });
        }
      }

      if (attemptDone) break;
      messages.push({ role: 'user', content: toolResults });
    }

    // Evaluate against success criteria if provided
    if (success_criteria && finalResult) {
      const eval_ = await evaluateGoal(client, success_criteria, finalResult);
      goalMet   = eval_.met;
      evalNotes = eval_.notes;
    } else {
      goalMet = true; // no criteria = always "done" on first completion
    }

    // Update iteration count
    if (taskId) {
      await supabase.from('agent_tasks')
        .update({ current_iteration: attempt + 1 })
        .eq('id', taskId);
    }

    if (goalMet || !attemptDone) break;
  }

  // Final DB update
  if (taskId) {
    await supabase.from('agent_tasks').update({
      status:       goalMet ? 'completed' : (finalResult ? 'partial' : 'failed'),
      result:       finalResult || 'Sin respuesta del agente.',
      goal_met:     success_criteria ? goalMet : null,
      eval_notes:   evalNotes || null,
      completed_at: new Date().toISOString(),
    }).eq('id', taskId);
  }

  const agentLabel = target.agent_name || agente;
  const goalSuffix = success_criteria
    ? (goalMet ? ' [Criterio cumplido]' : ' [Criterio no cumplido]')
    : '';

  return NextResponse.json({
    results: [{
      toolCallId,
      result: `[${agentLabel}]${goalSuffix} ${finalResult || 'Tarea procesada.'}`,
    }],
  });
}
