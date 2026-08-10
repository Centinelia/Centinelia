import Anthropic from '@anthropic-ai/sdk';
import { createAdminClient } from '@/lib/supabase/admin';
import { agentInboxAddressFor } from '@/lib/email/inbox';
import { findNoxAgent } from '@/lib/ops/nox-coordinator';
import { transitionAgentTask } from '@/lib/state-machines/agent-task';
import { logLlmCall } from '@/lib/observability/llm-log';

const APP_URL        = process.env.NEXT_PUBLIC_APP_URL!;
const MAX_ITER       = 6;
const MAX_QA_CYCLES  = 2;
const TIME_BUDGET_MS = 55_000;
const QA_TIME_MIN_MS = 15_000; // minimum remaining budget to attempt a QA review

export interface AgentInfo {
  id:                   string;
  agent_name:           string | null;
  role:                 string | null;
  knowledge_base:       string | null;
  role_knowledge_base:  string | null;
  business_name:        string | null;
  portal_email?:        string | null;
}

// ── Tools available to the executing agent ─────────────────────────────────────

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
    name:        'consultar_agente',
    description: 'Consulta a un compañero del equipo para obtener información de su área de especialidad.',
    input_schema: {
      type: 'object',
      properties: {
        rol:      { type: 'string', description: 'Nombre o rol del compañero a consultar.' },
        tarea:    { type: 'string', description: 'Qué necesitas que te responda.' },
        contexto: { type: 'string', description: 'Contexto adicional. Opcional.' },
      },
      required: ['rol', 'tarea'],
    },
  },
  {
    name:        'llamar_a',
    description: 'Inicia una llamada saliente al número del cliente para entregarle información o hacer un seguimiento. Úsala cuando el cliente pidió que le llamaran de vuelta con la respuesta.',
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
    name:        'list_calendar_events',
    description: 'Consulta eventos del calendario del dueño (Google Calendar u Outlook) en un rango. Úsala para verificar disponibilidad antes de agendar.',
    input_schema: {
      type: 'object',
      properties: {
        from: { type: 'string', description: 'Inicio del rango en ISO 8601 (ej: 2026-08-11T00:00:00-06:00)' },
        to:   { type: 'string', description: 'Fin del rango en ISO 8601 (ej: 2026-08-12T00:00:00-06:00)' },
      },
      required: ['from', 'to'],
    },
  },
  {
    name:        'create_calendar_event',
    description: 'Crea un evento en el calendario del dueño. Si la reunión es por videollamada Meet y NO tienes un link propio, PASA generate_meet_link=true — el sistema crea el Meet real automáticamente y devuelve el link en el message del tool_result. Úsalo SIEMPRE que necesites un link Meet en un correo — nunca inventes URLs.',
    input_schema: {
      type: 'object',
      properties: {
        title:              { type: 'string', description: 'Título del evento' },
        start:              { type: 'string', description: 'Inicio ISO 8601 con timezone' },
        end:                { type: 'string', description: 'Fin ISO 8601 con timezone' },
        description:        { type: 'string', description: 'Descripción o notas (opcional)' },
        location:           { type: 'string', description: 'Ubicación física o link propio (opcional)' },
        attendees:          { type: 'array', items: { type: 'string' }, description: 'Correos de invitados (opcional)' },
        generate_meet_link: { type: 'boolean', description: 'true para auto-generar link Google Meet real. USA true cuando necesites Meet y no tengas link propio.' },
      },
      required: ['title', 'start', 'end'],
    },
  },
  {
    name:        'delete_calendar_event',
    description: 'Elimina o cancela un evento del calendario del dueño.',
    input_schema: {
      type: 'object',
      properties: {
        event_id: { type: 'string', description: 'ID del evento a eliminar' },
      },
      required: ['event_id'],
    },
  },
  {
    name:        'save_to_drive',
    description: 'Sube a Drive/OneDrive del dueño un archivo generado por crear_documento o create_file (que devuelve un file_id).',
    input_schema: {
      type: 'object',
      properties: {
        file_id:     { type: 'string', description: 'file_id devuelto por crear_documento/create_file' },
        filename:    { type: 'string', description: 'Nombre del archivo en Drive con extensión' },
        folder_name: { type: 'string', description: 'Carpeta destino (opcional; se crea si no existe)' },
      },
      required: ['file_id', 'filename'],
    },
  },
  {
    name:        'buscar_documento_oficina',
    description: 'Busca documentos ya generados en la Oficina (facturas, cotizaciones, propuestas, etc.). Úsala antes de generar nuevo para reutilizar existentes.',
    input_schema: {
      type: 'object',
      properties: {
        query:   { type: 'string', description: 'Texto a buscar en título, filename o folio' },
        cliente: { type: 'string', description: 'Filtro por cliente (fuzzy)' },
        limit:   { type: 'number', description: 'Máximo resultados (default 10)' },
      },
    },
  },
  {
    name:        'buscar_correo_enviado',
    description: 'Busca correos que TÚ u otro empleado hayan enviado antes desde el buzón de la empresa. Útil para ver histórico antes de dar seguimiento.',
    input_schema: {
      type: 'object',
      properties: {
        query:        { type: 'string', description: 'Texto en asunto o cuerpo (opcional)' },
        destinatario: { type: 'string', description: 'Correo destinatario para filtrar (opcional)' },
        dias:         { type: 'number', description: 'Días hacia atrás (default 30)' },
        limit:        { type: 'number', description: 'Máximo resultados (default 10)' },
      },
    },
  },
  {
    name:        'tarea_completada',
    description: 'Señala que la tarea fue completada. Llama a esta herramienta SOLO cuando hayas terminado todas las acciones necesarias.',
    input_schema: {
      type: 'object',
      properties: {
        resultado: { type: 'string', description: 'Descripción clara de lo que se hizo y el resultado obtenido.' },
      },
      required: ['resultado'],
    },
  },
];

// ── Tool executor — calls existing voice tool routes ───────────────────────────

async function executeToolOnAgent(
  toolName: string,
  toolArgs: Record<string, unknown>,
  targetAgentId: string,
): Promise<string> {
  const routeMap: Record<string, string> = {
    buscar_archivo:            'buscar-archivo',
    leer_archivo:              'leer-archivo',
    buscar_en_web:             'buscar-en-web',
    consultar_agente:          'consultar-agente',
    llamar_a:                  'llamar-a',
    enviar_correo:             'enviar-correo',
    crear_ticket:              'crear-ticket',
    crear_documento:           'crear-documento',
    buscar_documento_oficina:  'buscar-documento-oficina',
    // Tools que van al executor genérico (paridad con chat/voice cross-canal).
    // exec/<name> resuelve al mismo handler que el chat, así el behavior es
    // consistente entre delegate y chat directo.
    list_calendar_events:      'exec/list_calendar_events',
    create_calendar_event:     'exec/create_calendar_event',
    delete_calendar_event:     'exec/delete_calendar_event',
    save_to_drive:             'exec/save_to_drive',
    buscar_correo_enviado:     'exec/buscar_correo_enviado',
  };

  const routePath = routeMap[toolName];
  if (!routePath) return `Herramienta "${toolName}" no disponible en este contexto.`;

  try {
    const res = await fetch(`${APP_URL}/api/voice/tools/${routePath}?agent_id=${targetAgentId}`, {
      method:  'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(process.env.VAPI_SERVER_SECRET ? { 'x-vapi-secret': process.env.VAPI_SERVER_SECRET } : {}),
      },
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

// ── Nox QA review ──────────────────────────────────────────────────────────────
// Nox reviews the agent's completed work before it is marked as delivered.
// Returns approved=true (fail-open) if the review itself errors.

const QA_TOOLS: Anthropic.Tool[] = [
  {
    name:        'aprobar',
    description: 'El trabajo está bien hecho y listo para entregar.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name:        'rechazar',
    description: 'El trabajo tiene errores, está incompleto o no cumple con lo solicitado.',
    input_schema: {
      type: 'object',
      properties: {
        feedback: {
          type: 'string',
          description: 'Descripción específica y accionable de qué está mal y qué debe corregirse.',
        },
      },
      required: ['feedback'],
    },
  },
];

interface NoxForQA {
  agent_name:    string | null;
  business_name?: string | null;
}

async function noxQAReview(params: {
  nox:       NoxForQA;
  tarea:     string;
  contexto:  string | null;
  resultado: string;
  agentName: string;
}): Promise<{ approved: boolean; feedback: string }> {
  const { nox, tarea, contexto, resultado, agentName } = params;

  const systemPrompt = [
    `Eres ${nox.agent_name || 'Nox'}, coordinador del equipo de ${nox.business_name || 'la empresa'}.`,
    'Tu función ahora es revisar el trabajo de un compañero antes de que sea entregado.',
    '',
    'CRITERIOS DE REVISIÓN:',
    '- ¿La tarea quedó completa? ¿Se ejecutaron todas las acciones necesarias?',
    '- ¿El resultado es coherente y útil para lo que se pedía?',
    '- ¿Hay errores evidentes, información faltante o pasos omitidos?',
    '',
    'Si el trabajo cumple: llama a aprobar.',
    'Si tiene problemas claros: llama a rechazar con feedback específico y accionable.',
    'Decide con lo que tienes. No pidas más información.',
  ].join('\n');

  const userMsg = [
    `Compañero: ${agentName}`,
    contexto ? `Contexto: ${contexto}` : '',
    `Tarea solicitada: ${tarea}`,
    `\nResultado entregado:\n${resultado}`,
  ].filter(Boolean).join('\n');

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const __qaT = Date.now();
  const __qaM = 'claude-haiku-4-5-20251001';
  try {
    const resp = await client.messages.create({
      model:       __qaM,
      max_tokens:  512,
      system:      systemPrompt,
      tools:       QA_TOOLS,
      tool_choice: { type: 'any' },
      messages:    [{ role: 'user', content: userMsg }],
    });
    void logLlmCall({ source: 'task_qa_review', model: __qaM, usage: resp.usage, latencyMs: Date.now() - __qaT });

    const toolUse = resp.content.find((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use');
    if (!toolUse || toolUse.name === 'aprobar') return { approved: true, feedback: '' };

    return { approved: false, feedback: (toolUse.input as { feedback: string }).feedback };
  } catch (err) {
    void logLlmCall({ source: 'task_qa_review', model: __qaM, usage: { input_tokens: 0, output_tokens: 0 }, latencyMs: Date.now() - __qaT, error: err instanceof Error ? err.message : String(err) });
    return { approved: true, feedback: '' };
  }
}

// ── Main task executor ─────────────────────────────────────────────────────────

export async function executeTask(params: {
  taskId:      string;
  targetAgent: AgentInfo;
  callerAgent: AgentInfo | null;
  tarea:       string;
  contexto:    string | null;
}): Promise<{ success: boolean; result: string }> {
  const { taskId, targetAgent, callerAgent, tarea, contexto } = params;
  const supabase = createAdminClient();

  // Si la tarea vino de plan-then-approve, cargamos el plan aprobado y lo
  // inyectamos como guía. success_criteria también se pasa como criterio.
  const { data: taskRow } = await supabase
    .from('agent_tasks')
    .select('plan, success_criteria, plan_approved_at')
    .eq('id', taskId)
    .maybeSingle();
  const approvedPlan     = (taskRow?.plan as { steps?: { n?: number; description?: string }[]; summary?: string; success_metric?: string; owner_notes?: string | null } | null) ?? null;
  const successCriteria  = (taskRow?.success_criteria as string | null) ?? null;
  const ownerNotes       = approvedPlan?.owner_notes?.trim() || null;

  const promptLines = [
    `Eres ${targetAgent.agent_name || 'un empleado especializado'} del equipo de ${targetAgent.business_name || 'la empresa'}.`,
    targetAgent.role ? `Tu especialidad: ${targetAgent.role}.` : '',
    '',
    callerAgent
      ? `Tu compañero ${callerAgent.agent_name || 'otro empleado'} te ha asignado una tarea. Debes ejecutarla usando las herramientas disponibles.`
      : 'Se te ha asignado una tarea para ejecutar con las herramientas disponibles.',
    'Reglas:',
    '- Ejecuta la tarea directamente. No pidas confirmación.',
    '- Si necesitas información, usa buscar_archivo, leer_archivo o buscar_en_web antes de actuar.',
    '- Si algo está fuera de tu área, usa consultar_agente.',
    '- Si la tarea incluye llamar de vuelta al cliente, usa llamar_a DESPUÉS de tener la información lista.',
    '- Si la tarea incluye enviar correo Y llamar de vuelta, haz ambas acciones antes de llamar a tarea_completada.',
    '- Cuando termines TODAS las acciones necesarias, llama a tarea_completada con un resumen claro.',
    '- No llames a tarea_completada antes de haber ejecutado las acciones.',
    '- AUDITORÍA ANTES DE COMPLETAR: Antes de llamar tarea_completada, revisa contra el brief y el plan aprobado si existe. Confirma que cumples lo pedido con datos verificados. Si algo quedó incierto, dilo explícitamente en el resumen.',
    '',
    '## REGLA DURA: PROHIBIDO INVENTAR URLs',
    'Nunca inventes ni "adivines" URLs de Google Meet, Zoom, Drive, sitios web, redes sociales, o cualquier otro link. Los links que pongas en correos, docs o mensajes DEBEN venir de:',
    '  1. Una tool que te devolvió el link (ej: create_calendar_event con generate_meet_link=true → devuelve el meet_link real en el message; save_to_drive → devuelve el file URL).',
    '  2. Un dato que el dueño te dio explícitamente en el brief o en la conversación.',
    '  3. Los datos de contacto de tu empresa listados arriba (business_website).',
    'Si el brief pide incluir un link de reunión y NO tienes uno, PRIMERO invoca create_calendar_event con generate_meet_link=true para generar uno real, LUEGO redacta el correo usando ese link. NO escribas correos con links inventados tipo "meet.google.com/abc-defg-hij" — Google rechaza códigos inventados y el cliente ve error al abrir. Si de plano no puedes obtener el link real, escribe "te enviaré el link por separado" en vez de inventar uno.',
  ];

  if (approvedPlan?.steps?.length) {
    const stepsList = approvedPlan.steps.map(s => `- ${s.description ?? ''}`).filter(l => l !== '- ').join('\n');
    promptLines.push('', '## Plan aprobado por el dueño (síguelo)', approvedPlan.summary ?? '', stepsList);
  }
  // Owner notes/correcciones tienen prioridad sobre el plan — el dueño las
  // agregó al aprobar via /edit-plan sabiendo qué cambiaba respecto al plan
  // original. Van con emphasis fuerte y arriba del plan en render.
  if (ownerNotes) {
    promptLines.push('', '## ⚠️ CORRECCIONES DEL DUEÑO (obligatorias — pasan sobre el plan original)', ownerNotes);
  }
  if (successCriteria) {
    promptLines.push('', '## Criterio de éxito', `La tarea se considera completada cuando: ${successCriteria}`);
  }

  if (targetAgent.knowledge_base?.trim())
    promptLines.push('', '## Base de conocimiento', targetAgent.knowledge_base.trim());
  if (targetAgent.role_knowledge_base?.trim())
    promptLines.push('', '## Conocimiento de tu rol', targetAgent.role_knowledge_base.trim());

  // Fecha ISO actual — sin esto el modelo alucina años viejos (bug 2026-08-10:
  // Niva escribió "11 de agosto de 2025" en un correo cuando estamos en 2026).
  const nowForPrompt = new Date();
  const todayIso = nowForPrompt.toISOString().slice(0, 10);
  const todayEs  = nowForPrompt.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  promptLines.push('', '## Fecha actual', `Hoy es ${todayEs} (${todayIso}). USA este año en cualquier fecha que redactes — no repitas años pasados.`);

  // Datos de contacto de la organización — para que al redactar correos,
  // docs o firmas siempre incluya el teléfono/correo/website real de la
  // empresa en vez de sólo decir "contáctenos" (bug 2026-08-10: correo a
  // Pedro Sola sin datos de contacto de Pneuma Studio).
  if (targetAgent.portal_email) {
    const { data: orgContact } = await supabase
      .from('organizations')
      .select('business_email, business_phone, business_website, brand_address, email_footer_text')
      .eq('portal_email', targetAgent.portal_email)
      .maybeSingle();

    const contactLines: string[] = [];
    if ((orgContact as { business_email?: string | null })?.business_email)   contactLines.push(`- Correo: ${(orgContact as { business_email?: string }).business_email}`);
    if ((orgContact as { business_phone?: string | null })?.business_phone)   contactLines.push(`- Teléfono: ${(orgContact as { business_phone?: string }).business_phone}`);
    if ((orgContact as { business_website?: string | null })?.business_website) contactLines.push(`- Sitio web: ${(orgContact as { business_website?: string }).business_website}`);
    if ((orgContact as { brand_address?: string | null })?.brand_address)     contactLines.push(`- Dirección: ${(orgContact as { brand_address?: string }).brand_address}`);

    if (contactLines.length > 0) {
      promptLines.push('', '## Datos de contacto de tu empresa', 'SIEMPRE que redactes un correo, cotización, contrato o firma para un cliente, incluye estos datos al final para que puedan contactarnos:', contactLines.join('\n'));
    }

    if ((orgContact as { email_footer_text?: string | null })?.email_footer_text?.trim()) {
      promptLines.push('', '## Firma de correos por default', (orgContact as { email_footer_text: string }).email_footer_text.trim());
    }
  }

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
  const userMsg      = contexto?.trim()
    ? `Contexto: ${contexto.trim()}\n\nTarea: ${tarea}`
    : `Tarea: ${tarea}`;

  // Resolve Nox once — used for QA reviews after tarea_completada
  const nox = targetAgent.portal_email
    ? await findNoxAgent(targetAgent.portal_email).catch(() => null)
    : null;
  const noxActive = !!(nox && nox.id !== targetAgent.id);

  const client   = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const messages: Anthropic.MessageParam[] = [{ role: 'user', content: userMsg }];
  let finalResult  = '';
  let taskDone     = false;
  let qaExhausted  = false;
  let qaCycles     = 0;
  const loopStart  = Date.now();

  // Extra iterations to accommodate QA retry loops
  outer: for (let i = 0; i < MAX_ITER * (MAX_QA_CYCLES + 1); i++) {
    if (Date.now() - loopStart > TIME_BUDGET_MS) break;

    const __tetT = Date.now();
    const __tetM = 'claude-haiku-4-5-20251001';
    let response;
    try {
      response = await client.messages.create({
        model:      __tetM,
        max_tokens: 1024,
        system:     systemPrompt,
        tools:      DELEGATION_TOOLS,
        messages,
      });
      void logLlmCall({ source: 'task', model: __tetM, usage: response.usage, agentId: targetAgent.id, portalEmail: targetAgent.portal_email ?? null, latencyMs: Date.now() - __tetT, meta: { taskId, iter: i } });
    } catch (err) {
      void logLlmCall({ source: 'task', model: __tetM, usage: { input_tokens: 0, output_tokens: 0 }, agentId: targetAgent.id, portalEmail: targetAgent.portal_email ?? null, latencyMs: Date.now() - __tetT, error: err instanceof Error ? err.message : String(err), meta: { taskId, iter: i } });
      throw err;
    }

    messages.push({ role: 'assistant', content: response.content });

    if (response.stop_reason === 'end_turn') {
      const text = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map(b => b.text).join('').trim();
      finalResult = text || finalResult;
      taskDone    = true;
      break;
    }

    if (response.stop_reason !== 'tool_use') break;

    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    let hitDone = false;

    for (const block of response.content) {
      if (block.type !== 'tool_use') continue;

      if (block.name === 'tarea_completada') {
        const resultado = (block.input as { resultado: string }).resultado;

        // QA cycles exhausted — work was rejected MAX_QA_CYCLES times, fail the task
        if (noxActive && qaCycles >= MAX_QA_CYCLES) {
          finalResult  = resultado;
          qaExhausted  = true;
          hitDone      = true;
          toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: 'Trabajo no aprobado por el coordinador.' });
          break outer;
        }

        // QA: run coordinator review if available and time permits
        const timeLeft = TIME_BUDGET_MS - (Date.now() - loopStart);
        if (noxActive && timeLeft > QA_TIME_MIN_MS) {
          const review = await noxQAReview({
            nox:       nox as NoxForQA,
            tarea,
            contexto,
            resultado,
            agentName: targetAgent.agent_name ?? 'el empleado',
          });

          if (!review.approved) {
            qaCycles++;
            const noxName = nox.agent_name ?? 'el coordinador';
            // Deliver feedback inside the tool_result to keep message alternation valid
            toolResults.push({
              type:        'tool_result',
              tool_use_id: block.id,
              content: `Trabajo registrado. Sin embargo, ${noxName} lo revisó y encontró lo siguiente:\n\n${review.feedback}\n\nCorrige los problemas y vuelve a llamar a tarea_completada cuando esté listo.`,
            });
            break; // agent continues the loop with this feedback
          }
        }

        // Approved (or no coordinator / no time for QA)
        finalResult = resultado;
        taskDone    = true;
        hitDone     = true;
        toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: 'Tarea completada y aprobada.' });
        break;
      }

      const toolResult = await executeToolOnAgent(block.name, block.input as Record<string, unknown>, targetAgent.id);
      if (!hitDone) finalResult = `${block.name}: ${toolResult}`;
      toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: toolResult });
    }

    if (taskDone) break;
    messages.push({ role: 'user', content: toolResults });
  }

  const now = new Date().toISOString();
  if (taskDone) {
    await transitionAgentTask({
      supabase, taskId,
      toStatus: 'completed',
      actor:    'executor',
      reason:   'task_completed',
      metadata: { result_preview: String(finalResult ?? '').slice(0, 300) },
      extraFields: { result: finalResult, completed_at: now },
    });
    // Encola al digest diario. Kind depende de trigger_type — si vino por
    // delegar_tarea (empleado→empleado) es 'delegation_completed'; si vino
    // por otra vía (scheduler, api directa) es 'task_completed'.
    if (targetAgent.portal_email) {
      try {
        const { data: taskMeta } = await supabase
          .from('agent_tasks')
          .select('title, trigger_type')
          .eq('id', taskId)
          .maybeSingle();
        const kind = taskMeta?.trigger_type === 'delegation'
          ? 'delegation_completed' as const
          : 'task_completed' as const;
        const { queueNotificationEvent } = await import('@/lib/notifications/queue');
        await queueNotificationEvent({
          portalEmail: targetAgent.portal_email,
          agentId:     targetAgent.id,
          kind,
          urgent:      false,
          payload:     {
            title:  taskMeta?.title ?? tarea,
            result: String(finalResult ?? '').slice(0, 400),
          },
        });
      } catch (err) {
        console.error('[task-executor] queue notification failed', err);
      }
    }
  } else {
    const failReason = qaExhausted
      ? `Rechazado por el coordinador tras ${MAX_QA_CYCLES} intentos. Último entregable guardado.`
      : (finalResult || 'Sin respuesta del empleado.');
    await transitionAgentTask({
      supabase, taskId,
      toStatus: 'failed',
      actor:    'executor',
      reason:   qaExhausted ? 'qa_cycles_exhausted' : 'no_completion',
      metadata: { qa_exhausted: qaExhausted, cycles: MAX_QA_CYCLES },
      extraFields: { result: failReason },
    });
  }

  return { success: taskDone, result: finalResult };
}
