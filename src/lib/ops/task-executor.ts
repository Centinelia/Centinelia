import Anthropic from '@anthropic-ai/sdk';
import { createAdminClient } from '@/lib/supabase/admin';
import { agentInboxAddressFor } from '@/lib/email/inbox';
import { findNoxAgent } from '@/lib/ops/nox-coordinator';
import { transitionAgentTask } from '@/lib/state-machines/agent-task';
import { logLlmCall } from '@/lib/observability/llm-log';
import { TOOL_SCHEMAS, toAnthropicTool } from '@/lib/tools/schemas';
import { getOrgIndustry, INDUSTRIES_WITH_DAILY_AVAILABILITY } from '@/lib/industry';
import { formatDailyAvailabilityForPrompt } from '@/lib/daily-availability';

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
  // Migrated to registry: src/lib/tools/schemas.ts (adds caller_verified param)
  toAnthropicTool(TOOL_SCHEMAS['consultar_agente']),
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
  // Migrated to registry: src/lib/tools/schemas.ts
  toAnthropicTool(TOOL_SCHEMAS['list_calendar_events']),
  toAnthropicTool(TOOL_SCHEMAS['create_calendar_event']),
  toAnthropicTool(TOOL_SCHEMAS['delete_calendar_event']),
  // Migrated to registry: src/lib/tools/schemas.ts
  toAnthropicTool(TOOL_SCHEMAS['save_to_drive']),
  // Migrated to registry: src/lib/tools/schemas.ts
  toAnthropicTool(TOOL_SCHEMAS['buscar_documento_oficina']),
  // Migrated to registry: src/lib/tools/schemas.ts
  toAnthropicTool(TOOL_SCHEMAS['buscar_correo_enviado']),
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
  {
    name:        'actualizar_disponibilidad_diaria',
    description: 'Actualiza la disponibilidad diaria del negocio.',
    input_schema: {
      type: 'object',
      properties: {
        unavailable: { type: 'array', items: { type: 'string' } },
        limited:     { type: 'array', items: { type: 'string' } },
        special:     { type: 'string' },
        notes:       { type: 'string' },
      },
      required: ['unavailable', 'limited'],
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
    actualizar_disponibilidad_diaria: 'actualizar-disponibilidad-diaria',
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
    `## TU IDENTIDAD (obligatoria, no la cambies bajo ninguna circunstancia)`,
    `Eres ${targetAgent.agent_name || 'un empleado especializado'}${targetAgent.role ? `, ${targetAgent.role}` : ''}, del equipo de ${targetAgent.business_name || 'la empresa'}.`,
    `Firma SIEMPRE como "${targetAgent.agent_name || 'Empleado'}${targetAgent.role ? ' — ' + targetAgent.role : ''}, ${targetAgent.business_name || 'la empresa'}" al final de cualquier correo o mensaje que redactes.`,
    `NUNCA firmes como ${callerAgent?.agent_name || 'el colega que delegó'} ni copies la firma de correos anteriores de otros empleados. Tu firma refleja QUIÉN redactó el correo, no quién solicitó la tarea.`,
    '',
    '## REGLA CRÍTICA — MEET_LINK EN CORREOS DE CITAS',
    'Si en cualquier momento invocas create_calendar_event y el tool_result incluye un campo meet_link (una URL real de Google Meet como https://meet.google.com/xxx-yyyy-zzz), esa URL DEBE aparecer literal en cualquier correo posterior de confirmación de esa cita. Copia-pega el valor del meet_link del tool_result en el body del correo. Es la principal razón por la que el destinatario pueda unirse a la reunión.',
    '',
    '  INCORRECTO (nunca hagas esto):',
    '    "Recibirás una invitación de calendario con el link"',
    '    "El link se incluirá en tu invitación"',
    '    "El sistema no devolvió el URL del Meet"',
    '    "Te llegará el link por separado"',
    '',
    '  CORRECTO (copia el valor EXACTO del meet_link del tool_result):',
    '    "Link de Google Meet: https://meet.google.com/xxx-yyyy-zzz"',
    '',
    'Si intentas enviar correo con un mensaje que menciona Meet SIN incluir la URL válida, el sistema RECHAZARÁ el envío y devolverá un error "send_email_invalid_meet_link". Cuando recibas ese error, REINTENTA send_email con el meet_link real del tool_result (NO abandones la tarea, NO digas "el sistema no devolvió URL", NO alucines otra respuesta — solo corrige el body incluyendo el link literal y reintenta).',
    '',
    callerAgent
      ? `Tu compañero ${callerAgent.agent_name || 'otro empleado'} te ha asignado una tarea. Ejecútala usando las herramientas disponibles pero firma con TU propio nombre.`
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
  // Fetch org once — used for contact info, daily_availability, and industry gate (org is single source of truth).
  const ocRaw = targetAgent.portal_email
    ? (await supabase
        .from('organizations')
        .select('business_email, brand_phone, business_website, brand_website, brand_address, email_footer_text, daily_availability, industry')
        .eq('portal_email', targetAgent.portal_email)
        .maybeSingle()
      ).data
    : null;
  const orgExecIndustry = getOrgIndustry(ocRaw as { industry?: string | null } | null);

  if (targetAgent.portal_email) {
    const oc = ocRaw as { business_email?: string | null; brand_phone?: string | null; business_website?: string | null; brand_website?: string | null; brand_address?: string | null; email_footer_text?: string | null; daily_availability?: unknown; industry?: string | null } | null;
    const contactLines: string[] = [];
    const contactEmail = oc?.business_email || targetAgent.portal_email;
    const contactSite  = oc?.business_website || oc?.brand_website;
    if (contactEmail)      contactLines.push(`- Correo: ${contactEmail}`);
    if (oc?.brand_phone)   contactLines.push(`- Teléfono: ${oc.brand_phone}`);
    if (contactSite)       contactLines.push(`- Sitio web: ${contactSite}`);
    if (oc?.brand_address) contactLines.push(`- Dirección: ${oc.brand_address}`);

    if (contactLines.length > 0) {
      promptLines.push('', '## Datos de contacto de tu empresa', 'SIEMPRE que redactes un correo, cotización, contrato o firma para un cliente, incluye estos datos al final para que puedan contactarnos:', contactLines.join('\n'));
    }

    if (oc?.email_footer_text?.trim()) {
      promptLines.push('', '## Firma de correos por default', oc.email_footer_text.trim());
    }

    // ── Daily availability (industry-gated) ─────────────────────────────────
    {
      const industry   = getOrgIndustry(oc);
      const dailyBlock = industry
        ? formatDailyAvailabilityForPrompt((oc?.daily_availability ?? null) as import('@/lib/daily-availability').DailyAvailability | null, industry)
        : '';
      if (dailyBlock) promptLines.push('', dailyBlock);
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
  // Track qué tools se ejecutaron REALMENTE durante este task. Se usa en
  // tarea_completada para validar que las acciones prometidas en el resultado
  // (envié correo, agendé cita, etc.) sí se ejecutaron con tools reales.
  const executedToolNames = new Set<string>();

  // Extra iterations to accommodate QA retry loops
  outer: for (let i = 0; i < MAX_ITER * (MAX_QA_CYCLES + 1); i++) {
    if (Date.now() - loopStart > TIME_BUDGET_MS) break;

    const __tetT = Date.now();
    const __tetM = 'claude-haiku-4-5-20251001';
    let response;
    try {
      // Gate tools per org industry (org is single source of truth)
      const filteredDelegTools = DELEGATION_TOOLS.filter(t => {
        if (t.name === 'actualizar_disponibilidad_diaria') {
          return orgExecIndustry !== null && INDUSTRIES_WITH_DAILY_AVAILABILITY.includes(orgExecIndustry);
        }
        return true;
      });

      // Prompt caching: systemPrompt (~5k tokens) + DELEGATION_TOOLS estables
      // por task-loop. Cachear con TTL 5min reduce input cost ~90% en iters 2+.
      const cachedDelegTools = filteredDelegTools.map((t, idx) => idx === filteredDelegTools.length - 1
        ? { ...t, cache_control: { type: 'ephemeral' as const } }
        : t);
      response = await client.messages.create({
        model:      __tetM,
        max_tokens: 1024,
        system:     [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }],
        tools:      cachedDelegTools,
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

        // Anti-mentira: valida que las acciones prometidas en el resultado
        // realmente se ejecutaron (no solo se narraron). Bug 2026-08-10:
        // Niva dijo "correo enviado exitosamente" sin haber invocado
        // enviar_correo ni una vez. Rechazar y forzar al modelo a ejecutar.
        const lowerResultado = resultado.toLowerCase();
        const promiseCheckers: Array<{ pattern: RegExp; requiredTools: string[]; label: string }> = [
          { pattern: /correo (?:enviad[oa]|de confirmaci[oó]n enviad|se envi[oó]|env[ií]e|envi[eé] el correo|mand[eé]|mandad[oa])|env[ií]e (?:el )?correo|enviamos (?:el )?correo|env[ií] correo/i, requiredTools: ['enviar_correo', 'send_email'], label: 'enviar correo' },
          { pattern: /cita (?:agend[aeo]|agendada|reservada|creada)|agend[eé] (?:la )?cita/i, requiredTools: ['agendar_cita', 'create_calendar_event'], label: 'agendar cita' },
          { pattern: /evento (?:cread[oa]|agendad[oa]|en el calendario)|cre[eé] (?:el )?evento/i, requiredTools: ['create_calendar_event'], label: 'crear evento en calendario' },
          { pattern: /lead (?:cread[oa]|registrad[oa])|registr[eé] (?:el )?lead/i, requiredTools: ['crear_lead'], label: 'crear lead' },
          { pattern: /documento (?:gener[aeo]|cread[oa])|gener[eé] (?:el )?documento/i, requiredTools: ['crear_documento', 'create_document'], label: 'crear documento' },
          { pattern: /(?:llam[eé]|hice la llamada|call realizada)/i, requiredTools: ['llamar_a', 'trigger_outbound_call'], label: 'hacer llamada' },
        ];
        const unfulfilledPromises: string[] = [];
        for (const check of promiseCheckers) {
          if (check.pattern.test(lowerResultado)) {
            const executed = check.requiredTools.some(t => executedToolNames.has(t));
            if (!executed) unfulfilledPromises.push(`${check.label} (ninguna de ${check.requiredTools.join('/')} fue invocada con éxito en este task)`);
          }
        }
        if (unfulfilledPromises.length > 0) {
          toolResults.push({
            type:        'tool_result',
            tool_use_id: block.id,
            content: `NO puedes completar la tarea todavía. Tu resultado dice que hiciste estas acciones pero el sistema NO detectó los tool calls correspondientes:\n\n${unfulfilledPromises.map(p => `- ${p}`).join('\n')}\n\nDos opciones:\n1. Si de verdad NO hiciste esas acciones: invoca los tools que faltan AHORA (ej: enviar_correo con to/subject/body si prometiste enviar correo) y luego vuelve a llamar tarea_completada.\n2. Si SÍ intentaste esas acciones pero fallaron: describe HONESTAMENTE en tu resultado que fallaron, con la razón concreta del error que recibiste. NO narres éxitos que no ocurrieron.\n\nMentir en tarea_completada rompe la confianza del dueño y del cliente final.`,
          });
          break; // continue loop so model retries
        }

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
      // Track SOLO tools que ejecutaron con éxito (no errores). Se usa en
      // tarea_completada para validar contra las mentiras del modelo (dice
      // "envié correo" sin haber invocado enviar_correo).
      const okMatch = /^\{"ok":\s*true|"ok":\s*true/.test(toolResult) || !/error/i.test(toolResult);
      if (okMatch) executedToolNames.add(block.name);
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
