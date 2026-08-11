import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createAdminClient } from '@/lib/supabase/admin';
import { TOOL_SCHEMAS, toAnthropicTool } from '@/lib/tools/schemas';
import { requireVapiAuth } from '@/lib/vapi/auth';
import {
  requiresPlanApproval, generateTaskPlan, generatePlanApprovalToken, orgAutoApprovesPlans, orgAlwaysRequiresApproval,
} from '@/lib/ops/task-plan';
import { planApprovalEmailHtml } from '@/lib/ops/task-plan-email';
import { sendEmail } from '@/lib/email/send';
import { traceVoiceCall } from '@/lib/observability/voice-trace';
import { createAgentTask, transitionAgentTask } from '@/lib/state-machines/agent-task';
import { logLlmCall } from '@/lib/observability/llm-log';

export const dynamic = 'force-dynamic';

type SiblingAgent = {
  id: string;
  agent_name: string | null;
  role: string | null;
  role_knowledge_base: string | null;
  transfer_whatsapp: string | null;
  portal_email: string;
  portal_token: string | null;
  features:    Record<string, unknown> | null;
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
    description: 'Envía un correo electrónico directamente. Úsala solo cuando ya sepas qué escribir y a quién. Si el correo es delicado o el destinatario no está claro, prefiere pedir información primero. Si el contexto de la delegación menciona un archivo del Drive (file_id, storage_path o similar) que debe adjuntarse, DEBES incluirlo con attachment_file_id, attachment_file_name y attachment_mime_type. Sin esos campos el correo va sin adjunto.',
    input_schema: {
      type: 'object',
      properties: {
        to:      { type: 'string', description: 'Dirección de correo del destinatario' },
        subject: { type: 'string', description: 'Asunto del correo' },
        body:    { type: 'string', description: 'Cuerpo del correo en texto plano' },
        attachment_file_id:   { type: 'string', description: 'ID del archivo de Drive a adjuntar. Obligatorio si la tarea pide "envía este archivo".' },
        attachment_file_name: { type: 'string', description: 'Nombre del archivo tal como aparecerá en el correo. Obligatorio si mandas attachment_file_id.' },
        attachment_mime_type: { type: 'string', description: 'Tipo MIME del archivo (ej: application/pdf). Obligatorio si mandas attachment_file_id.' },
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
    name:        'extraer_voz_del_cliente',
    description: 'Analiza conversaciones reales de esta organización y extrae lenguaje del cliente, objeciones frecuentes y candidatos de titular. Útil cuando la tarea pide entender qué dicen los clientes o preparar copy con sus palabras.',
    input_schema: {
      type: 'object',
      properties: {
        fuente:       { type: 'string', enum: ['calls','emails','tickets','all'], description: 'Canal a analizar. Default "all".' },
        dias:         { type: 'number', description: 'Días hacia atrás. Default 30.' },
        min_muestras: { type: 'number', description: 'Mínimo de muestras. Default 20.' },
      },
      required: [],
    },
  },
  {
    name:        'solicitar_factura',
    description: 'Levanta una solicitud de factura fiscal (CFDI) para el equipo humano. Genera fila en factura_requests y notifica por correo al equipo de facturación. Usa esta herramienta cuando la delegación incluye "generar factura" o "facturar" con los datos fiscales completos del cliente.',
    input_schema: {
      type: 'object',
      properties: {
        cliente_nombre:   { type: 'string', description: 'Razón social o nombre completo del receptor.' },
        cliente_rfc:      { type: 'string', description: 'RFC del receptor (12-13 caracteres).' },
        cliente_email:    { type: 'string', description: 'Correo donde llegará el CFDI.' },
        cliente_telefono: { type: 'string', description: 'Teléfono del cliente (opcional).' },
        uso_cfdi:         { type: 'string', description: 'Uso CFDI SAT (ej: G03 gastos generales, G01 mercancías, P01 por definir).' },
        forma_pago:       { type: 'string', description: 'Forma de pago SAT (ej: 01 efectivo, 03 transferencia, 04 tarjeta crédito).' },
        metodo_pago:      { type: 'string', enum: ['PUE','PPD'], description: 'PUE=contado, PPD=parcialidades/crédito.' },
        condiciones_pago: { type: 'string', description: 'Condiciones textuales opcionales (ej. Crédito 30 días).' },
        items: {
          type: 'array',
          description: 'Conceptos a facturar (descripcion, cantidad, precio_unitario en MXN sin IVA).',
          items: {
            type: 'object',
            properties: {
              descripcion:     { type: 'string' },
              cantidad:        { type: 'number' },
              precio_unitario: { type: 'number' },
              unidad:          { type: 'string' },
            },
            required: ['descripcion','cantidad','precio_unitario'],
          },
        },
        incluir_iva: { type: 'boolean', description: 'Incluir IVA 16%. Default true.' },
        notes:       { type: 'string', description: 'Notas internas para el equipo de facturación.' },
      },
      required: ['cliente_nombre','cliente_rfc','cliente_email','uso_cfdi','forma_pago','metodo_pago','items'],
    },
  },
  // Migrated to registry: src/lib/tools/schemas.ts (calendar + drive + search).
  // Sin estas, meerkats delegados no podían agendar reuniones con Meet real
  // (bug 2026-08-10: Niva delegada por Sofia dijo "no tengo Google Calendar API"
  // porque este DELEGATION_TOOLS no incluía create_calendar_event).
  toAnthropicTool(TOOL_SCHEMAS['list_calendar_events']),
  toAnthropicTool(TOOL_SCHEMAS['create_calendar_event']),
  toAnthropicTool(TOOL_SCHEMAS['delete_calendar_event']),
  toAnthropicTool(TOOL_SCHEMAS['save_to_drive']),
  toAnthropicTool(TOOL_SCHEMAS['buscar_documento_oficina']),
  toAnthropicTool(TOOL_SCHEMAS['buscar_correo_enviado']),
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
    buscar_archivo:            'buscar-archivo',
    leer_archivo:              'leer-archivo',
    buscar_en_web:             'buscar-en-web',
    enviar_correo:             'enviar-correo',
    llamar_a:                  'llamar-a',
    crear_ticket:              'crear-ticket',
    crear_documento:           'crear-documento',
    extraer_voz_del_cliente:   'extraer-voz-del-cliente',
    solicitar_factura:         'solicitar-factura',
    // Registry-migrated tools van al executor genérico exec/<name> (paridad
    // con chat: mismo handler, mismo behavior). Incluye calendar + drive +
    // search para que meerkats delegados puedan agendar Meet real, guardar
    // en Drive, buscar docs/correos previos.
    list_calendar_events:      'exec/list_calendar_events',
    create_calendar_event:     'exec/create_calendar_event',
    delete_calendar_event:     'exec/delete_calendar_event',
    save_to_drive:             'exec/save_to_drive',
    buscar_documento_oficina:  'buscar-documento-oficina',
    buscar_correo_enviado:     'exec/buscar_correo_enviado',
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
    // Compat: routes de voz devuelven { results: [{result}] } (formato Vapi),
    // pero algunas legacy como buscar-archivo devuelven { result: "..." } directo.
    // Aceptamos ambos formatos para no perder el output real del tool.
    const data = await res.json() as { results?: Array<{ result: string }>; result?: string };
    const out = data.results?.[0]?.result ?? data.result ?? null;
    return out ?? 'Acción ejecutada sin respuesta.';
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
  const __t = Date.now();
  const __m = 'claude-sonnet-4-6';
  let evalMsg;
  try {
    evalMsg = await client.messages.create({
      model:      __m,
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
    void logLlmCall({ source: 'delegate_goal_eval', model: __m, usage: evalMsg.usage, latencyMs: Date.now() - __t });
  } catch (err) {
    void logLlmCall({ source: 'delegate_goal_eval', model: __m, usage: { input_tokens: 0, output_tokens: 0 }, latencyMs: Date.now() - __t, error: err instanceof Error ? err.message : String(err) });
    throw err;
  }

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
    caller_verified,
  } = args as {
    agente:            string;
    tarea:             string;
    contexto?:         string;
    success_criteria?: string;
    max_iterations?:   number;
    caller_verified?:  boolean;
  };

  // Default false — si el agente que delega no declaró explícitamente que el
  // llamante está verificado, asumimos que NO lo está (defensa en capas).
  const isCallerVerified = caller_verified === true;

  const startedAt = Date.now();
  const sessionId = (((body.message as Record<string, unknown> | undefined)?.call as Record<string, unknown> | undefined)?.id as string) ?? null;
  const traceInput = { agente, tarea, contexto, success_criteria, max_iterations, caller_verified: isCallerVerified };

  const fail = (msg: string) => {
    traceVoiceCall({ toolName: 'delegar_tarea', agentId, sessionId, input: traceInput, result: { ok: false, error: msg }, startedAt });
    return NextResponse.json({ results: [{ toolCallId, result: msg }] });
  };

  if (!agente || !tarea) return fail('Parámetros insuficientes para delegar la tarea.');

  const goalIter   = success_criteria ? Math.min(max_iterations ?? DEFAULT_GOAL_ITER, 5) : 1;
  const supabase   = createAdminClient();

  // Get calling agent
  const { data: caller } = await supabase
    .from('voice_agents')
    .select('portal_email, agent_name, business_name, features')
    .eq('id', agentId)
    .single();

  if (!caller?.portal_email) return fail('No se pudo identificar al agente que delega.');

  const callerMeerkat = ((caller.features as Record<string, unknown> | null)?.meerkat_role_id as string | null) ?? 'unknown';

  // Find sibling agents. knowledge_base es org-level (commit e372013 lo movio
  // a organizations), lo hidratamos aparte abajo.
  const { data: siblings, error: siblingsErr } = await supabase
    .from('voice_agents')
    .select('id, agent_name, role, role_knowledge_base, transfer_whatsapp, portal_email, portal_token, features')
    .eq('portal_email', caller.portal_email)
    .eq('active', true)
    .neq('id', agentId);

  if (siblingsErr) {
    console.error('delegar-tarea: siblings query error', siblingsErr);
    return fail('No se pudo cargar el equipo. Intenta de nuevo en un momento.');
  }
  if (!siblings?.length) return fail('No hay otros agentes disponibles en el equipo.');

  // Fuzzy match del nombre/rol contra el equipo. Threshold >=2 evita matches
  // silenciosos a agentes de nombre parecido pero incorrecto (bug 2026-08-10:
  // Sofia delegó a "Nova" que no existe en Pneuma; el sistema matcheó a Niva
  // sin avisar. Ahora falla explícito listando el equipo real).
  const scored = siblings
    .map(s => ({ s, score: matchScore(agente, s) }))
    .sort((a, b) => b.score - a.score);
  const bestScore = scored[0]?.score ?? 0;
  if (bestScore < 2) {
    const teamList = siblings
      .map(s => `${s.agent_name}${s.role ? ` (${s.role})` : ''}`)
      .join(', ');
    return fail(`No encontré a "${agente}" en tu equipo. Los meerkats disponibles son: ${teamList}. Vuelve a llamar delegar_tarea con el nombre exacto de uno.`);
  }
  const target = scored[0].s as SiblingAgent;

  const targetMeerkat = ((target.features as Record<string, unknown> | null)?.meerkat_role_id as string | null) ?? 'unknown';

  // Handoff DAG check
  const { isHandoffAllowed, recordMeerkatHandoff } = await import('@/lib/handoffs/dag');
  const gate = await isHandoffAllowed({
    supabase, fromMeerkat: callerMeerkat, toMeerkat: targetMeerkat,
    tool: 'delegar_tarea', portalEmail: caller.portal_email,
  });
  if (!gate.allowed) {
    recordMeerkatHandoff({
      supabase, portalEmail: caller.portal_email,
      fromMeerkat: callerMeerkat, toMeerkat: targetMeerkat,
      tool: 'delegar_tarea', fromAgentId: agentId, toAgentId: target.id,
      taskSummary: tarea, outcome: 'rejected',
      metadata: { reason: gate.reason ?? 'edge_disabled' },
    });
    return fail(`Este canal de delegación está deshabilitado por configuración: ${gate.reason ?? 'edge disabled'}.`);
  }

  // Hidrata knowledge_base org-level. client_email vive en voice_agents;
  // usamos el portal_email como fallback confiable para el correo del dueño.
  const { data: orgRow } = await supabase
    .from('organizations')
    .select('knowledge_base, business_email, brand_phone, business_website, brand_website, brand_address, email_footer_text')
    .eq('portal_email', caller.portal_email)
    .maybeSingle();
  const orgKb    = (orgRow?.knowledge_base as string | null) ?? null;
  const orgContactRow = orgRow as {
    business_email?:    string | null;
    brand_phone?:       string | null;
    business_website?:  string | null;
    brand_website?:     string | null;
    brand_address?:     string | null;
    email_footer_text?: string | null;
  } | null;
  const ownerEmail = caller.portal_email;

  // ── Plan-then-approve gate ────────────────────────────────────────────────
  // Precedence:
  //   auto_approve_task_plans = true  → SIEMPRE skip approval (auto-ejecuta)
  //   always_approve_delegations = true → SIEMPRE requiere approval (verdadero modo supervisado)
  //   default → aplica thresholds de requiresPlanApproval (tamaño/keywords)
  const orgAutoApproves = await orgAutoApprovesPlans(caller.portal_email, supabase);
  const orgAlwaysNeeds  = await orgAlwaysRequiresApproval(caller.portal_email, supabase);
  const needsApproval = !orgAutoApproves && (orgAlwaysNeeds || requiresPlanApproval({ tarea, success_criteria, max_iterations }));

  if (needsApproval) {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    let plan;
    try {
      plan = await generateTaskPlan({
        client,
        tarea,
        contexto,
        success_criteria,
        businessName:    caller.business_name ?? 'la organización',
        targetAgentName: target.agent_name ?? 'el especialista',
        targetRole:      target.role,
      });
    } catch (err) {
      console.error('delegar-tarea: plan generation failed', err);
      return fail('No pude generar el plan para aprobación. Intenta de nuevo o simplifica la tarea.');
    }

    const approvalToken = generatePlanApprovalToken();
    const created = await createAgentTask({
      supabase,
      portalEmail:       caller.portal_email,
      createdBy:         agentId || null,
      assignedTo:        target.id,
      title:             tarea,
      description:       contexto?.trim() || null,
      triggerType:       'delegation',
      sourceContext:     contexto?.trim() || null,
      initialStatus:     'awaiting_plan_approval',
      successCriteria:   success_criteria || null,
      maxIterations:     goalIter,
      plan,
      planApprovalToken: approvalToken,
      actor:             agentId ? `agent:${agentId}` : 'system',
      reason:            'delegation_created_needs_approval',
    });

    const pendingId = created.ok ? created.taskId : undefined;
    if (!pendingId) return fail('No se pudo guardar el plan.');

    const appUrl     = process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.centinelia.mx';
    const approveUrl = `${appUrl}/api/portal/agent-tasks/${pendingId}/approve-plan?token=${approvalToken}`;
    const editUrl    = `${appUrl}/api/portal/agent-tasks/${pendingId}/edit-plan?token=${approvalToken}`;
    const rejectUrl  = `${appUrl}/api/portal/agent-tasks/${pendingId}/approve-plan?token=${approvalToken}&reject=1`;

    // Email de aprobación en fire-and-forget para no bloquear el return a Vapi
    // (evita timeouts de 30s en el tool call). Si el email falla, la tarea sigue
    // visible en el portal en Tareas → aprobaciones pendientes.
    if (ownerEmail) {
      void (async () => {
        try {
          const { resolveMeerkatFromAgent } = await import('@/lib/email/meerkat-identity');
          const targetMeerkat = resolveMeerkatFromAgent({
            agent_name:    target.agent_name,
            business_name: caller.business_name,
            features:      target.features as Record<string, unknown> | null,
          });
          await sendEmail({
            to:      ownerEmail,
            subject: `${target.agent_name ?? 'Tu empleado'} pide tu aprobación: ${tarea.slice(0, 60)}`,
            html:    planApprovalEmailHtml({
              businessName:  caller.business_name ?? '',
              targetAgent:   target.agent_name ?? 'Empleado',
              targetMeerkat,
              callerAgent:   caller.agent_name,
              plan,
              approveUrl,
              editUrl,
              rejectUrl,
              taskTitle:     tarea,
            }),
          });
        } catch (err) {
          console.error('delegar-tarea: approval email send failed', err);
        }
      })();
    }

    traceVoiceCall({
      toolName: 'delegar_tarea', agentId, sessionId, input: traceInput,
      result:   { ok: true, awaiting_approval: true, pending_task_id: pendingId },
      startedAt,
      meta:     { target_agent: target.agent_name, target_id: target.id, stage: 'plan_awaiting_approval' },
    });
    recordMeerkatHandoff({
      supabase, portalEmail: caller.portal_email,
      fromMeerkat: callerMeerkat, toMeerkat: targetMeerkat,
      tool: 'delegar_tarea', fromAgentId: agentId, toAgentId: target.id,
      taskSummary: tarea, outcome: 'success',
      agentTaskId: pendingId ?? null,
      metadata: { stage: 'awaiting_approval', session_id: sessionId },
    });
    return NextResponse.json({
      results: [{
        toolCallId,
        result: `[${target.agent_name ?? agente}] Le mandé el plan al dueño para que lo apruebe. En cuanto lo apruebe empiezo a ejecutar. Puedes seguirlo en el portal.`,
      }],
    });
  }

  // Build target agent system prompt
  const promptLines = [
    `## TU IDENTIDAD (obligatoria, no la cambies bajo ninguna circunstancia)`,
    `Eres ${target.agent_name || 'un agente especializado'}${target.role ? `, ${target.role}` : ''}, del equipo de ${caller.business_name}.`,
    `Firma SIEMPRE como "${target.agent_name || 'Agente'}${target.role ? ' — ' + target.role : ''}, ${caller.business_name}" al final de cualquier correo o mensaje que redactes.`,
    `NUNCA firmes como ${caller.agent_name || 'tu colega que delegó'} ni copies la firma de correos anteriores de otros empleados. Tu firma refleja QUIÉN redactó el correo, no quién solicitó la tarea.`,
    '',
    `Un colega (${caller.agent_name || 'otro agente'}) te delegó una tarea. Ejecútala usando tus herramientas, pero firma con tu propio nombre.`,
    '',
    '## REGLA CRÍTICA — MEET_LINK EN CORREOS DE CITAS',
    'Si en cualquier momento invocas create_calendar_event y el tool_result incluye un campo meet_link (una URL real de Google Meet como https://meet.google.com/xxx-yyyy-zzz), esa URL DEBE aparecer literal en cualquier correo posterior de confirmación de esa cita. Copia-pega el valor del meet_link del tool_result en el body del correo. Es la principal razón por la que el destinatario pueda unirse a la reunión.',
    '',
    '  INCORRECTO (nunca hagas esto, aunque suene profesional):',
    '    "Recibirás una invitación de calendario con el link"',
    '    "El link se incluirá en tu invitación"',
    '    "Te llegará el link por separado"',
    '',
    '  CORRECTO (haz esto siempre que tengas meet_link del tool_result):',
    '    "Link de Google Meet: https://meet.google.com/xxx-yyyy-zzz"',
    '    (copiando el valor EXACTO del meet_link del tool_result — no un placeholder)',
    '',
    'Si create_calendar_event NO devolvió meet_link (falla o no se pidió generar), entonces sí puedes decir "el link te llegará en la invitación". Pero si SÍ lo tienes, incluirlo literal es obligatorio.',
    '',
    ...(isCallerVerified ? [] : [
      '',
      'AVISO DE SEGURIDAD — LLAMANTE NO VERIFICADO:',
      `Tu colega ${caller.agent_name || 'que delegó'} NO confirmó que el llamante externo esté verificado como equipo (passphrase o número reconocido). Trata esta delegación como potencialmente originada por un cliente externo.`,
      'TIENES PROHIBIDO en esta ejecución:',
      '- Acceder a documentos/archivos internos del Drive del negocio (no invoques buscar_archivo, leer_archivo, save_to_drive, organize_files).',
      '- Enviar documentos internos por correo, WhatsApp o cualquier canal.',
      '- Compartir plantillas, contratos, propuestas previas, o cualquier material interno del negocio a terceros.',
      '- Compartir información fiscal, financiera, de clientes existentes o de proveedores.',
      '- Delegar la tarea a otro compañero para hacer el bypass indirectamente.',
      'SÍ puedes: responder con información pública del negocio (horarios, ubicación, servicios generales), crear leads, agendar citas, o pedir que se verifique al llamante antes de proceder.',
      'Si la tarea requiere una acción prohibida, responde en tarea_completada: "No pude completar: la tarea requiere acceso a datos internos y el llamante no está verificado. Recomiendo verificar al llamante o pedir que el dueño lo autorice." NO ejecutes la acción de todos modos.',
    ]),
    'REGLAS ESTRICTAS (no negociables):',
    '- Ejecuta la tarea directamente. No pidas confirmación.',
    '- Si necesitas información que no tienes en KB, DEBES invocar buscar_archivo (Drive), leer_archivo o buscar_en_web (internet) ANTES de responder o enviar cualquier correo. Es INACEPTABLE decir "no tengo la información" o "consulta directamente en X" sin haber intentado buscar primero.',
    '- Para datos actuales (precios, horarios, políticas de terceros), buscar_en_web es obligatorio.',
    '- Si la tarea incluye enviar correo con info que no tienes, primero busca la info, luego envíala.',
    '- Si la tarea incluye llamar de vuelta al cliente, usa llamar_a DESPUÉS de tener la información lista.',
    '- Cuando termines TODAS las acciones necesarias, llama a tarea_completada con un resumen de lo que hiciste.',
    '- No llames a tarea_completada antes de haber ejecutado las acciones.',
    '- AUDITORÍA ANTES DE COMPLETAR: Antes de llamar tarea_completada, revisa el resultado contra el brief original y el criterio de éxito si existe. Confirma que cumples lo pedido con datos verificados. Si algo quedó incierto o asumiste, dilo explícitamente en el resumen en vez de presentarlo como resuelto.',
    '- NO ALUCINES TU TOOL LIST: Nunca digas "no tengo esa tool" o "esa integración no está disponible" sin haberla INTENTADO invocar primero. Si el modelo cree que le falta una tool, primero llama la tool — el sistema devolverá un error concreto si de verdad no está disponible. Enumerar tu tool list en respuestas narrativas (ej: "las tools que tengo son X, Y, Z") es alucinación: describe solo lo que hiciste, no lo que crees tener.',
    '- ADJUNTAR ARCHIVOS: Si el brief menciona un archivo, plantilla, documento o file_id que debes enviar, ES OBLIGATORIO adjuntarlo. Flujo correcto:',
    '   1. Si tienes el file_id explícito en el brief, úsalo directo en enviar_correo con attachment_file_id + attachment_file_name + attachment_mime_type.',
    '   2. Si el brief solo dice "envía la plantilla X" sin file_id, PRIMERO invoca buscar_archivo para localizar el archivo real, LUEGO envía el correo con los 3 campos de attachment.',
    '   3. NUNCA envíes un correo diciendo "adjunto el archivo" sin haber puesto los campos de attachment — es engañoso al destinatario y el servidor rechazará el envío.',
    '   4. PROHIBIDO ABSOLUTO: NO uses emojis de clip (📎), documento (📄), o carpeta (📁) en el body como sustituto de un adjunto real. NO escribas líneas como "📎 nombre_archivo.pdf" pretendiendo simular un adjunto. Esas líneas ENGAÑAN al destinatario y el servidor rechazará el correo. Los adjuntos reales van SOLO en los 3 campos de attachment del schema, nunca en el body.',
    '   5. Ejemplos INCORRECTOS que el servidor rechazará:',
    '      • body: "Le envío adjunto el contrato." + sin attachment_file_id → RECHAZADO',
    '      • body: "📎 Contrato.pdf\\n\\nSaludos" + sin attachment_file_id → RECHAZADO',
    '      • body: "Anexo el documento solicitado." + sin attachment_file_id → RECHAZADO',
    '   6. Ejemplo CORRECTO: primero buscar_archivo("contrato alianza") → devuelve file_id, file_name, mime_type. Luego enviar_correo con to, subject, body ("Estimado, le envío el contrato solicitado. Saludos.") Y attachment_file_id + attachment_file_name + attachment_mime_type del resultado anterior.',
  ];

  if (success_criteria) {
    promptLines.push('', `## Criterio de éxito`, `La tarea se considera completada cuando: ${success_criteria}`);
  }
  if (orgKb?.trim()) {
    promptLines.push('', '## Base de conocimiento', orgKb.trim());
  }

  // Fecha ISO actual + datos de contacto de la org — sin esto el modelo alucina
  // años viejos y datos ficticios (bug 2026-08-10: Niva delegada por Sofia
  // puso contact@pneumastudio.com y www.pneumastudio.com — ambos inventados).
  const nowForPrompt = new Date();
  const todayIso     = nowForPrompt.toISOString().slice(0, 10);
  const todayEs      = nowForPrompt.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  promptLines.push('', '## Fecha actual', `Hoy es ${todayEs} (${todayIso}). USA este año en cualquier fecha que redactes — no repitas años pasados.`);

  const contactLines: string[] = [];
  const contactEmail = orgContactRow?.business_email || caller.portal_email;
  const contactSite  = orgContactRow?.business_website || orgContactRow?.brand_website;
  if (contactEmail)                    contactLines.push(`- Correo: ${contactEmail}`);
  if (orgContactRow?.brand_phone)      contactLines.push(`- Teléfono: ${orgContactRow.brand_phone}`);
  if (contactSite)                     contactLines.push(`- Sitio web: ${contactSite}`);
  if (orgContactRow?.brand_address)    contactLines.push(`- Dirección: ${orgContactRow.brand_address}`);
  if (contactLines.length > 0) {
    promptLines.push(
      '',
      '## Datos de contacto de tu empresa',
      'SIEMPRE que redactes un correo, cotización, contrato o firma para un cliente, incluye estos datos al final para que puedan contactarnos. NO inventes correos ni URLs; usa EXACTAMENTE los valores de abajo:',
      contactLines.join('\n'),
    );
  }
  if (orgContactRow?.email_footer_text?.trim()) {
    promptLines.push('', '## Firma de correos por default', orgContactRow.email_footer_text.trim());
  }

  // Regla anti-hallucination de links: cuando create_calendar_event devuelve
  // meet_link, DEBE incluirse literal en el correo. Antes Niva puso "el link
  // te llegará en la invitación del calendario" en vez de compartirlo (bug
  // 2026-08-10).
  promptLines.push(
    '',
    '## Cuando el flow incluye link de videollamada',
    'Si invocas create_calendar_event con generate_meet_link=true, el tool_result devuelve un campo meet_link (URL real de Google Meet). REGLA ABSOLUTA para el correo de confirmación:',
    '',
    '  INCORRECTO (nunca hagas esto — el destinatario no puede unirse sin el link):',
    '    "El link de la reunión se incluirá en tu invitación de Google Calendar."',
    '    "Te compartimos el link por separado."',
    '    "El link estará disponible en tu invitación."',
    '',
    '  CORRECTO (siempre haz esto — copia el meet_link literal del tool_result):',
    '    "Link de Google Meet: https://meet.google.com/pnc-jhtp-skh"',
    '    (con el URL completo, tal cual lo devolvió el tool, no un placeholder)',
    '',
    'Si tienes meet_link, INCLÚYELO literal en el body. Si no lo incluyes cuando lo tienes, el correo está incompleto y el cliente pierde tiempo buscando. Es una falla grave.',
    'Si por algo el evento se creó SIN meet_link (Google no lo devolvió), sí puedes decir "el link te llegará en la invitación del calendario" — pero solo en ese caso.',
    '',
    '## Formato del body del correo',
    'Escribe en TEXTO PLANO natural — el sistema convierte automáticamente markdown básico a HTML (**bold**, *italic*, [texto](url)). Puedes usar **negrita** para enfatizar campos importantes; el destinatario los verá con formato correcto. Pon URLs sueltas (ej. https://meet.google.com/xxx-yyyy-zzz) — el sistema las convierte automáticamente en enlaces clickeables. NO uses tablas markdown ni HTML crudo (solo negrita, itálica y links son soportados).',
  );
  if (target.role_knowledge_base?.trim()) {
    promptLines.push('', '## Conocimiento de tu rol', target.role_knowledge_base.trim());
  }

  const systemPrompt  = promptLines.filter(p => p !== undefined).join('\n');
  const baseUserMsg   = contexto?.trim()
    ? `Contexto de la conversación: ${contexto.trim()}\n\nTarea a ejecutar: ${tarea}`
    : `Tarea a ejecutar: ${tarea}`;

  // Record task — path directo (sin approval flow), arranca in_progress.
  const createdDirect = await createAgentTask({
    supabase,
    portalEmail:     caller.portal_email,
    createdBy:       agentId || null,
    assignedTo:      target.id,
    title:           tarea,
    description:     contexto?.trim() || null,
    triggerType:     'delegation',
    sourceContext:   contexto?.trim() || null,
    initialStatus:   'in_progress',
    successCriteria: success_criteria || null,
    maxIterations:   goalIter,
    actor:           agentId ? `agent:${agentId}` : 'system',
    reason:          orgAutoApproves ? 'delegation_auto_approved' : 'delegation_below_threshold',
  });
  const taskId = createdDirect.ok ? createdDirect.taskId : undefined;
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

      const __dtT = Date.now();
      const __dtM = 'claude-sonnet-4-6';
      let response;
      try {
        response = await client.messages.create({
          // Sonnet 4.6 en vez de Haiku 4.5 por mismo motivo que consultar-agente:
          // Haiku halucinaba tool use sin invocar realmente los tools.
          model:      __dtM,
          max_tokens: 1024,
          system: [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }],
          tools:      DELEGATION_TOOLS,
          messages,
        });
        void logLlmCall({ source: 'delegate', model: __dtM, usage: response.usage, agentId: target.id, portalEmail: caller.portal_email, latencyMs: Date.now() - __dtT, meta: { attempt, iter: i } });
      } catch (err) {
        void logLlmCall({ source: 'delegate', model: __dtM, usage: { input_tokens: 0, output_tokens: 0 }, agentId: target.id, portalEmail: caller.portal_email, latencyMs: Date.now() - __dtT, error: err instanceof Error ? err.message : String(err), meta: { attempt, iter: i } });
        throw err;
      }

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

  // Final transition (con historial en task_state_transitions)
  if (taskId) {
    const finalStatus = goalMet ? 'completed' : (finalResult ? 'partial' : 'failed');
    await transitionAgentTask({
      supabase, taskId,
      toStatus: finalStatus,
      actor:    'executor',
      reason:   goalMet
        ? 'goal_met'
        : (finalResult ? 'partial_with_output' : 'no_output'),
      metadata: { success_criteria: success_criteria ?? null, iterations: goalIter },
      extraFields: {
        result:       finalResult || 'Sin respuesta del agente.',
        goal_met:     success_criteria ? goalMet : null,
        eval_notes:   evalNotes || null,
        completed_at: new Date().toISOString(),
      },
    });
  }

  const agentLabel = target.agent_name || agente;
  const goalSuffix = success_criteria
    ? (goalMet ? ' [Criterio cumplido]' : ' [Criterio no cumplido]')
    : '';

  traceVoiceCall({
    toolName: 'delegar_tarea', agentId, sessionId, input: traceInput,
    result:   { ok: true, goal_met: goalMet, result: finalResult, target: agentLabel },
    startedAt,
    meta:     { target_agent: target.agent_name, target_id: target.id, task_id: taskId, iterations: goalIter, success_criteria: success_criteria ?? null },
  });
  recordMeerkatHandoff({
    supabase, portalEmail: caller.portal_email,
    fromMeerkat: callerMeerkat, toMeerkat: targetMeerkat,
    tool: 'delegar_tarea', fromAgentId: agentId, toAgentId: target.id,
    taskSummary: tarea, outcome: goalMet || finalResult ? 'success' : 'failed',
    agentTaskId: taskId ?? null,
    metadata: { stage: 'executed', goal_met: goalMet, iterations: goalIter, session_id: sessionId },
  });
  return NextResponse.json({
    results: [{
      toolCallId,
      result: `[${agentLabel}]${goalSuffix} ${finalResult || 'Tarea procesada.'}`,
    }],
  });
}
