import { createAdminClient } from '@/lib/supabase/admin';
import { buildSystemPrompt } from '@/lib/voice/prompt-builder';
import type { VoiceAgent } from '@/types/agent';
import { VAPI_MAX_CALL_SECONDS, VAPI_VOICE_MAX_TOKENS } from '@/lib/constants';

const VAPI_URL = 'https://api.vapi.ai';
const VAPI_KEY = process.env.VAPI_API_KEY!;

function headers() {
  return {
    'Authorization': `Bearer ${VAPI_KEY}`,
    'Content-Type': 'application/json',
  };
}

// ─── Global conversational learnings ─────────────────────────────────────────

interface AgentLearnings {
  general: string | null;
  micro:   string | null;
}

async function fetchConversationalLearnings(): Promise<AgentLearnings> {
  try {
    const supabase = createAdminClient();
    const { data } = await supabase
      .from('conversational_learnings')
      .select('body, target_document')
      .eq('status', 'active')
      .order('approved_at', { ascending: true });
    if (!data?.length) return { general: null, micro: null };

    const general = data.filter(l => l.target_document !== 'mdp');
    const micro   = data.filter(l => l.target_document === 'mdp');

    return {
      general: general.length ? general.map((l, i) => `${i + 1}. ${l.body}`).join('\n') : null,
      micro:   micro.length   ? micro.map(l => l.body).join('\n') : null,
    };
  } catch {
    return { general: null, micro: null };
  }
}

// ─── Team peer types ──────────────────────────────────────────────────────────

interface TeamPeer {
  id: string;
  vapi_agent_id: string;
  agent_name: string | null;
  role: string | null;
  features: Record<string, boolean>;
}

function peerToolName(peer: TeamPeer): string {
  const name = (peer.agent_name || 'especialista')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
  return `transferir_a_${name}`;
}

function peerRoleLabel(peer: TeamPeer): string {
  if (peer.role?.trim()) return peer.role.trim();
  const f = peer.features ?? {};
  if (f.order_taking)        return 'Tomador de pedidos';
  if (f.appointment_booking) return 'Recepcionista';
  return 'Especialista';
}

function peerRoleDesc(peer: TeamPeer): string {
  if (peer.role?.trim()) return `especialista en ${peer.role.trim().toLowerCase()}`;
  const f = peer.features ?? {};
  if (f.order_taking)        return 'toma pedidos de clientes';
  if (f.appointment_booking) return 'agenda citas y atiende consultas';
  return 'atiende solicitudes especializadas';
}

async function fetchTeamPeers(agent: VoiceAgent): Promise<TeamPeer[]> {
  if (!agent.portal_email) return [];
  try {
    const supabase = createAdminClient();
    const { data } = await supabase
      .from('voice_agents')
      .select('id, vapi_agent_id, agent_name, role, features')
      .eq('portal_email', agent.portal_email)
      .eq('active', true)
      .neq('id', agent.id);

    return (data ?? []).filter((p): p is TeamPeer => !!p.vapi_agent_id);
  } catch {
    return [];
  }
}

// ─── Tool creation ────────────────────────────────────────────────────────────

async function createVapiTools(agent: VoiceAgent, peers: TeamPeer[] = []): Promise<string[]> {
  const base = `${process.env.NEXT_PUBLIC_APP_URL}/api/voice/tools`;
  const id = agent.id;
  const tools: Record<string, unknown>[] = [];
  const server = (path: string) => ({
    url:     `${base}/${path}?agent_id=${id}`,
    headers: { 'x-vapi-secret': process.env.VAPI_SERVER_SECRET ?? '' },
  });

  if (agent.features.lead_qualification) {
    tools.push({
      type: 'function',
      function: {
        name: 'crear_lead',
        description: 'Registra los datos de un prospecto interesado en contratar servicios.',
        parameters: {
          type: 'object',
          properties: {
            nombre:      { type: 'string', description: 'Nombre completo del prospecto' },
            negocio:     { type: 'string', description: 'Nombre del negocio' },
            giro:        { type: 'string', description: 'Giro o industria del negocio' },
            servicio:    { type: 'string', description: 'Servicio que necesita' },
            presupuesto: { type: 'string', description: 'Presupuesto aproximado' },
            timeline:    { type: 'string', description: 'Para cuándo lo necesita' },
            email:       { type: 'string', description: 'Correo electrónico' },
            whatsapp:    { type: 'string', description: 'Número de WhatsApp' },
          },
          required: ['nombre', 'servicio'],
        },
      },
      server: server('crear-lead'),
    });
  }

  if (agent.features.appointment_booking) {
    tools.push({
      type: 'function',
      function: {
        name: 'agendar_cita',
        description: 'Agenda, modifica o cancela una cita.',
        parameters: {
          type: 'object',
          properties: {
            accion:   { type: 'string', enum: ['agendar', 'modificar', 'cancelar'], description: 'Acción a realizar' },
            nombre:   { type: 'string', description: 'Nombre del cliente' },
            servicio: { type: 'string', description: 'Servicio para la cita' },
            fecha:    { type: 'string', description: 'Fecha de la cita (ej: lunes 23 de junio)' },
            hora:     { type: 'string', description: 'Hora de la cita' },
            telefono: { type: 'string', description: 'Teléfono de confirmación' },
          },
          required: ['accion', 'nombre'],
        },
      },
      server: server('agendar-cita'),
    });
  }

  if (agent.features.order_taking) {
    tools.push({
      type: 'function',
      function: {
        name: 'registrar_pedido',
        description: 'Registra un pedido por teléfono.',
        parameters: {
          type: 'object',
          properties: {
            nombre:    { type: 'string', description: 'Nombre del cliente' },
            telefono:  { type: 'string', description: 'Teléfono del cliente' },
            items:     { type: 'string', description: 'Descripción de los productos o servicios pedidos' },
            tipo:      { type: 'string', enum: ['entrega', 'recoger'], description: 'Entrega a domicilio o recoger en sucursal' },
            direccion: { type: 'string', description: 'Dirección de entrega (solo si tipo es entrega)' },
            notas:     { type: 'string', description: 'Notas adicionales del pedido' },
          },
          required: ['nombre', 'items', 'tipo'],
        },
      },
      server: server('registrar-pedido'),
    });
  }

  if (agent.features.existing_client_support || agent.features.client_memory) {
    tools.push({
      type: 'function',
      function: {
        name: 'buscar_cliente',
        description: 'Busca el historial e información de un cliente existente por nombre o teléfono.',
        parameters: {
          type: 'object',
          properties: {
            identificador: { type: 'string', description: 'Nombre completo, número de teléfono, o WhatsApp del cliente' },
          },
          required: ['identificador'],
        },
      },
      server: server('buscar-cliente'),
    });
  }

  if (agent.features.smart_transfer) {
    tools.push({
      type: 'function',
      function: {
        name: 'notificar_transferencia',
        description: 'Notifica al equipo por WhatsApp que viene una transferencia. Llama a esta herramienta PRIMERO, luego usa transferir_llamada.',
        parameters: {
          type: 'object',
          properties: {
            nombre:  { type: 'string', description: 'Nombre del cliente' },
            motivo:  { type: 'string', description: 'Motivo de la transferencia' },
            resumen: { type: 'string', description: 'Resumen breve de la conversación' },
          },
          required: ['motivo'],
        },
      },
      server: server('notificar-transferencia'),
    });

    if (agent.transfer_number) {
      tools.push({
        type: 'transferCall',
        function: {
          name: 'transferir_llamada',
          description: 'Transfiere la llamada en tiempo real al equipo. Úsala DESPUÉS de notificar_transferencia cuando el cliente quiera hablar con un humano.',
          parameters: { type: 'object', properties: {} },
        },
        destinations: [{
          type: 'number',
          number: agent.transfer_number,
          message: 'Un momento por favor, te estoy comunicando con el equipo.',
        }],
        messages: [{
          type: 'request-start',
          content: 'Claro, con mucho gusto te comunico con el equipo ahora mismo.',
        }],
      });
    }
  }

  if (agent.features.whatsapp_escalation) {
    tools.push({
      type: 'function',
      function: {
        name: 'enviar_whatsapp_escalacion',
        description: 'Envía un WhatsApp al cliente diciéndole que pueden atenderle por ese canal cuando la llamada no pudo resolverse.',
        parameters: {
          type: 'object',
          properties: {
            numero_cliente: { type: 'string', description: 'Número del cliente con código de país, ej: +528112345678' },
            motivo:         { type: 'string', description: 'Breve motivo de la escalación' },
          },
          required: ['numero_cliente'],
        },
      },
      server: server('enviar-whatsapp-escalacion'),
    });
  }

  // ── Owner ops tools (available to all agents) ────────────────────────────────
  tools.push({
    type: 'function',
    function: {
      name: 'enviar_correo',
      description: 'Envía un correo electrónico a cualquier persona en nombre del dueño. Puede incluir un archivo de Drive/OneDrive como adjunto si el dueño lo pide. Úsala cuando el dueño te pida enviar un correo durante la llamada.',
      parameters: {
        type: 'object',
        properties: {
          to:                   { type: 'string', description: 'Dirección de correo del destinatario' },
          subject:              { type: 'string', description: 'Asunto del correo' },
          body:                 { type: 'string', description: 'Cuerpo del correo' },
          attachment_file_id:   { type: 'string', description: 'ID del archivo de Drive/OneDrive obtenido de buscar_archivo (opcional)' },
          attachment_file_name: { type: 'string', description: 'Nombre del archivo adjunto con extensión (opcional)' },
          attachment_mime_type: { type: 'string', description: 'Tipo MIME del archivo (opcional)' },
        },
        required: ['to', 'subject', 'body'],
      },
    },
    server: server('enviar-correo'),
  });

  tools.push({
    type: 'function',
    function: {
      name: 'crear_documento',
      description: 'Genera un documento PDF con el logo y colores del negocio y lo envía al correo del dueño. Usa template_type="proposal" para propuestas (incluye cliente y precio), "letter" para cartas formales, "general" para cualquier otro documento.',
      parameters: {
        type: 'object',
        properties: {
          title:          { type: 'string', description: 'Título del documento' },
          content:        { type: 'string', description: 'Contenido. Usa # para secciones y ## para subsecciones.' },
          filename:       { type: 'string', description: 'Nombre del archivo sin extensión' },
          template_type:  { type: 'string', enum: ['general', 'proposal', 'letter'], description: 'Tipo de template' },
          client_name:    { type: 'string', description: 'Nombre del cliente (proposal)' },
          client_email:   { type: 'string', description: 'Correo del cliente (proposal)' },
          total_price:    { type: 'string', description: 'Precio total destacado. Ej: "$50,000 MXN" (proposal)' },
          validity_days:  { type: 'number', description: 'Días de validez (proposal)' },
          recipient_name: { type: 'string', description: 'Nombre del destinatario (letter)' },
        },
        required: ['title', 'content'],
      },
    },
    server: server('crear-documento'),
  });

  tools.push({
    type: 'function',
    function: {
      name: 'llamar_a',
      description: 'Realiza una llamada telefónica saliente a un número en nombre del dueño. Úsala cuando el dueño pida llamar a alguien durante la conversación.',
      parameters: {
        type: 'object',
        properties: {
          numero:  { type: 'string', description: 'Número de teléfono con código de país. Ej: +5218113333333' },
          nombre:  { type: 'string', description: 'Nombre del contacto a llamar' },
          mensaje: { type: 'string', description: 'Motivo de la llamada o mensaje para el contacto' },
        },
        required: ['numero', 'mensaje'],
      },
    },
    server: server('llamar-a'),
  });

  tools.push({
    type: 'function',
    function: {
      name: 'buscar_archivo',
      description: 'Busca un archivo en Google Drive o OneDrive del dueño. Úsala cuando el dueño pida buscar un documento durante la llamada.',
      parameters: {
        type: 'object',
        properties: {
          busqueda: { type: 'string', description: 'Nombre o descripción del archivo a buscar' },
        },
        required: ['busqueda'],
      },
    },
    server: server('buscar-archivo'),
  });

  if (agent.features.helpdesk) {
    tools.push({
      type: 'function',
      function: {
        name: 'crear_ticket',
        description: 'Crea un ticket de soporte IT en la mesa de ayuda. Úsala cuando el usuario reporte un problema técnico. Asigna automáticamente al técnico según el tipo de problema.',
        parameters: {
          type: 'object',
          properties: {
            titulo:       { type: 'string', description: 'Título breve del problema reportado' },
            categoria:    { type: 'string', enum: ['red', 'servidores', 'usuario', 'software', 'hardware', 'accesos', 'otro'], description: 'Categoría del problema' },
            prioridad:    { type: 'string', enum: ['baja', 'normal', 'alta', 'critica'], description: 'Prioridad del ticket' },
            descripcion:  { type: 'string', description: 'Descripción detallada del problema' },
            caller_number: { type: 'string', description: 'Número de teléfono del usuario que llama' },
          },
          required: ['titulo', 'categoria', 'prioridad'],
        },
      },
      server: server('crear-ticket'),
    });

    tools.push({
      type: 'function',
      function: {
        name: 'consultar_incidentes',
        description: 'Consulta si hay incidentes activos en el sistema. Úsala al inicio de cada llamada de soporte para avisar al usuario sobre problemas conocidos antes de crear un ticket.',
        parameters: {
          type: 'object',
          properties: {
            tema: { type: 'string', description: 'Tema o sistema sobre el que pregunta el usuario (ej: internet, SAP, correo). Opcional.' },
          },
        },
      },
      server: server('consultar-incidentes'),
    });

    tools.push({
      type: 'function',
      function: {
        name: 'buscar_directorio',
        description: 'Busca en el directorio interno quién atiende un tipo de problema específico. Úsala para referir al usuario con el técnico o área correcta.',
        parameters: {
          type: 'object',
          properties: {
            tipo_problema: { type: 'string', description: 'Tipo de problema o área que se busca (ej: red, VPN, impresoras, SAP)' },
          },
          required: ['tipo_problema'],
        },
      },
      server: server('buscar-directorio'),
    });
  }

  // ── Agent-to-agent tools (available when there are peers) ───────────────────
  if (peers.length > 0) {
    tools.push({
      type: 'function',
      function: {
        name: 'consultar_agente',
        description: 'Pregunta a otro agente del equipo algo que está fuera de tu conocimiento y necesitas su respuesta para continuar la conversación. El agente consultado responde con información o criterio experto. NO ejecuta acciones — solo responde. Úsala cuando necesites información que tiene otro especialista.',
        parameters: {
          type: 'object',
          properties: {
            rol:      { type: 'string', description: 'Nombre o rol del agente a consultar. Ej: "administrativo", "técnico de redes", "recursos humanos".' },
            tarea:    { type: 'string', description: 'Pregunta específica que le haces al agente.' },
            contexto: { type: 'string', description: 'Contexto relevante de la conversación (opcional).' },
          },
          required: ['rol', 'tarea'],
        },
      },
      server: server('consultar-agente'),
    });

    tools.push({
      type: 'function',
      function: {
        name: 'delegar_tarea',
        description: 'Delega una tarea a otro agente del equipo para que la EJECUTE. El agente delegado toma acción real: envía correos, crea tickets, genera documentos, etc. Úsala cuando recibas una tarea que corresponde a otro especialista y que debes pasarle para que él la lleve a cabo. Espera la confirmación de lo que hizo.',
        parameters: {
          type: 'object',
          properties: {
            agente:   { type: 'string', description: 'Nombre o rol del agente que debe ejecutar la tarea. Ej: "administrativo", "técnico de redes", "recursos humanos".' },
            tarea:    { type: 'string', description: 'Descripción detallada de la tarea a ejecutar, incluyendo toda la información necesaria (nombres, correos, teléfonos, detalles).' },
            contexto: { type: 'string', description: 'Contexto de la conversación o solicitud original (opcional pero recomendado).' },
          },
          required: ['agente', 'tarea'],
        },
      },
      server: server('delegar-tarea'),
    });
  }

  // ── Surveys (always available) ──────────────────────────────────────────────
  tools.push({
    type: 'function',
    function: {
      name: 'registrar_encuesta',
      description: 'Registra las respuestas capturadas de una encuesta de satisfacción. Llámala en cuanto tengas al menos una respuesta y el cliente se vaya a despedir, o cuando hayas recabado todas. Puedes haber recopilado las respuestas a lo largo de toda la conversación o al final; lo que importa es registrarlas antes de cerrar la llamada.',
      parameters: {
        type: 'object',
        properties: {
          survey_id:     { type: 'string', description: 'ID de la encuesta activa (proporcionado en el prompt).' },
          respuestas:    {
            type: 'array',
            description: 'Lista de respuestas, una por pregunta.',
            items: {
              type: 'object',
              properties: {
                orden: { type: 'number', description: 'Número de orden de la pregunta (1, 2, 3…).' },
                valor: { type: 'string', description: 'Respuesta del cliente.' },
              },
              required: ['orden', 'valor'],
            },
          },
          caller_number: { type: 'string', description: 'Número del llamante (opcional).' },
          call_id:       { type: 'string', description: 'ID de la llamada Vapi (opcional).' },
        },
        required: ['survey_id', 'respuestas'],
      },
    },
    server: server('registrar-encuesta'),
  });

  // ── Bug reporting (always available — agents self-report issues) ───────────────
  tools.push({
    type: 'function',
    function: {
      name: 'reportar_falla',
      description: 'Envía un reporte de falla o irregularidad al equipo técnico de Centinelia. Úsalo cuando: (1) detectes un comportamiento inesperado en ti mismo, (2) el usuario reporte que algo no funcionó correctamente en llamadas anteriores, (3) encuentres un error del sistema, datos incorrectos o una limitación que impida tu trabajo. No lo uses para quejas del negocio del usuario, solo para fallas técnicas del sistema Centinelia.',
      parameters: {
        type: 'object',
        properties: {
          tipo: {
            type: 'string',
            description: 'Categoría de la falla: "Bug de sistema", "Comportamiento inesperado", "Datos incorrectos", "Limitación técnica" u "Otro".',
          },
          descripcion: {
            type: 'string',
            description: 'Descripción clara de la falla: qué ocurrió, cuándo, y cuál debería ser el comportamiento correcto.',
          },
          contexto: {
            type: 'string',
            description: 'Contexto relevante de la conversación o llamada donde se detectó la falla (opcional).',
          },
        },
        required: ['tipo', 'descripcion'],
      },
    },
    server: server('reportar-falla'),
  });

  // One transferCall tool per active team peer — enables live agent-to-agent routing
  for (const peer of peers) {
    const toolName  = peerToolName(peer);
    const roleLabel = peerRoleLabel(peer);
    const roleDesc  = peerRoleDesc(peer);
    const peerName  = peer.agent_name || roleLabel;
    tools.push({
      type: 'transferCall',
      function: {
        name: toolName,
        description: `Transfiere la llamada a ${peerName} (${roleLabel}): ${roleDesc}. Úsalo cuando el cliente necesite este especialista.`,
        parameters: {
          type: 'object',
          properties: {
            motivo: { type: 'string', description: 'Motivo breve de la transferencia' },
          },
          required: ['motivo'],
        },
      },
      destinations: [{
        type: 'assistant',
        assistantId: peer.vapi_agent_id,
        message: `Con gusto, te comunico con ${peerName} ahora mismo.`,
      }],
    });
  }

  const ids: string[] = [];
  for (const tool of tools) {
    const res = await fetch(`${VAPI_URL}/tool`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify(tool),
    });
    if (res.ok) {
      const data = await res.json();
      if (data.id) ids.push(data.id);
    } else {
      const fn = (tool.function as Record<string, unknown>)?.name ?? 'unknown';
      console.error('Vapi createTool error:', fn, await res.text());
    }
  }
  return ids;
}

// ─── Per-meerkat model + behavior config ──────────────────────────────────────
// Model is the last layer — personality lives in ADN → CCE → HCP → meerkat prompt.
// These params shape output behavior only: how fast, how long, how deterministic.

interface MeerkatModelConfig {
  provider:    string;
  model:       string;
  temperature: number;
  maxTokens:   number;
  speed:       number;
  minChars:    number;
}

const MEERKAT_MODEL_CONFIG: Record<string, MeerkatModelConfig> = {
  nia:    { provider: 'anthropic', model: 'claude-haiku-4-5-20251001', temperature: 0.35, maxTokens: 110, speed: 0.93, minChars: 50 },
  noah:   { provider: 'anthropic', model: 'claude-sonnet-4-6',         temperature: 0.60, maxTokens: 150, speed: 0.98, minChars: 40 },
  nara:   { provider: 'anthropic', model: 'claude-haiku-4-5-20251001', temperature: 0.20, maxTokens: 150, speed: 0.98, minChars: 40 },
  nico:   { provider: 'anthropic', model: 'claude-haiku-4-5-20251001', temperature: 0.30, maxTokens: 110, speed: 0.98, minChars: 40 },
  naia:   { provider: 'anthropic', model: 'claude-haiku-4-5-20251001', temperature: 0.20, maxTokens: 150, speed: 0.93, minChars: 50 },
  nelia:  { provider: 'anthropic', model: 'claude-haiku-4-5-20251001', temperature: 0.40, maxTokens: 110, speed: 0.98, minChars: 40 },
  neo:    { provider: 'anthropic', model: 'claude-haiku-4-5-20251001', temperature: 0.15, maxTokens: 110, speed: 1.05, minChars: 30 },
  nova:   { provider: 'anthropic', model: 'claude-haiku-4-5-20251001', temperature: 0.70, maxTokens: 150, speed: 1.05, minChars: 28 },
  nox:    { provider: 'anthropic', model: 'claude-sonnet-4-6',         temperature: 0.10, maxTokens:  80, speed: 1.05, minChars: 30 },
  niva:   { provider: 'anthropic', model: 'claude-sonnet-4-6',         temperature: 0.20, maxTokens: 150, speed: 0.98, minChars: 40 },
};

const DEFAULT_MODEL_CONFIG: MeerkatModelConfig = {
  provider: 'anthropic', model: 'claude-haiku-4-5-20251001', temperature: 0.40, maxTokens: 150, speed: 0.98, minChars: 40,
};

// ─── Assistant config builder ─────────────────────────────────────────────────

function buildVapiAssistant(agent: VoiceAgent, toolIds: string[] = [], peers: TeamPeer[] = [], learnings?: AgentLearnings | null) {
  const agentName = agent.agent_name?.trim() || 'Centinelia';

  const messages: Array<{ role: string; content: string }> = [
    { role: 'system', content: buildSystemPrompt(agent, learnings) },
  ];

  if (peers.length > 0) {
    const lines = [
      'EQUIPO DE ESPECIALISTAS (transferencia en tiempo real):',
      ...peers.map(p => {
        const label    = peerRoleLabel(p);
        const toolName = peerToolName(p);
        const peerName = p.agent_name || label;
        return `- ${peerName} (${label}): ${peerRoleDesc(p)}. Herramienta: ${toolName}.`;
      }),
      'Si el cliente solicita algo que corresponde a un especialista, transfiérelo de inmediato con la herramienta indicada. No le hagas esperar ni expliques el proceso técnico.',
    ];
    messages.push({ role: 'system', content: lines.join('\n') });
  }

  const meerkatId = (agent.features as unknown as Record<string, unknown>).meerkat_role_id as string | undefined;
  const cfg: MeerkatModelConfig = (meerkatId ? MEERKAT_MODEL_CONFIG[meerkatId] : undefined) ?? DEFAULT_MODEL_CONFIG;

  return {
    name: `${agentName}, ${agent.business_name}`,
    model: {
      provider: cfg.provider,
      model:    cfg.model,
      messages,
      temperature: cfg.temperature,
      maxTokens:   cfg.maxTokens,
      ...(toolIds.length > 0 ? { toolIds } : {}),
    },
    voice: {
      provider: '11labs',
      voiceId: agent.elevenlabs_voice_id || 'jUxkp8eMgszgJX3XU2pV',
      model: 'eleven_turbo_v2_5',
      stability: 0.35,
      similarityBoost: 0.75,
      style: 0.45,
      speed: cfg.speed,
      useSpeakerBoost: true,
      optimizeStreamingLatency: 3,
      chunkPlan: {
        enabled: true,
        minCharacters: cfg.minChars,
        punctuationBoundaries: ['.', '!', '?'],
      },
    },
    firstMessage: (() => {
      const notice = 'Esta llamada puede ser grabada.';
      const custom = agent.first_message?.trim();
      if (custom) {
        return custom.toLowerCase().includes('grabada') ? custom : `${custom} ${notice}`;
      }
      return `${agent.business_name}, buenos días. Le habla ${agentName}. ${notice} ¿En qué le puedo ayudar?`;
    })(),
    endCallMessage: 'Hasta luego, que tenga un excelente día.',
    endCallPhrases: ['hasta luego', 'hasta pronto', 'que tenga un excelente día', 'que tenga buen día', 'adiós', 'fue un placer atenderle'],
    transcriber: {
      provider: 'deepgram',
      model: 'nova-2',
      language: agent.features.multilingual ? 'multi' : 'es',
      smartFormat: true,
      endpointing: 300,
    },
    backgroundSound: 'office',
    backchannelingEnabled: true,
    backgroundDenoisingEnabled: true,
    silenceTimeoutSeconds: 10,
    maxDurationSeconds: VAPI_MAX_CALL_SECONDS,
    serverUrl: `${process.env.NEXT_PUBLIC_APP_URL}/api/voice/webhook?secret=${process.env.VAPI_SERVER_SECRET ?? ''}`,
    recordingEnabled: true,
    analysisPlan: {
      summaryPrompt: 'Resume esta llamada en 2-3 oraciones en texto plano, sin markdown, sin encabezados, sin negritas: qué quería el cliente y cómo terminó la llamada.',
      successEvaluationPrompt: '¿Se resolvió la solicitud del cliente satisfactoriamente?',
      successEvaluationRubric: 'DescriptiveScale',
      structuredDataPrompt: 'Extrae la información recopilada en esta llamada. Solo incluye campos que el cliente mencionó explícitamente.',
      structuredDataSchema: {
        type: 'object',
        properties: {
          nombre:        { type: 'string', description: 'Nombre completo del cliente' },
          negocio:       { type: 'string', description: 'Nombre del negocio del cliente' },
          giro:          { type: 'string', description: 'Giro o industria del negocio' },
          servicio:      { type: 'string', description: 'Servicio o producto que necesita' },
          presupuesto:   { type: 'string', description: 'Presupuesto mencionado' },
          timeline:      { type: 'string', description: 'Para cuándo lo necesita' },
          email:         { type: 'string', description: 'Email de contacto' },
          whatsapp:      { type: 'string', description: 'Número de WhatsApp o teléfono con código de país, ej: +528112345678' },
          cita_fecha:    { type: 'string', description: 'Fecha de la cita en formato YYYY-MM-DD, ej: 2026-06-25. Calcula la fecha exacta basándote en lo que dijo el cliente.' },
          cita_hora:     { type: 'string', description: 'Hora de la cita en formato HH:MM, ej: 10:30' },
          cita_telefono: { type: 'string', description: 'Teléfono de confirmación de la cita con código de país' },
          pedido_items:  { type: 'string', description: 'Productos o platillos pedidos si aplica' },
          pedido_tipo:   { type: 'string', description: 'Entrega o recoger si aplica' },
          tipo_contacto: { type: 'string', description: 'lead | cita | pedido | informacion | transferencia' },
        },
      },
    },
    messagePlan: {
      idleMessages: [
        '¿Sigues ahí?',
        '¿Hay algo más en lo que te pueda ayudar?',
        'Estoy aquí si necesitas algo.',
        'Tómate el tiempo que necesites.',
        'Tómate tu tiempo.',
      ],
    },
    metadata: { agent_id: agent.id, plan: agent.plan },
  };
}

// ─── Exported sync functions ──────────────────────────────────────────────────

// Internal: sync one agent without triggering cascade (prevents infinite loops)
async function syncAgentToVapi(vapiAssistantId: string, agent: VoiceAgent, learnings?: AgentLearnings | null): Promise<boolean> {
  const peers          = await fetchTeamPeers(agent);
  const toolIds        = await createVapiTools(agent, peers);
  const resolvedLearnings = learnings !== undefined
    ? learnings
    : await fetchConversationalLearnings();
  const res = await fetch(`${VAPI_URL}/assistant/${vapiAssistantId}`, {
    method: 'PATCH',
    headers: headers(),
    body: JSON.stringify(buildVapiAssistant(agent, toolIds, peers, resolvedLearnings)),
  });
  if (!res.ok) {
    const errText = await res.text();
    console.error('Vapi syncAgent error:', errText);
    throw new Error(errText);
  }
  return true;
}

// Exported: resync all peer agents that share the same portal_email.
// Call this AFTER the DB already has the new/updated agent's vapi_agent_id saved.
export async function resyncPeerAgents(portalEmail: string | null | undefined, excludeAgentId: string): Promise<void> {
  if (!portalEmail) return;
  try {
    const supabase = createAdminClient();
    const { data: peers } = await supabase
      .from('voice_agents')
      .select('*')
      .eq('portal_email', portalEmail)
      .eq('active', true)
      .neq('id', excludeAgentId)
      .not('vapi_agent_id', 'is', null);

    if (!peers?.length) return;
    await Promise.allSettled(
      peers.map(p => syncAgentToVapi(p.vapi_agent_id, p as VoiceAgent)),
    );
  } catch (e) {
    console.error('resyncPeerAgents error:', e);
  }
}

export async function createVapiAssistant(agent: VoiceAgent): Promise<string | null> {
  const peers   = await fetchTeamPeers(agent);
  const toolIds = await createVapiTools(agent, peers);
  const res = await fetch(`${VAPI_URL}/assistant`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(buildVapiAssistant(agent, toolIds, peers)),
  });
  if (!res.ok) {
    console.error('Vapi createAssistant error:', await res.text());
    return null;
  }
  const data = await res.json();
  return data.id ?? null;
  // Callers must save the returned ID to DB and then call resyncPeerAgents()
}

export async function updateVapiAssistant(vapiAssistantId: string, agent: VoiceAgent): Promise<boolean> {
  // throws if Vapi rejects — callers should catch
  await syncAgentToVapi(vapiAssistantId, agent);
  // Fire-and-forget: push the updated tool list to all sibling agents
  resyncPeerAgents(agent.portal_email, agent.id).catch(console.error);
  return true;
}

// Pushes updated prompts (with current global conversational learnings) to ALL active agents.
// Called by the cron after new learnings are activated — do NOT call on every request.
export async function pushConversationalPromptsToAllAgents(): Promise<{ synced: number; errors: number }> {
  const supabase    = createAdminClient();
  const learnings   = await fetchConversationalLearnings();

  const { data: agents } = await supabase
    .from('voice_agents')
    .select('*')
    .eq('active', true)
    .not('vapi_agent_id', 'is', null);

  if (!agents?.length) return { synced: 0, errors: 0 };

  let synced = 0;
  let errors = 0;

  // Process in batches of 5 to avoid hammering Vapi API
  for (let i = 0; i < agents.length; i += 5) {
    const batch = agents.slice(i, i + 5);
    const results = await Promise.allSettled(
      batch.map(a => syncAgentToVapi(a.vapi_agent_id, a as VoiceAgent, learnings)),
    );
    for (const r of results) {
      if (r.status === 'fulfilled' && r.value) synced++;
      else errors++;
    }
  }

  return { synced, errors };
}

export async function assignAssistantToPhone(
  phoneNumber: string,
  vapiAssistantId: string,
  concurrencyLimit?: number,
): Promise<boolean> {
  const listRes = await fetch(`${VAPI_URL}/phone-number`, { headers: headers() });
  if (!listRes.ok) return false;

  const phones: Array<{ id: string; number: string }> = await listRes.json();
  const phone = phones.find(p => p.number === phoneNumber);
  if (!phone) {
    console.error('Vapi phone not found for number:', phoneNumber);
    return false;
  }

  const webhookUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/voice/webhook?secret=${process.env.VAPI_SERVER_SECRET ?? ''}`;
  const patch: Record<string, unknown> = {
    assistantId: vapiAssistantId,
    serverUrl:   webhookUrl,
  };
  if (concurrencyLimit !== undefined) patch.concurrencyLimit = concurrencyLimit;

  const res = await fetch(`${VAPI_URL}/phone-number/${phone.id}`, {
    method: 'PATCH',
    headers: headers(),
    body: JSON.stringify(patch),
  });
  if (!res.ok) {
    console.error('Vapi assignAssistant error:', await res.text());
    return false;
  }
  return true;
}
