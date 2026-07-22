import Anthropic from '@anthropic-ai/sdk';
import { createAdminClient } from '@/lib/supabase/admin';
import { agentInboxAddressFor } from '@/lib/email/inbox';

const APP_URL        = process.env.NEXT_PUBLIC_APP_URL!;
const MAX_ITER       = 6;
const TIME_BUDGET_MS = 55_000;

export interface AgentInfo {
  id:                   string;
  agent_name:           string | null;
  role:                 string | null;
  knowledge_base:       string | null;
  role_knowledge_base:  string | null;
  business_name:        string | null;
  portal_email?:        string | null;
}

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
    description: 'Genera un documento y lo envía al correo del dueño.',
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
        resultado: { type: 'string', description: 'Descripción de lo que se hizo y el resultado obtenido.' },
      },
      required: ['resultado'],
    },
  },
];

async function executeToolOnAgent(
  toolName: string,
  toolArgs: Record<string, unknown>,
  targetAgentId: string,
): Promise<string> {
  const routeMap: Record<string, string> = {
    enviar_correo:   'enviar-correo',
    crear_ticket:    'crear-ticket',
    crear_documento: 'crear-documento',
  };

  const routePath = routeMap[toolName];
  if (!routePath) return `Herramienta "${toolName}" no disponible en este contexto.`;

  try {
    const res = await fetch(`${APP_URL}/api/voice/tools/${routePath}?agent_id=${targetAgentId}`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        toolCallList: [{
          id:   `queue_${Date.now()}`,
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

export async function executeTask(params: {
  taskId:      string;
  targetAgent: AgentInfo;
  callerAgent: AgentInfo | null;
  tarea:       string;
  contexto:    string | null;
}): Promise<{ success: boolean; result: string }> {
  const { taskId, targetAgent, callerAgent, tarea, contexto } = params;
  const supabase = createAdminClient();

  const promptLines = [
    `Eres ${targetAgent.agent_name || 'un empleado especializado'} del equipo de ${targetAgent.business_name || 'la empresa'}.`,
    targetAgent.role ? `Tu especialidad: ${targetAgent.role}.` : '',
    '',
    callerAgent
      ? `Tu compañero ${callerAgent.agent_name || 'otro empleado'} te ha asignado una tarea. Debes ejecutarla usando las herramientas disponibles.`
      : 'Se te ha asignado una tarea para ejecutar con las herramientas disponibles.',
    'Reglas:',
    '- Ejecuta la tarea directamente. No pidas confirmación.',
    '- Si necesitas información que no tienes, usa lo que más se aproxime al contexto.',
    '- Cuando termines TODAS las acciones necesarias, llama a tarea_completada con un resumen claro.',
    '- No llames a tarea_completada antes de haber ejecutado las acciones.',
  ];

  if (targetAgent.knowledge_base?.trim()) {
    promptLines.push('', '## Base de conocimiento', targetAgent.knowledge_base.trim());
  }
  if (targetAgent.role_knowledge_base?.trim()) {
    promptLines.push('', '## Conocimiento de tu rol', targetAgent.role_knowledge_base.trim());
  }

  // Build sibling directory so agents can email each other
  if (targetAgent.portal_email) {
    const { data: siblings } = await supabase
      .from('voice_agents')
      .select('id, agent_name, role')
      .eq('portal_email', targetAgent.portal_email)
      .eq('active', true)
      .neq('id', targetAgent.id);

    if (siblings?.length) {
      const directory = siblings
        .map(s => `- ${s.agent_name ?? 'Compañero'}${s.role ? ` (${s.role})` : ''}: ${agentInboxAddressFor(s.id)}`)
        .join('\n');
      promptLines.push('', '## Correos de tus compañeros de equipo', directory);
      promptLines.push('Puedes usar enviar_correo para comunicarte con ellos directamente.');
    }
  }

  const systemPrompt = promptLines.filter(Boolean).join('\n');
  const userMsg = contexto?.trim()
    ? `Contexto: ${contexto.trim()}\n\nTarea: ${tarea}`
    : `Tarea: ${tarea}`;

  const client   = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const messages: Anthropic.MessageParam[] = [{ role: 'user', content: userMsg }];
  let finalResult  = '';
  let taskDone     = false;
  const loopStart  = Date.now();

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

    if (response.stop_reason === 'end_turn') {
      const text = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map(b => b.text).join('').trim();
      finalResult = text || finalResult;
      break;
    }

    if (response.stop_reason !== 'tool_use') break;

    const toolResults: Anthropic.ToolResultBlockParam[] = [];

    for (const block of response.content) {
      if (block.type !== 'tool_use') continue;

      if (block.name === 'tarea_completada') {
        finalResult = (block.input as { resultado: string }).resultado;
        taskDone    = true;
        toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: 'Tarea marcada como completada.' });
        break;
      }

      const toolResult = await executeToolOnAgent(block.name, block.input as Record<string, unknown>, targetAgent.id);
      finalResult = `${block.name}: ${toolResult}`;
      toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: toolResult });
    }

    if (taskDone) break;
    messages.push({ role: 'user', content: toolResults });
  }

  const now = new Date().toISOString();
  if (taskDone) {
    await supabase
      .from('agent_tasks')
      .update({ status: 'completed', result: finalResult, completed_at: now })
      .eq('id', taskId);
  } else {
    await supabase
      .from('agent_tasks')
      .update({ status: 'failed', result: finalResult || 'Sin respuesta del empleado.' })
      .eq('id', taskId);
  }

  return { success: taskDone, result: finalResult };
}
