import { createHash } from 'crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import { buildSystemPrompt } from '@/lib/voice/prompt-builder';
import type { VoiceAgent } from '@/types/agent';
import { VAPI_MAX_CALL_SECONDS, VAPI_VOICE_MAX_TOKENS } from '@/lib/constants';
import { MEERKAT_PROMPT_TIER } from '@/lib/voice/rules';
import { resolveMeerkatConfig, type MeerkatModelConfig } from './resolve-meerkat';
import { resolveMeerkatVersionForAgent } from '@/lib/feature-flags/version-flag-resolver';

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
  business_name: string | null;
  role: string | null;
  features: Record<string, boolean>;
  role_knowledge_base: string | null;
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

// Returns a capability summary for use in peer-awareness blocks.
// Prefers the first sentence of role_knowledge_base (actual responsibilities),
// falls back to the generic role description.
function peerCapabilitySummary(peer: TeamPeer): string {
  const kb = peer.role_knowledge_base?.trim();
  if (kb) {
    const match = kb.match(/^[^.!?\n]+[.!?]/);
    if (match && match[0].length <= 220) return match[0].trim();
    const truncated = kb.slice(0, 200);
    const lastSpace = truncated.lastIndexOf(' ');
    return (lastSpace > 80 ? truncated.slice(0, lastSpace) : truncated) + '…';
  }
  return peerRoleDesc(peer);
}

// Traduce nombres tecnicos de tools a capacidades comprensibles para el prompt.
// Se usa para exponer a cada peer con SUS herramientas clave — asi Sofia sabe
// que Noah puede buscar en internet aunque su rol sea Ventas.
const TOOL_HUMAN_LABEL: Record<string, string> = {
  buscar_en_web:        'buscar información en internet',
  read_url:             'leer páginas web',
  search_leads:         'buscar prospectos en línea',
  enviar_correo:        'enviar correos',
  crear_documento:      'crear documentos y PDFs',
  buscar_documento_oficina: 'buscar documentos ya generados en la oficina',
  enviar_documento_oficina: 'reenviar documentos existentes de la oficina',
  generar_propuesta_comercial:    'armar propuestas comerciales en PDF',
  generar_cotizacion:             'armar cotizaciones con folio',
  generar_one_pager:              'armar one-pagers ejecutivos',
  generar_correo_estructurado:    'redactar correos estructurados',
  generar_pitch_deck:             'armar pitch decks en PowerPoint',
  generar_reporte_metricas_excel: 'generar reportes de métricas en Excel',
  create_file:          'crear archivos de texto',
  create_contract_draft:'redactar contratos',
  buscar_archivo:       'buscar archivos en Drive',
  leer_archivo:         'leer archivos del Drive',
  save_to_drive:        'guardar archivos en la nube',
  organize_files:       'organizar carpetas',
  list_calendar_events: 'consultar la agenda',
  create_calendar_event:'agendar eventos en calendario',
  crear_ticket:         'abrir tickets de soporte',
  consultar_incidentes: 'consultar incidentes abiertos',
  buscar_directorio:    'buscar en directorio interno',
  qb_consultar_facturas:'consultar facturas de QuickBooks',
  qb_buscar_cliente:    'buscar clientes en QuickBooks',
  qb_crear_factura:     'emitir facturas',
  solicitar_factura:    'levantar solicitudes de factura fiscal al equipo humano',
  consultar_factura:    'consultar estado de facturas solicitadas',
  llamar_a:             'hacer llamadas salientes',
  create_civic_report:  'registrar reportes ciudadanos',
  analizar_publicaciones_ml: 'analizar MercadoLibre',
  crear_publicacion_ml: 'crear publicaciones en MercadoLibre',
  extraer_voz_del_cliente: 'extraer la voz del cliente desde conversaciones reales',
  extraer_tono_de_marca:   'extraer el tono de marca del negocio',
  revisar_desempeno_equipo: 'revisar el desempeño del equipo (solo directores)',
  aprobar_gasto:            'aprobar gastos operativos (solo directores)',
  evaluar_limite_gasto:     'verificar si un gasto cabe en el presupuesto mensual (solo directores)',
  verificar_gasto_recurrente: 'verificar si un proveedor es recurrente con historial aprobado',
  sheets_agregar_fila:      'agregar fila a un Google Sheet (leads, clientes, OCs, bitácoras, cajas chicas)',
  sheets_actualizar_fila:   'actualizar fila existente en un Google Sheet',
  sheets_leer:              'leer contenido de un Google Sheet',
  sheets_buscar:            'buscar filas en un Google Sheet por texto',
};

function peerToolCapabilities(peer: TeamPeer): string[] {
  const meerkatId = (peer.features as { meerkat_role_id?: string } | null | undefined)?.meerkat_role_id;
  if (!meerkatId || meerkatId === 'custom') return [];
  const roleTools = MEERKAT_VOICE_DISTRIBUTION[meerkatId] ?? [];
  return roleTools
    .map(t => TOOL_HUMAN_LABEL[t])
    .filter((s): s is string => !!s);
}

// ─── Org-level data enrichment ───────────────────────────────────────────────
// Org fields are stored in `organizations` (single source of truth).
// Before building any Vapi assistant, merge them over the per-agent row.

const ORG_SELECT = 'knowledge_base, owner_profile, owner_passphrase, business_description, business_hours, business_website, website_knowledge, google_review_url, email_brand_color, brand_color_secondary, brand_website, brand_address, email_footer_text, multilingual';

async function enrichWithOrgData(agent: VoiceAgent): Promise<VoiceAgent> {
  if (!agent.portal_email) return agent;
  try {
    const supabase = createAdminClient();
    const { data: org } = await supabase
      .from('organizations')
      .select(ORG_SELECT)
      .eq('portal_email', agent.portal_email)
      .single();
    if (!org) return agent;
    // multilingual vive en org (single source of truth). Sobrescribe el flag
    // de agent.features con el valor de la org — el toggle de portal lo controla.
    const orgMultilingual = (org as { multilingual?: boolean | null }).multilingual ?? false;
    const merged = { ...agent, ...org } as VoiceAgent;
    merged.features = { ...merged.features, multilingual: orgMultilingual };
    return merged;
  } catch {
    return agent;
  }
}

// Coordinadores no son voice-capable NUNCA. Excluir de peers de transferencia:
// generar transferir_a_<coordinador> apunta a assistantName que Vapi puede o no
// resolver segun estado; en cualquier caso son cuentas que no atienden por
// telefono y no deberian estar en tools de transferCall en vivo.
const NON_VOICE_ROLES = new Set(['nox', 'niva', 'nash']);

async function fetchTeamPeers(agent: VoiceAgent): Promise<TeamPeer[]> {
  if (!agent.portal_email) return [];
  try {
    const supabase = createAdminClient();
    const { data } = await supabase
      .from('voice_agents')
      .select('id, vapi_agent_id, agent_name, business_name, role, features, role_knowledge_base')
      .eq('portal_email', agent.portal_email)
      .eq('active', true)
      .neq('id', agent.id)
      .not('vapi_agent_id', 'is', null);

    return (data ?? [])
      .filter((p): p is TeamPeer => !!p.vapi_agent_id)
      .filter(p => {
        const role = (p.features as { meerkat_role_id?: string } | null | undefined)?.meerkat_role_id;
        return !role || !NON_VOICE_ROLES.has(role);
      });
  } catch {
    return [];
  }
}

// ─── Voice tool distribution by meerkat role ─────────────────────────────────

export const MEERKAT_VOICE_DISTRIBUTION: Record<string, string[]> = {
  // Sofia (Nia) — recepcionista: 1er contacto, delega para tareas de fondo.
  // Puede buscar docs para saber si algo ya existe antes de generar duplicado.
  // solicitar_factura REMOVIDA por bug de Haiku 4.5 halucinando tool calls
  // en flujos fiscales críticos (call 22:35 del 2026-08-04). Nia SIEMPRE
  // delega la factura vía delegar_tarea a un peer con Sonnet (Noah, Nico, Nox).
  // El goal-loop de delegar_tarea corre en Sonnet y ejecuta solicitar_factura
  // confiablemente. Si la org no tiene peer fiscal, Sofia hace fallback a
  // crear_lead con datos capturados + escalación manual.
  nia:   ['crear_lead', 'crear_contacto_saliente', 'agendar_cita', 'registrar_pedido', 'buscar_cliente', 'notificar_transferencia', 'transferir_llamada', 'registrar_encuesta', 'buscar_documento_oficina', 'consultar_agente', 'delegar_tarea', 'reportar_falla', 'marcar_no_llamar', 'agregar_tag_contacto'],
  // Noah — ventas: vendedor oficial. Sin crear_documento por diseño (delega
  // a Nico/Niva para propuestas formales), pero puede buscar y reenviar
  // cotizaciones previas. Tiene extraer_voz_del_cliente + extraer_tono_de_marca
  // para hablar como la empresa y con el lenguaje real del cliente. Exclusiva:
  // read_url — investiga sitios de prospectos a fondo antes de llamar.
  noah:  ['crear_lead', 'crear_contacto_saliente', 'registrar_pedido', 'notificar_transferencia', 'transferir_llamada', 'llamar_a', 'buscar_en_web', 'read_url', 'search_leads', 'solicitar_factura', 'buscar_documento_oficina', 'enviar_documento_oficina', 'analizar_publicaciones_ml', 'crear_publicacion_ml', 'actualizar_publicacion_ml', 'ver_metricas_ml', 'extraer_voz_del_cliente', 'extraer_tono_de_marca', 'consultar_agente', 'reportar_falla', 'agregar_tag_contacto', 'generar_propuesta_comercial', 'generar_cotizacion', 'generar_one_pager', 'generar_correo_estructurado', 'generar_pitch_deck', 'generar_reporte_metricas_excel'],
  // Nico — cobranza y fiscal: sigue facturas + emite CFDIs + reenvía comprobantes
  // + reportes de ingresos (P&L).
  nico:  ['buscar_cliente', 'notificar_transferencia', 'transferir_llamada', 'llamar_a', 'enviar_correo', 'crear_documento', 'buscar_documento_oficina', 'enviar_documento_oficina', 'solicitar_factura', 'consultar_factura', 'qb_consultar_facturas', 'qb_buscar_cliente', 'qb_registrar_pago', 'qb_crear_factura', 'qb_reporte_ingresos', 'reportar_falla', 'agregar_tag_contacto', 'generar_correo_estructurado'],
  // Nelia — servicio al cliente: postventa. Ahora puede reenviar docs previos
  // y ver insights de voz del cliente para responder mejor.
  nelia: ['buscar_cliente', 'notificar_transferencia', 'transferir_llamada', 'registrar_encuesta', 'enviar_correo', 'buscar_archivo', 'buscar_documento_oficina', 'enviar_documento_oficina', 'extraer_voz_del_cliente', 'consultar_agente', 'reportar_falla', 'agregar_tag_contacto', 'generar_one_pager', 'generar_correo_estructurado', 'generar_reporte_metricas_excel'],
  // Neo — helpdesk IT: sin cambios, no maneja docs comerciales.
  neo:   ['crear_ticket', 'consultar_incidentes', 'buscar_directorio', 'buscar_archivo', 'leer_archivo', 'delegar_tarea', 'consultar_agente', 'reportar_falla'],
  // Nara — municipal: ahora puede aplicar encuestas de satisfacción también.
  nara:  ['create_civic_report', 'lookup_civic_report', 'update_civic_report', 'buscar_cliente', 'registrar_encuesta', 'notificar_transferencia', 'transferir_llamada', 'delegar_tarea', 'consultar_agente', 'reportar_falla', 'generar_reporte_metricas_excel'],
  // Naia — onboarding.
  naia:  ['iniciar_onboarding', 'agendar_cita', 'buscar_cliente', 'registrar_encuesta', 'enviar_correo', 'crear_documento', 'buscar_documento_oficina', 'enviar_documento_oficina', 'list_calendar_events', 'create_calendar_event', 'delete_calendar_event', 'buscar_archivo', 'leer_archivo', 'extraer_voz_del_cliente', 'extraer_tono_de_marca', 'reportar_falla', 'generar_correo_estructurado'],
  // Nova — recuperación / retención.
  nova:  ['buscar_cliente', 'notificar_transferencia', 'transferir_llamada', 'llamar_a', 'crear_ticket', 'crear_documento', 'buscar_documento_oficina', 'enviar_documento_oficina', 'extraer_voz_del_cliente', 'delegar_tarea', 'consultar_agente', 'buscar_en_web', 'reportar_falla'],
  // Nox — coordinador director. Ahora también consulta estado de facturas.
  nox:   ['consultar_agente', 'delegar_tarea', 'enviar_correo', 'llamar_a', 'crear_documento', 'buscar_documento_oficina', 'enviar_documento_oficina', 'create_file', 'create_contract_draft', 'buscar_archivo', 'leer_archivo', 'save_to_drive', 'organize_files', 'list_calendar_events', 'create_calendar_event', 'delete_calendar_event', 'qb_consultar_facturas', 'consultar_factura', 'verificar_gasto_recurrente', 'extraer_voz_del_cliente', 'sheets_agregar_fila', 'sheets_actualizar_fila', 'sheets_leer', 'sheets_buscar', 'reportar_falla'],
  // Niva — directora general. Visión estratégica: desempeño del equipo,
  // aprobación de gastos, insights de marca/cliente. Delega ejecución fiscal
  // a Nico. Sin qb_crear_factura/qb_reporte_ingresos (los movimos a Nico).
  niva:  ['consultar_agente', 'delegar_tarea', 'enviar_correo', 'llamar_a', 'crear_documento', 'buscar_documento_oficina', 'enviar_documento_oficina', 'create_file', 'save_to_drive', 'buscar_en_web', 'search_leads', 'list_calendar_events', 'create_calendar_event', 'qb_consultar_facturas', 'qb_buscar_cliente', 'qb_registrar_pago', 'solicitar_factura', 'consultar_factura', 'analizar_publicaciones_ml', 'ver_metricas_ml', 'extraer_voz_del_cliente', 'extraer_tono_de_marca', 'revisar_desempeno_equipo', 'aprobar_gasto', 'evaluar_limite_gasto', 'verificar_gasto_recurrente', 'reportar_falla'],
};

type ToolDef = Record<string, unknown>;
type ServerFn = (path: string, extraQuery?: Record<string, string>) => unknown;

// Returns the Vapi tool definition for a given tool name, or null when the tool
// cannot be built for this agent (e.g. transferir_llamada without a transfer number).
// eslint-disable-next-line complexity
function buildToolDef(name: string, agent: VoiceAgent, server: ServerFn): ToolDef | null {
  switch (name) {

    case 'crear_lead': return { type: 'function', function: { name: 'crear_lead', description: 'Registra los datos de un prospecto interesado en contratar servicios (aparece en Llamadas del portal). Si ya lo registraste en los últimos minutos, el sistema hace merge automático — NO re-ejecutes la tool para "confirmar", solo dile al cliente dónde revisar. REGLA CRÍTICA: SIEMPRE después de crear_lead debes invocar también crear_contacto_saliente con el mismo teléfono y motivo del interés, más los tags que MEJOR describan al contacto según lo que sabes de él. Usa tu criterio para elegir tags — piensa en cómo el dueño querría segmentarlo después: nivel de interés ("Interesado", "Curioso", "En evaluación"), tipo de cliente ("B2B", "PYME", "Enterprise", "Retail"), señales de urgencia ("Urgente", "Presupuesto listo"), o categoría ("Lead", "VIP", "Cliente-actual", "Prospecto-frío"). Puedes combinar varios. Si de veras no tienes más info que el interés inicial, ["Lead"] es un fallback aceptable. Son dos tools en un solo turno.', parameters: { type: 'object', properties: { nombre: { type: 'string', description: 'Nombre completo del prospecto' }, negocio: { type: 'string', description: 'Nombre del negocio' }, giro: { type: 'string', description: 'Giro o industria del negocio' }, servicio: { type: 'string', description: 'Servicio que necesita' }, presupuesto: { type: 'string', description: 'Presupuesto aproximado' }, timeline: { type: 'string', description: 'Para cuándo lo necesita' }, email: { type: 'string', description: 'Correo electrónico' }, whatsapp: { type: 'string', description: 'Número de WhatsApp' } }, required: ['nombre', 'servicio'] } }, server: server('crear-lead') };

    case 'crear_contacto_saliente': return { type: 'function', function: { name: 'crear_contacto_saliente', description: 'Agrega un prospecto a la lista de contactos salientes para llamarle después (aparece en la sección Campañas del portal). Debe invocarse SIEMPRE junto con crear_lead (mismo turno) para que todo prospecto registrado quede también visible en Campañas. También úsala independiente cuando el cliente pida seguimiento por llamada. NO la confundas con agregar_tag_contacto (esa solo etiqueta contactos que YA existen).', parameters: { type: 'object', properties: { nombre: { type: 'string', description: 'Nombre del contacto' }, telefono: { type: 'string', description: 'Teléfono a llamar (obligatorio)' }, email: { type: 'string', description: 'Correo del contacto (opcional)' }, motivo: { type: 'string', description: 'Motivo o contexto de la llamada de seguimiento' }, tags: { type: 'array', items: { type: 'string' }, description: 'Etiquetas para clasificar el contacto — usa TU criterio según lo que sepas del prospecto. Piensa cómo el dueño querría segmentarlo después. Ejemplos: nivel de interés ("Interesado", "Curioso"), tipo ("B2B", "PYME", "Enterprise"), urgencia ("Urgente", "Presupuesto listo"), categoría ("Lead", "VIP", "Cliente-actual"). Puedes combinar varios. ["Lead"] es fallback aceptable si no hay más info.' }, scheduled_at: { type: 'string', description: 'Fecha/hora ISO 8601 sugerida para la llamada (opcional). Si se omite, queda en pending sin agendar.' } }, required: ['telefono'] } }, server: server('crear-contacto-saliente') };

    case 'agendar_cita': return { type: 'function', function: { name: 'agendar_cita', description: 'Agenda, modifica o cancela una cita. CRITICO: para agendar/modificar SIEMPRE debes mandar fecha_iso (YYYY-MM-DD) y hora (HH:MM 24h) — si las omites el sistema RECHAZA la operacion. Para cancelar solo necesitas telefono.', parameters: { type: 'object', properties: { accion: { type: 'string', enum: ['agendar', 'modificar', 'cancelar'], description: 'Acción a realizar' }, nombre: { type: 'string', description: 'Nombre del cliente' }, servicio: { type: 'string', description: 'Servicio para la cita' }, fecha: { type: 'string', description: 'Fecha en lenguaje natural para mostrar al cliente (ej: lunes 23 de junio)' }, fecha_iso: { type: 'string', description: 'Fecha ISO YYYY-MM-DD (ej: 2026-08-07). OBLIGATORIA para agendar/modificar. Confirma el ANIO correcto (no repitas 2025 si estamos en 2026).' }, hora: { type: 'string', description: 'Hora en formato HH:MM 24h (ej: 14:30 para 2:30pm). OBLIGATORIA para agendar/modificar.' }, duracion_min: { type: 'number', description: 'Duracion estimada de la cita en minutos. Default 60.' }, telefono: { type: 'string', description: 'Teléfono de confirmación' } }, required: ['accion', 'nombre'] } }, server: server('agendar-cita') };

    case 'registrar_pedido': return { type: 'function', function: { name: 'registrar_pedido', description: 'Registra un pedido por teléfono.', parameters: { type: 'object', properties: { nombre: { type: 'string', description: 'Nombre del cliente' }, telefono: { type: 'string', description: 'Teléfono del cliente' }, items: { type: 'string', description: 'Descripción de los productos o servicios pedidos' }, tipo: { type: 'string', enum: ['entrega', 'recoger'], description: 'Entrega a domicilio o recoger en sucursal' }, direccion: { type: 'string', description: 'Dirección de entrega (solo si tipo es entrega)' }, notas: { type: 'string', description: 'Notas adicionales del pedido' } }, required: ['nombre', 'items', 'tipo'] } }, server: server('registrar-pedido') };

    case 'buscar_cliente': return { type: 'function', function: { name: 'buscar_cliente', description: 'Busca el historial e información de un cliente existente por nombre o teléfono.', parameters: { type: 'object', properties: { identificador: { type: 'string', description: 'Nombre completo, número de teléfono, o WhatsApp del cliente' } }, required: ['identificador'] } }, server: server('buscar-cliente') };

    case 'notificar_transferencia': return { type: 'function', function: { name: 'notificar_transferencia', description: 'Notifica al equipo por WhatsApp que viene una transferencia. Llama a esta herramienta PRIMERO, luego usa transferir_llamada.', parameters: { type: 'object', properties: { nombre: { type: 'string', description: 'Nombre del cliente' }, motivo: { type: 'string', description: 'Motivo de la transferencia' }, resumen: { type: 'string', description: 'Resumen breve de la conversación' } }, required: ['motivo'] } }, server: server('notificar-transferencia') };

    case 'transferir_llamada':
      if (!agent.transfer_number) return null;
      return { type: 'transferCall', function: { name: 'transferir_llamada', description: 'Transfiere la llamada en tiempo real al equipo. Úsala DESPUÉS de notificar_transferencia cuando el cliente quiera hablar con un humano.', parameters: { type: 'object', properties: {} } }, destinations: [{ type: 'number', number: agent.transfer_number, message: 'Un momento por favor, te estoy comunicando con el equipo.' }], messages: [{ type: 'request-start', content: 'Claro, con mucho gusto te comunico con el equipo ahora mismo.' }] };

    case 'registrar_encuesta': return { type: 'function', function: { name: 'registrar_encuesta', description: 'Registra las respuestas capturadas de una encuesta de satisfacción. Llámala en cuanto tengas al menos una respuesta y el cliente se vaya a despedir, o cuando hayas recabado todas. Puedes haber recopilado las respuestas a lo largo de toda la conversación o al final; lo que importa es registrarlas antes de cerrar la llamada.', parameters: { type: 'object', properties: { survey_id: { type: 'string', description: 'ID de la encuesta activa (proporcionado en el prompt).' }, respuestas: { type: 'array', description: 'Lista de respuestas, una por pregunta.', items: { type: 'object', properties: { orden: { type: 'number', description: 'Número de orden de la pregunta (1, 2, 3…).' }, valor: { type: 'string', description: 'Respuesta del cliente.' } }, required: ['orden', 'valor'] } }, caller_number: { type: 'string', description: 'Número del llamante (opcional).' }, call_id: { type: 'string', description: 'ID de la llamada Vapi (opcional).' } }, required: ['survey_id', 'respuestas'] } }, server: server('registrar-encuesta') };

    case 'consultar_agente': return { type: 'function', function: { name: 'consultar_agente', description: 'Pregunta a otro agente del equipo algo que está fuera de tu conocimiento y necesitas su respuesta para continuar la conversación. El agente consultado responde con información o criterio experto. NO ejecuta acciones — solo responde. Úsala cuando necesites información que tiene otro especialista.', parameters: { type: 'object', properties: { rol: { type: 'string', description: 'Nombre o rol del agente a consultar. Ej: "administrativo", "técnico de redes", "recursos humanos".' }, tarea: { type: 'string', description: 'Pregunta específica que le haces al agente.' }, contexto: { type: 'string', description: 'Contexto relevante de la conversación (opcional).' }, caller_verified: { type: 'boolean', description: 'OBLIGATORIO cuando la consulta requiere info interna. Pon TRUE solo si el llamante ya se verificó con passphrase o número reconocido. Pon FALSE si es cliente externo o si dudas. Con FALSE, el compañero consultado rechazará compartir info interna automáticamente. Default: false.' } }, required: ['rol', 'tarea'] } }, server: server('consultar-agente') };

    case 'delegar_tarea': return { type: 'function', function: { name: 'delegar_tarea', description: 'Delega una tarea a otro agente del equipo para que la EJECUTE. El agente delegado toma acción real: envía correos, crea tickets, genera documentos, etc. Úsala cuando recibas una tarea que corresponde a otro especialista y que debes pasarle para que él la lleve a cabo. Espera la confirmación de lo que hizo.', parameters: { type: 'object', properties: { agente: { type: 'string', description: 'Nombre o rol del agente que debe ejecutar la tarea. Ej: "administrativo", "técnico de redes", "recursos humanos".' }, tarea: { type: 'string', description: 'Descripción detallada de la tarea a ejecutar, incluyendo toda la información necesaria (nombres, correos, teléfonos, detalles).' }, contexto: { type: 'string', description: 'Contexto de la conversación o solicitud original (opcional pero recomendado).' }, caller_verified: { type: 'boolean', description: 'OBLIGATORIO cuando la tarea requiere acceso interno (docs, contratos, plantillas, datos fiscales, clientes existentes). Pon TRUE solo si el llamante ya se verificó con passphrase o número reconocido de tu equipo. Pon FALSE si es un cliente externo o si no estás seguro. Con FALSE, el agente delegado rechazará acciones sensibles automáticamente. Default: false.' } }, required: ['agente', 'tarea'] } }, server: server('delegar-tarea') };

    case 'enviar_correo': return { type: 'function', function: { name: 'enviar_correo', description: 'Envía un correo electrónico a cualquier persona en nombre del dueño. Puede incluir un archivo de Drive/OneDrive como adjunto si el dueño lo pide. Úsala cuando el dueño te pida enviar un correo durante la llamada.', parameters: { type: 'object', properties: { to: { type: 'string', description: 'Dirección de correo del destinatario' }, subject: { type: 'string', description: 'Asunto del correo' }, body: { type: 'string', description: 'Cuerpo del correo' }, attachment_file_id: { type: 'string', description: 'ID del archivo de Drive/OneDrive obtenido de buscar_archivo (opcional)' }, attachment_file_name: { type: 'string', description: 'Nombre del archivo adjunto con extensión (opcional)' }, attachment_mime_type: { type: 'string', description: 'Tipo MIME del archivo (opcional)' } }, required: ['to', 'subject', 'body'] } }, server: server('enviar-correo') };

    case 'crear_documento': return { type: 'function', function: { name: 'crear_documento', description: 'Genera un documento PDF con el logo y colores del negocio y lo envía al correo del dueño. Usa template_type="proposal" para propuestas (incluye cliente y precio), "letter" para cartas formales, "general" para cualquier otro documento. ANTES de crear uno nuevo, considera usar buscar_documento_oficina para ver si ya existe uno similar reutilizable.', parameters: { type: 'object', properties: { title: { type: 'string', description: 'Título del documento' }, content: { type: 'string', description: 'Contenido. Usa # para secciones y ## para subsecciones.' }, filename: { type: 'string', description: 'Nombre del archivo sin extensión' }, template_type: { type: 'string', enum: ['general', 'proposal', 'letter'], description: 'Tipo de template' }, client_name: { type: 'string', description: 'Nombre del cliente (proposal)' }, client_email: { type: 'string', description: 'Correo del cliente (proposal)' }, total_price: { type: 'string', description: 'Precio total destacado. Ej: "$50,000 MXN" (proposal)' }, validity_days: { type: 'number', description: 'Días de validez (proposal)' }, recipient_name: { type: 'string', description: 'Nombre del destinatario (letter)' } }, required: ['title', 'content'] } }, server: server('crear-documento') };

    case 'buscar_documento_oficina': return { type: 'function', function: { name: 'buscar_documento_oficina', description: 'Busca documentos ya generados y guardados en la Oficina del negocio (facturas, cotizaciones, cartas, propuestas, one-pagers, pitch decks, reportes Excel, órdenes). Úsala cuando el cliente pida "el documento que le mandé la semana pasada" o cuando quieras reutilizar algo antes de generar nuevo. Devuelve una lista con id, título, tipo, folio y fecha — luego usa enviar_documento_oficina con el id para adjuntarlo a un correo. Si no estás seguro del tipo exacto, OMITE el parámetro kind y busca solo por query.', parameters: { type: 'object', properties: { query: { type: 'string', description: 'Texto para buscar en título, filename o folio. Opcional. Ej: "CRM", "ACME".' }, kind: { type: 'string', enum: ['propuesta', 'cotizacion', 'one_pager', 'pitch_deck', 'report_excel', 'correo', 'factura', 'orden_compra', 'proposal', 'letter', 'general', 'nota_venta', 'excel', 'word', 'powerpoint'], description: 'Filtro por tipo EXACTO. Si no estás seguro, OMITE este parámetro.' }, cliente: { type: 'string', description: 'Filtro por nombre del cliente (fuzzy).' }, limit: { type: 'number', description: 'Máximo de resultados. Default 10, máximo 50.' } }, required: [] } }, server: server('buscar-documento-oficina') };

    case 'enviar_documento_oficina': return { type: 'function', function: { name: 'enviar_documento_oficina', description: 'Adjunta un documento ya existente de la Oficina a un correo saliente. Requiere document_id previamente obtenido de buscar_documento_oficina. Úsala cuando el cliente pida reenviar algo ("mándame de nuevo la cotización de la semana pasada").', parameters: { type: 'object', properties: { document_id: { type: 'string', description: 'ID del documento devuelto por buscar_documento_oficina (uuid).' }, to: { type: 'string', description: 'Correo del destinatario.' }, subject: { type: 'string', description: 'Asunto del correo.' }, body: { type: 'string', description: 'Cuerpo del correo. Texto plano — se convierte a HTML.' } }, required: ['document_id', 'to', 'subject', 'body'] } }, server: server('enviar-documento-oficina') };

    // ─── Pilar 2 Creatividad ────────────────────────────────────────────────
    // Todas van al mismo route /api/voice/tools/creativity con ?tool=<name>.
    // El route despacha vía executeAgentTool. Ver meerkat-gates.ts para
    // saber qué rol tiene acceso a qué tool — la distribución en MEERKAT_VOICE_DISTRIBUTION
    // debe respetar esos gates.

    case 'generar_propuesta_comercial': return { type: 'function', function: { name: 'generar_propuesta_comercial', description: 'Genera una propuesta comercial en PDF con el branding del negocio y la manda como enlace descargable. Úsala cuando ya calificaste al lead y necesitas mandar propuesta escrita. NO uses crear_documento para propuestas — este tool tiene diseño ejecutivo y guarda folio.', parameters: { type: 'object', properties: { client_name:   { type: 'string', description: 'Nombre del cliente o empresa.' }, client_need:   { type: 'string', description: 'Qué está pidiendo el cliente (servicio, alcance, contexto).' }, extra_context: { type: 'string', description: 'Contexto extra opcional (montos, plazos, referencias).' } }, required: ['client_name', 'client_need'] } }, server: server('creativity', { tool: 'generar_propuesta_comercial' }) };

    case 'generar_cotizacion': return { type: 'function', function: { name: 'generar_cotizacion', description: 'Genera una cotización PDF con precios, condiciones de pago y folio COT-XXXXXX. Diseñada para cerrar venta. Puede recibir items detallados (descripción, cantidad, precio unitario) o quedarse en formato narrativo si no los tienes.', parameters: { type: 'object', properties: { client_name:   { type: 'string', description: 'Nombre del cliente.' }, client_need:   { type: 'string', description: 'Producto o servicio cotizado.' }, extra_context: { type: 'string', description: 'Cantidades, condiciones, vigencia, notas para el vendedor.' } }, required: ['client_name', 'client_need'] } }, server: server('creativity', { tool: 'generar_cotizacion' }) };

    case 'generar_one_pager': return { type: 'function', function: { name: 'generar_one_pager', description: 'Genera un one-pager ejecutivo (PDF de 1 página con secciones en cajas de color) para mandar info corta y visual a un cliente que pidió más detalle sobre un servicio. Ideal cuando aún no toca cotizar.', parameters: { type: 'object', properties: { client_name:   { type: 'string', description: 'Nombre del cliente destinatario.' }, client_need:   { type: 'string', description: 'Servicio sobre el cual informar.' }, extra_context: { type: 'string', description: 'Diferenciadores, casos de éxito, contexto extra opcional.' } }, required: ['client_name', 'client_need'] } }, server: server('creativity', { tool: 'generar_one_pager' }) };

    case 'generar_correo_estructurado': return { type: 'function', function: { name: 'generar_correo_estructurado', description: 'Genera un borrador de correo largo y estructurado (con secciones, bullets y cierre). Devuelve subject + cuerpo listo para revisar. NO envía el correo — para eso usa enviar_correo o enviar_documento_oficina después. Úsala cuando el correo requiere formato de negocio, no solo texto suelto.', parameters: { type: 'object', properties: { client_name:   { type: 'string', description: 'Nombre del destinatario.' }, client_need:   { type: 'string', description: 'Tema del correo (follow-up, propuesta, respuesta técnica, etc.).' }, extra_context: { type: 'string', description: 'Puntos que debe cubrir el correo, tono, urgencia.' } }, required: ['client_name', 'client_need'] } }, server: server('creativity', { tool: 'generar_correo_estructurado' }) };

    case 'generar_pitch_deck': return { type: 'function', function: { name: 'generar_pitch_deck', description: 'Genera un pitch deck de PowerPoint editable (8-10 slides con logo, colores del negocio y estructura estándar: portada, problema, propuesta, alcance, timeline, inversión, contacto). Úsala cuando el cliente va a ver presentación formal.', parameters: { type: 'object', properties: { client_name:   { type: 'string', description: 'Nombre del cliente destinatario.' }, client_need:   { type: 'string', description: 'Qué está buscando el cliente (alcance, objetivo de la presentación).' }, extra_context: { type: 'string', description: 'Número de slides deseado, tono, temas a cubrir.' } }, required: ['client_name', 'client_need'] } }, server: server('creativity', { tool: 'generar_pitch_deck' }) };

    case 'generar_reporte_metricas_excel': return { type: 'function', function: { name: 'generar_reporte_metricas_excel', description: 'Genera un reporte Excel con métricas del período (hojas separadas según tu rol: Noah = leads/citas/conversión, Nara = tareas/estatus, Nelia = tickets/escalaciones). Con branding del negocio.', parameters: { type: 'object', properties: { window_days: { type: 'number', enum: [7, 30], description: 'Ventana en días. 7 o 30. Default 7.' } }, required: [] } }, server: server('creativity', { tool: 'generar_reporte_metricas_excel' }) };

    case 'solicitar_factura': return { type: 'function', function: { name: 'solicitar_factura', description: 'Úsala cuando el cliente pida factura: "necesito factura", "quiero mi factura", "facturame", "me pueden facturar", "hazme una factura". Recolecta los 6 datos fiscales uno por uno (razón social, RFC, correo, uso CFDI, forma pago, método pago), confirma repitiéndolos, y luego invoca. Aunque diga "MI factura", siempre trátalo como NUEVA solicitud. No uses crear_documento para facturas fiscales — el equipo de facturación las emite en su PAC.', parameters: { type: 'object', properties: { cliente_nombre: { type: 'string', description: 'Razón social o nombre completo' }, cliente_rfc: { type: 'string', description: 'RFC del receptor (12-13 chars)' }, cliente_email: { type: 'string', description: 'Correo donde llegará el CFDI (confirmar con el cliente)' }, cliente_telefono: { type: 'string', description: 'Teléfono del cliente (opcional)' }, uso_cfdi: { type: 'string', description: 'Uso CFDI SAT. Ej: G03 gastos generales, G01 mercancías, P01 por definir. PREGUNTA al cliente cuál.' }, forma_pago: { type: 'string', description: 'Forma de pago SAT. Ej: 01 efectivo, 03 transferencia, 04 tarjeta crédito, 28 tarjeta débito. PREGUNTA cómo pagó.' }, metodo_pago: { type: 'string', enum: ['PUE','PPD'], description: 'PUE=pago en una sola exhibición (contado). PPD=pago en parcialidades (crédito). PREGUNTA al cliente.' }, condiciones_pago: { type: 'string', description: 'Condiciones textuales opcionales (ej. Crédito 30 días)' }, items: { type: 'array', description: 'Conceptos a facturar (descripcion, cantidad, precio_unitario en MXN sin IVA)', items: { type: 'object', properties: { descripcion: { type: 'string' }, cantidad: { type: 'number' }, precio_unitario: { type: 'number' }, unidad: { type: 'string' } }, required: ['descripcion','cantidad','precio_unitario'] } }, incluir_iva: { type: 'boolean', description: 'Incluir IVA 16%. Default true.' }, notes: { type: 'string', description: 'Notas internas para el equipo de facturación (no salen en el CFDI)' } }, required: ['cliente_nombre','cliente_rfc','cliente_email','uso_cfdi','forma_pago','metodo_pago','items'] } }, server: server('solicitar-factura') };

    case 'consultar_factura': return { type: 'function', function: { name: 'consultar_factura', description: 'Úsala SOLO cuando el cliente hace SEGUIMIENTO a una solicitud PREVIA de factura. Frases típicas: "¿ya me emitieron la factura que pedí?", "la factura que solicité ayer, ¿ya está?", "hace 3 días pedí mi factura, ¿ya me la mandaron?", "quiero saber el estado de mi factura que pedí". El cliente debe mencionar EXPLÍCITAMENTE una solicitud previa (fecha, "la que pedí", "la que solicité", "ya está?"). Si el cliente solo dice "necesito mi factura" o "quiero mi factura" SIN mencionar solicitud previa, NO uses esta tool — usa solicitar_factura para levantar una NUEVA.', parameters: { type: 'object', properties: { cliente_rfc: { type: 'string', description: 'RFC exacto del cliente' }, cliente_nombre: { type: 'string', description: 'Nombre parcial (si no tienes RFC)' } } } }, server: server('consultar-factura') };

    case 'llamar_a': return { type: 'function', function: { name: 'llamar_a', description: 'Realiza una llamada telefónica saliente a un número en nombre del dueño. Úsala cuando el dueño pida llamar a alguien durante la conversación.', parameters: { type: 'object', properties: { numero: { type: 'string', description: 'Número de teléfono con código de país. Ej: +5218113333333' }, nombre: { type: 'string', description: 'Nombre del contacto a llamar' }, mensaje: { type: 'string', description: 'Motivo de la llamada o mensaje para el contacto' } }, required: ['numero', 'mensaje'] } }, server: server('llamar-a') };

    case 'buscar_archivo': return { type: 'function', function: { name: 'buscar_archivo', description: 'Busca un archivo en Google Drive o OneDrive del dueño. Úsala cuando el dueño pida buscar un documento durante la llamada.', parameters: { type: 'object', properties: { busqueda: { type: 'string', description: 'Nombre o descripción del archivo a buscar' } }, required: ['busqueda'] } }, server: server('buscar-archivo') };

    case 'leer_archivo': return { type: 'function', function: { name: 'leer_archivo', description: 'Lee y extrae el contenido de texto de un archivo de Drive/OneDrive. Úsala después de buscar_archivo para acceder al contenido del documento.', parameters: { type: 'object', properties: { file_id: { type: 'string', description: 'ID del archivo (obtenido de buscar_archivo)' }, file_name: { type: 'string', description: 'Nombre del archivo para referencia' } }, required: ['file_id'] } }, server: server('leer-archivo') };

    case 'save_to_drive': return { type: 'function', function: { name: 'save_to_drive', description: 'Sube a Google Drive/OneDrive del dueño un archivo previamente generado por crear_documento (que devuelve un file_id). Úsala DESPUÉS de crear_documento cuando el dueño quiera que el archivo quede en su Drive/OneDrive.', parameters: { type: 'object', properties: { file_id: { type: 'string', description: 'file_id devuelto por crear_documento (ej: "uuid/nombre-1234567890.pdf")' }, filename: { type: 'string', description: 'Nombre del archivo en Drive/OneDrive, con extensión. Ej: "Propuesta Acme 2026.pdf"' }, folder_name: { type: 'string', description: 'Carpeta de destino en Drive/OneDrive (se crea si no existe). Opcional.' } }, required: ['file_id', 'filename'] } }, server: server('save-to-drive') };

    case 'create_file': return { type: 'function', function: { name: 'create_file', description: 'Crea un archivo de texto o documento en Google Drive/OneDrive del dueño.', parameters: { type: 'object', properties: { nombre: { type: 'string', description: 'Nombre del archivo con extensión (ej: reporte.txt)' }, contenido: { type: 'string', description: 'Contenido del archivo' }, carpeta: { type: 'string', description: 'Carpeta destino en Drive/OneDrive (opcional)' } }, required: ['nombre', 'contenido'] } }, server: server('create-file') };

    case 'organize_files': return { type: 'function', function: { name: 'organize_files', description: 'Organiza, mueve o renombra archivos en Google Drive/OneDrive del dueño.', parameters: { type: 'object', properties: { instruccion: { type: 'string', description: 'Qué hacer: mover, renombrar, crear carpeta, etc.' }, archivo_id: { type: 'string', description: 'ID del archivo a organizar (opcional)' }, destino: { type: 'string', description: 'Carpeta destino o nuevo nombre' } }, required: ['instruccion'] } }, server: server('organize-files') };

    case 'create_contract_draft': return { type: 'function', function: { name: 'create_contract_draft', description: 'Genera un borrador de contrato comercial en PDF y lo guarda en Drive. Úsala cuando el dueño pida preparar un contrato con un cliente.', parameters: { type: 'object', properties: { tipo: { type: 'string', description: 'Tipo de contrato: servicios, arrendamiento, compraventa, confidencialidad, etc.' }, cliente_nombre: { type: 'string', description: 'Nombre completo del cliente o empresa' }, cliente_rfc: { type: 'string', description: 'RFC del cliente (opcional)' }, descripcion: { type: 'string', description: 'Descripción del servicio o producto contratado' }, monto: { type: 'string', description: 'Monto total del contrato (ej: $50,000 MXN)' }, vigencia: { type: 'string', description: 'Duración o fecha de vencimiento del contrato' }, notas: { type: 'string', description: 'Cláusulas especiales o notas adicionales (opcional)' } }, required: ['tipo', 'cliente_nombre', 'descripcion'] } }, server: server('create-contract-draft') };

    case 'crear_ticket': return { type: 'function', function: { name: 'crear_ticket', description: 'Crea un ticket de soporte IT en la mesa de ayuda. Úsala cuando el usuario reporte un problema técnico. Asigna automáticamente al técnico según el tipo de problema.', parameters: { type: 'object', properties: { titulo: { type: 'string', description: 'Título breve del problema reportado' }, categoria: { type: 'string', enum: ['red', 'servidores', 'usuario', 'software', 'hardware', 'accesos', 'otro'], description: 'Categoría del problema' }, prioridad: { type: 'string', enum: ['baja', 'normal', 'alta', 'critica'], description: 'Prioridad del ticket' }, descripcion: { type: 'string', description: 'Descripción detallada del problema' }, caller_number: { type: 'string', description: 'Número de teléfono del usuario que llama' } }, required: ['titulo', 'categoria', 'prioridad'] } }, server: server('crear-ticket') };

    case 'consultar_incidentes': return { type: 'function', function: { name: 'consultar_incidentes', description: 'Consulta si hay incidentes activos en el sistema. Úsala al inicio de cada llamada de soporte para avisar al usuario sobre problemas conocidos antes de crear un ticket.', parameters: { type: 'object', properties: { tema: { type: 'string', description: 'Tema o sistema sobre el que pregunta el usuario (ej: internet, SAP, correo). Opcional.' } } } }, server: server('consultar-incidentes') };

    case 'buscar_directorio': return { type: 'function', function: { name: 'buscar_directorio', description: 'Busca en el directorio interno quién atiende un tipo de problema específico. Úsala para referir al usuario con el técnico o área correcta.', parameters: { type: 'object', properties: { tipo_problema: { type: 'string', description: 'Tipo de problema o área que se busca (ej: red, VPN, impresoras, SAP)' } }, required: ['tipo_problema'] } }, server: server('buscar-directorio') };

    case 'buscar_en_web': return { type: 'function', function: { name: 'buscar_en_web', description: 'Busca información actualizada en internet sobre un tema, empresa, producto o persona.', parameters: { type: 'object', properties: { query: { type: 'string', description: 'Término de búsqueda o pregunta a investigar' } }, required: ['query'] } }, server: server('buscar-en-web') };

    case 'extraer_voz_del_cliente': return { type: 'function', function: { name: 'extraer_voz_del_cliente', description: 'Analiza conversaciones reales de esta organización (llamadas, correos o tickets) y extrae el lenguaje literal del cliente, sus objeciones más frecuentes y candidatos de titular. Úsala cuando el dueño pida entender qué dicen sus clientes o preparar copy con sus palabras. Requiere mínimo de muestras para producir análisis útil.', parameters: { type: 'object', properties: { fuente: { type: 'string', enum: ['calls','emails','tickets','all'], description: 'Canal a analizar. Default "all".' }, dias: { type: 'number', description: 'Días hacia atrás. Default 30.' }, min_muestras: { type: 'number', description: 'Mínimo de muestras exigidas. Default 20.' } }, required: [] } }, server: server('extraer-voz-del-cliente') };

    case 'extraer_tono_de_marca': return { type: 'function', function: { name: 'extraer_tono_de_marca', description: 'Analiza muestras reales del negocio (correos previos, copy del sitio, pitch) y extrae una guía de tono que se inyecta en el system prompt de todos los empleados. Después de esto los empleados hablan como esta marca en vez de con tono genérico.', parameters: { type: 'object', properties: { muestras: { type: 'array', items: { type: 'string' }, description: 'Lista de 2 a 6 textos reales del negocio.' } }, required: ['muestras'] } }, server: server('extraer-tono-de-marca') };

    case 'revisar_desempeno_equipo': return { type: 'function', function: { name: 'revisar_desempeno_equipo', description: 'Devuelve un resumen del desempeño del equipo: llamadas, tareas completadas/fallidas, documentos generados, correos gestionados, ops usadas — desglosado por cada empleado. Exclusiva de directores (Niva). Úsala cuando el dueño pregunte "¿cómo va el equipo esta semana?" o similar.', parameters: { type: 'object', properties: { periodo: { type: 'string', enum: ['hoy', 'esta_semana', 'este_mes', 'ultima_semana', 'ultimo_mes', 'ultimos_30_dias'], description: 'Ventana temporal. Default esta_semana.' } }, required: [] } }, server: server('exec/revisar_desempeno_equipo') };

    case 'aprobar_gasto': return { type: 'function', function: { name: 'aprobar_gasto', description: 'Registra la aprobación (o rechazo) de un gasto operativo propuesto por el equipo. Deja audit trail: quién aprobó, concepto, monto, justificación. Exclusiva de directores (Niva).', parameters: { type: 'object', properties: { concepto: { type: 'string', description: 'Concepto del gasto. Ej: "Publicidad Facebook oct 2026", "Renovación licencia software X".' }, monto: { type: 'number', description: 'Monto en MXN. Solo dígitos, sin símbolo de moneda.' }, justificacion: { type: 'string', description: 'Razón de la aprobación o rechazo (opcional).' }, status: { type: 'string', enum: ['approved', 'rejected'], description: 'approved (default) o rejected.' } }, required: ['concepto', 'monto'] } }, server: server('exec/aprobar_gasto') };

    case 'evaluar_limite_gasto': return { type: 'function', function: { name: 'evaluar_limite_gasto', description: 'Verifica si un gasto propuesto cabe en el presupuesto mensual de la organización. Devuelve: presupuesto configurado, gastado este mes, y si excede el límite. Invócala ANTES de aprobar_gasto para decidir con datos.', parameters: { type: 'object', properties: { monto: { type: 'number', description: 'Monto en MXN del gasto que se está evaluando.' } }, required: ['monto'] } }, server: server('exec/evaluar_limite_gasto') };

    case 'verificar_gasto_recurrente': return { type: 'function', function: { name: 'verificar_gasto_recurrente', description: 'Consulta el historial de facturas recibidas de un proveedor. Devuelve si es recurrente (≥2 facturas aprobadas antes), monto del último pago, y variación con el monto actual. Úsala en facturas de proveedor para decidir si auto-marcar como pagada o escalar al humano.', parameters: { type: 'object', properties: { proveedor: { type: 'string', description: 'Nombre del proveedor (o email si no tienes nombre).' }, monto: { type: 'number', description: 'Monto de la factura actual en MXN (opcional, para detectar variación anómala).' } }, required: ['proveedor'] } }, server: server('exec/verificar_gasto_recurrente') };

    case 'sheets_agregar_fila': return { type: 'function', function: { name: 'sheets_agregar_fila', description: 'Agrega fila al Google Sheet configurado. purpose = clientes/leads/bitacoras/oc/cajas_chicas/custom. Úsala cuando el llamante pida registrar algo en el Sheet del negocio.', parameters: { type: 'object', properties: { purpose: { type: 'string', enum: ['clientes','leads','bitacoras','oc','cajas_chicas','custom'] }, custom_purpose_label: { type: 'string' }, data: { type: 'object', description: 'Objeto {columna: valor} con encabezados del Sheet.' } }, required: ['purpose', 'data'] } }, server: server('exec/sheets_agregar_fila') };

    case 'sheets_actualizar_fila': return { type: 'function', function: { name: 'sheets_actualizar_fila', description: 'Actualiza fila existente buscando por columna y valor.', parameters: { type: 'object', properties: { purpose: { type: 'string', enum: ['clientes','leads','bitacoras','oc','cajas_chicas','custom'] }, custom_purpose_label: { type: 'string' }, match_by: { type: 'string' }, match_value: { type: 'string' }, data: { type: 'object' } }, required: ['purpose', 'match_by', 'match_value', 'data'] } }, server: server('exec/sheets_actualizar_fila') };

    case 'sheets_leer': return { type: 'function', function: { name: 'sheets_leer', description: 'Lee todo el contenido del Google Sheet.', parameters: { type: 'object', properties: { purpose: { type: 'string', enum: ['clientes','leads','bitacoras','oc','cajas_chicas','custom'] }, custom_purpose_label: { type: 'string' }, range: { type: 'string' } }, required: ['purpose'] } }, server: server('exec/sheets_leer') };

    case 'sheets_buscar': return { type: 'function', function: { name: 'sheets_buscar', description: 'Busca filas del Google Sheet por texto (case-insensitive).', parameters: { type: 'object', properties: { purpose: { type: 'string', enum: ['clientes','leads','bitacoras','oc','cajas_chicas','custom'] }, custom_purpose_label: { type: 'string' }, query: { type: 'string' } }, required: ['purpose', 'query'] } }, server: server('exec/sheets_buscar') };

    case 'read_url': return { type: 'function', function: { name: 'read_url', description: 'Lee y extrae el contenido de texto de una URL pública. Úsala para obtener información de páginas web específicas.', parameters: { type: 'object', properties: { url: { type: 'string', description: 'URL completa a leer (ej: https://example.com/page)' } }, required: ['url'] } }, server: server('read-url') };

    case 'search_leads': return { type: 'function', function: { name: 'search_leads', description: 'Busca prospectos en el CRM por nombre, negocio, giro o servicio.', parameters: { type: 'object', properties: { query: { type: 'string', description: 'Nombre, negocio, giro o servicio del prospecto a buscar' } }, required: ['query'] } }, server: server('search-leads') };

    case 'analizar_publicaciones_ml': return { type: 'function', function: { name: 'analizar_publicaciones_ml', description: 'Analiza las publicaciones activas del negocio en MercadoLibre: estado, visitas, ventas y oportunidades de mejora.', parameters: { type: 'object', properties: { filtro: { type: 'string', description: 'Filtrar por categoría o texto (opcional)' } } } }, server: server('analizar-publicaciones-ml') };

    case 'crear_publicacion_ml': return { type: 'function', function: { name: 'crear_publicacion_ml', description: 'Crea una nueva publicación en MercadoLibre con los datos del producto.', parameters: { type: 'object', properties: { titulo: { type: 'string', description: 'Título de la publicación' }, descripcion: { type: 'string', description: 'Descripción del producto' }, precio: { type: 'number', description: 'Precio en MXN' }, categoria: { type: 'string', description: 'Categoría del producto' }, condicion: { type: 'string', enum: ['nuevo', 'usado'], description: 'Condición del producto' }, stock: { type: 'number', description: 'Cantidad disponible' } }, required: ['titulo', 'precio'] } }, server: server('crear-publicacion-ml') };

    case 'actualizar_publicacion_ml': return { type: 'function', function: { name: 'actualizar_publicacion_ml', description: 'Actualiza el precio, stock o descripción de una publicación existente en MercadoLibre.', parameters: { type: 'object', properties: { item_id: { type: 'string', description: 'ID de la publicación (ej: MLM123456789)' }, precio: { type: 'number', description: 'Nuevo precio (opcional)' }, stock: { type: 'number', description: 'Nueva cantidad disponible (opcional)' }, descripcion: { type: 'string', description: 'Nueva descripción (opcional)' }, titulo: { type: 'string', description: 'Nuevo título (opcional)' } }, required: ['item_id'] } }, server: server('actualizar-publicacion-ml') };

    case 'ver_metricas_ml': return { type: 'function', function: { name: 'ver_metricas_ml', description: 'Consulta las métricas de ventas del negocio en MercadoLibre: ventas del mes, ingresos, preguntas pendientes.', parameters: { type: 'object', properties: { periodo: { type: 'string', enum: ['hoy', 'semana', 'mes'], description: 'Período de las métricas' } } } }, server: server('ver-metricas-ml') };

    case 'list_calendar_events': return { type: 'function', function: { name: 'list_calendar_events', description: 'Consulta los eventos del calendario del dueño para una fecha o rango.', parameters: { type: 'object', properties: { fecha: { type: 'string', description: 'Fecha específica (ej: lunes, mañana, 2026-07-25)' }, fecha_fin: { type: 'string', description: 'Fecha de fin para consultar un rango (opcional)' } }, required: ['fecha'] } }, server: server('list-calendar-events') };

    case 'create_calendar_event': return { type: 'function', function: { name: 'create_calendar_event', description: 'Crea un evento en el calendario del dueño.', parameters: { type: 'object', properties: { titulo: { type: 'string', description: 'Título del evento' }, fecha: { type: 'string', description: 'Fecha del evento (ej: lunes 28 de julio)' }, hora_inicio: { type: 'string', description: 'Hora de inicio (ej: 10:00)' }, hora_fin: { type: 'string', description: 'Hora de fin (ej: 11:00)' }, descripcion: { type: 'string', description: 'Descripción o notas del evento (opcional)' }, invitados: { type: 'string', description: 'Correos de invitados separados por coma (opcional)' } }, required: ['titulo', 'fecha', 'hora_inicio'] } }, server: server('create-calendar-event') };

    case 'delete_calendar_event': return { type: 'function', function: { name: 'delete_calendar_event', description: 'Elimina o cancela un evento del calendario del dueño.', parameters: { type: 'object', properties: { evento_id: { type: 'string', description: 'ID del evento a eliminar (obtenido de list_calendar_events)' }, titulo: { type: 'string', description: 'Título del evento (para confirmar al usuario)' } }, required: ['evento_id'] } }, server: server('delete-calendar-event') };

    // Nota: los endpoints reales son en español (crear-reporte / consultar-reporte).
    // Antes apuntaban a `create-civic-report` etc. que NO existen → 404 en prod.
    // Para update usamos el exec shared endpoint (executor.ts maneja update_civic_report).
    case 'create_civic_report': return { type: 'function', function: { name: 'create_civic_report', description: 'Crea un reporte ciudadano: queja, solicitud de servicio o reporte de problema en la vía pública.', parameters: { type: 'object', properties: { tipo: { type: 'string', description: 'Tipo de reporte: queja, solicitud, reporte de daño, etc.' }, descripcion: { type: 'string', description: 'Descripción detallada del problema o solicitud' }, ubicacion: { type: 'string', description: 'Dirección o colonia donde se reporta el problema' }, nombre: { type: 'string', description: 'Nombre del ciudadano reportante' }, telefono: { type: 'string', description: 'Teléfono de contacto del ciudadano' } }, required: ['tipo', 'descripcion'] } }, server: server('crear-reporte') };

    case 'lookup_civic_report': return { type: 'function', function: { name: 'lookup_civic_report', description: 'Consulta el estado de un reporte ciudadano previamente registrado.', parameters: { type: 'object', properties: { folio: { type: 'string', description: 'Número de folio del reporte (opcional)' }, telefono: { type: 'string', description: 'Teléfono del ciudadano para buscar sus reportes (opcional)' } } } }, server: server('consultar-reporte') };

    case 'update_civic_report': return { type: 'function', function: { name: 'update_civic_report', description: 'Actualiza el estado o agrega información adicional a un reporte ciudadano existente.', parameters: { type: 'object', properties: { folio: { type: 'string', description: 'Número de folio del reporte a actualizar' }, estado: { type: 'string', description: 'Nuevo estado del reporte (opcional)' }, nota: { type: 'string', description: 'Nota o información adicional (opcional)' } }, required: ['folio'] } }, server: server('exec/update_civic_report') };

    case 'qb_consultar_facturas': return { type: 'function', function: { name: 'qb_consultar_facturas', description: 'Consulta las facturas en QuickBooks: pendientes de cobro, vencidas o de un cliente específico.', parameters: { type: 'object', properties: { cliente: { type: 'string', description: 'Nombre o ID del cliente (opcional)' }, estado: { type: 'string', enum: ['pendiente', 'vencida', 'pagada', 'todas'], description: 'Estado de las facturas a consultar' }, periodo: { type: 'string', description: 'Período: este mes, este trimestre, etc. (opcional)' } } } }, server: server('qb-consultar-facturas') };

    case 'qb_buscar_cliente': return { type: 'function', function: { name: 'qb_buscar_cliente', description: 'Busca un cliente en QuickBooks por nombre, correo o teléfono.', parameters: { type: 'object', properties: { query: { type: 'string', description: 'Nombre, correo o teléfono del cliente a buscar' } }, required: ['query'] } }, server: server('qb-buscar-cliente') };

    case 'qb_registrar_pago': return { type: 'function', function: { name: 'qb_registrar_pago', description: 'Registra el pago de una factura en QuickBooks.', parameters: { type: 'object', properties: { factura_id: { type: 'string', description: 'ID de la factura en QuickBooks' }, monto: { type: 'number', description: 'Monto del pago en MXN' }, metodo_pago: { type: 'string', description: 'Método de pago: efectivo, transferencia, cheque, tarjeta' }, fecha: { type: 'string', description: 'Fecha del pago (ej: hoy, 2026-07-22). Por defecto hoy.' }, referencia: { type: 'string', description: 'Número de referencia o confirmación (opcional)' } }, required: ['factura_id', 'monto', 'metodo_pago'] } }, server: server('qb-registrar-pago') };

    case 'qb_reporte_ingresos': return { type: 'function', function: { name: 'qb_reporte_ingresos', description: 'Genera un reporte de ingresos y gastos de QuickBooks para un período.', parameters: { type: 'object', properties: { periodo: { type: 'string', description: 'Período: este mes, este trimestre, este año, etc.' } }, required: ['periodo'] } }, server: server('qb-reporte-ingresos') };

    case 'qb_crear_factura': return { type: 'function', function: { name: 'qb_crear_factura', description: 'Crea una nueva factura en QuickBooks para un cliente.', parameters: { type: 'object', properties: { cliente_id: { type: 'string', description: 'ID del cliente en QuickBooks (obtenido de qb_buscar_cliente)' }, descripcion: { type: 'string', description: 'Descripción del servicio o producto facturado' }, monto: { type: 'number', description: 'Monto de la factura en MXN' }, fecha_vence: { type: 'string', description: 'Fecha de vencimiento (ej: en 30 días, 2026-08-22)' }, notas: { type: 'string', description: 'Notas adicionales en la factura (opcional)' } }, required: ['cliente_id', 'descripcion', 'monto'] } }, server: server('qb-crear-factura') };

    case 'iniciar_onboarding': return { type: 'function', function: { name: 'iniciar_onboarding', description: 'Inicia el proceso de onboarding para un nuevo empleado, cliente o proveedor. Envía automáticamente el correo de bienvenida con los pasos a seguir.', parameters: { type: 'object', properties: { contact_name: { type: 'string', description: 'Nombre completo del contacto a registrar en el onboarding' }, contact_email: { type: 'string', description: 'Correo electrónico del contacto' }, template_name: { type: 'string', description: 'Nombre de la plantilla de onboarding a usar (opcional; si no se indica, se usa la primera disponible)' } }, required: ['contact_name', 'contact_email'] } }, server: server('exec/iniciar-onboarding') };

    case 'reportar_falla': return { type: 'function', function: { name: 'reportar_falla', description: 'Envía un reporte de falla o irregularidad al equipo técnico de Centinelia. Úsalo cuando: (1) detectes un comportamiento inesperado en ti mismo, (2) el usuario reporte que algo no funcionó correctamente en llamadas anteriores, (3) encuentres un error del sistema, datos incorrectos o una limitación que impida tu trabajo. No lo uses para quejas del negocio del usuario, solo para fallas técnicas del sistema Centinelia.', parameters: { type: 'object', properties: { tipo: { type: 'string', description: 'Categoría de la falla: "Bug de sistema", "Comportamiento inesperado", "Datos incorrectos", "Limitación técnica" u "Otro".' }, descripcion: { type: 'string', description: 'Descripción clara de la falla: qué ocurrió, cuándo, y cuál debería ser el comportamiento correcto.' }, contexto: { type: 'string', description: 'Contexto relevante de la conversación o llamada donde se detectó la falla (opcional).' } }, required: ['tipo', 'descripcion'] } }, server: server('reportar-falla') };

    case 'marcar_no_llamar': return { type: 'function', function: { name: 'marcar_no_llamar', description: 'Marca un número de teléfono como "no volver a llamar". Úsala inmediatamente cuando el ciudadano diga que no quiere recibir más llamadas ("no me llamen", "quítenme de la lista", "no me interesa"). Los futuros crons de llamadas salientes respetarán esta marca. Después de llamar esta herramienta, termina la llamada con cortesía sin insistir.', parameters: { type: 'object', properties: { telefono: { type: 'string', description: 'Número de teléfono del ciudadano tal como está en el sistema (con o sin lada). Se normaliza automáticamente en el servidor.' }, motivo: { type: 'string', description: 'Motivo breve de la solicitud (ej: "no interesado", "número equivocado", "ya no vive aquí"). Opcional.' } }, required: ['telefono'] } }, server: server('marcar-no-llamar') };

    case 'agregar_tag_contacto': return { type: 'function', function: { name: 'agregar_tag_contacto', description: 'Agrega una etiqueta (tag) a un contacto de outbound_contacts según lo que hayas aprendido en la conversación. Úsala cuando detectes información útil para segmentar futuras campañas: si el cliente compró usa tag "compró"; si mostró interés pero no compró usa "interesado"; si no está listo usa "seguimiento"; si es cliente frecuente usa "vip"; etc. Tags sugeridos: compró, cotizó, interesado, no interesado, seguimiento, vencido, nuevo, vip. Puedes crear tags nuevos si aplican al negocio. Los tags permiten a las campañas futuras filtrar exactamente a quién llamar.', parameters: { type: 'object', properties: { telefono: { type: 'string', description: 'Número de teléfono del contacto. Se normaliza por sufijo de 10 dígitos.' }, tag: { type: 'string', description: 'Tag a agregar. Se guarda en lowercase, sin espacios extra. Max 40 chars.' }, motivo: { type: 'string', description: 'Motivo breve por el que agregas este tag (opcional, para auditoría).' } }, required: ['telefono', 'tag'] } }, server: server('agregar-tag-contacto') };

    case 'pedir_a_humano': return { type: 'function', function: { name: 'pedir_a_humano', description: 'Pide a un humano del equipo del negocio: info que no tienes, una acción física, o confirmación de una decisión importante. Úsala cuando necesitas datos que no están en Drive ni puedes obtener con otras tools, una acción física que solo un humano puede hacer, o aprobación de una decisión que excede tu autoridad. Para llamadas: si tienes minutos y la info, usa trigger_outbound_call primero; solo pide llamada a humano si sin minutos, cliente pidió humano, o conversación delicada. NO la uses para info obtenible con otras tools, cosas que puede hacer otro agente, o llamadas que puedes hacer tú.', parameters: { type: 'object', properties: { type: { type: 'string', enum: ['info', 'action', 'approval'] }, target: { type: 'string', enum: ['approver', 'owner', 'specific'] }, target_email: { type: 'string' }, title: { type: 'string' }, description: { type: 'string' }, urgency: { type: 'string', enum: ['baja', 'media', 'alta'] }, needed_by: { type: 'string' } }, required: ['type', 'target', 'title', 'description'] } }, server: server('exec/pedir_a_humano') };

    default: return null;
  }
}

// ─── Tool creation ────────────────────────────────────────────────────────────

async function createVapiTools(agent: VoiceAgent, peers: TeamPeer[] = []): Promise<string[]> {
  const base  = `${process.env.NEXT_PUBLIC_APP_URL}/api/voice/tools`;
  const id    = agent.id;
  const tools: ToolDef[] = [];
  const server: ServerFn = (path, extraQuery) => {
    const qs = Object.entries(extraQuery ?? {})
      .map(([k, v]) => `&${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join('');
    return {
      url:     `${base}/${path}?agent_id=${id}${qs}`,
      headers: { 'x-vapi-secret': process.env.VAPI_SERVER_SECRET ?? '' },
    };
  };

  const meerkatId = agent.features.meerkat_role_id;
  const roleTools = meerkatId && meerkatId !== 'custom' ? MEERKAT_VOICE_DISTRIBUTION[meerkatId] : null;

  if (roleTools) {
    // Role-based: build each tool from the confirmed distribution
    for (const toolName of roleTools) {
      const def = buildToolDef(toolName, agent, server);
      if (def) tools.push(def);
    }
  } else {
    // Fallback: feature-flag gating for custom agents
    if (agent.features.lead_qualification)                                      tools.push(buildToolDef('crear_lead',              agent, server)!);
    if (agent.features.appointment_booking)                                     tools.push(buildToolDef('agendar_cita',            agent, server)!);
    if (agent.features.order_taking)                                            tools.push(buildToolDef('registrar_pedido',        agent, server)!);
    if (agent.features.existing_client_support || agent.features.client_memory) tools.push(buildToolDef('buscar_cliente',          agent, server)!);
    if (agent.features.smart_transfer) {
      tools.push(buildToolDef('notificar_transferencia', agent, server)!);
      const transferDef = buildToolDef('transferir_llamada', agent, server);
      if (transferDef) tools.push(transferDef);
    }
    if (agent.features.helpdesk) {
      tools.push(buildToolDef('crear_ticket',         agent, server)!);
      tools.push(buildToolDef('consultar_incidentes', agent, server)!);
      tools.push(buildToolDef('buscar_directorio',    agent, server)!);
    }
    if (peers.length > 0) {
      tools.push(buildToolDef('consultar_agente', agent, server)!);
      tools.push(buildToolDef('delegar_tarea',    agent, server)!);
    }
    if (agent.features.of_encuestas) tools.push(buildToolDef('registrar_encuesta', agent, server)!);
    if (agent.features.outbound_calls) tools.push(buildToolDef('marcar_no_llamar', agent, server)!);
    tools.push(buildToolDef('reportar_falla', agent, server)!);
  }

  // TransferCall a peers desactivado: Vapi rechazaba "assistantName not found"
  // aunque el nombre existía exacto, tirando "Call.start.error get assistant"
  // (todas las llamadas fallando). Ver call 019f...430ca (sesion 2026-08-01).
  // El intento con assistantId dio "assistantId should not exist" (schema).
  //
  // Como workaround, mantenemos solo consultar_agente + delegar_tarea para
  // colaboracion con peers, que no requieren referenciar al peer por Vapi ID.
  // El warm transfer a peer es reactivable cuando Vapi documente el pattern
  // correcto o cuando cambiemos a Vapi Squads.

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

// ─── Assistant config builder ─────────────────────────────────────────────────

async function buildVapiAssistant(agent: VoiceAgent, toolIds: string[] = [], peers: TeamPeer[] = [], learnings?: AgentLearnings | null) {
  const agentName = agent.agent_name?.trim() || 'Centinelia';

  const supabaseSync = createAdminClient();
  // Peer awareness block. Fusionado al system message principal (no como
  // mensaje separado) porque Haiku 4.5 ignora system messages secundarios
  // cuando el primero es largo. Ver call 019fbf3f: Sofia dijo "no tengo un
  // compañero llamado Noah" a pesar de que Noah estaba listado en el 2do
  // system message. Al inyectarlo al FINAL del prompt principal aprovechamos
  // el recency bias del LLM.
  let peerBlock = '';
  if (peers.length > 0) {
    const meerkatIdForPeers = agent.features.meerkat_role_id;
    const roleToolsForPeers = meerkatIdForPeers && meerkatIdForPeers !== 'custom'
      ? MEERKAT_VOICE_DISTRIBUTION[meerkatIdForPeers] ?? []
      : [];
    const hasConsultar = roleToolsForPeers.includes('consultar_agente');
    const hasDelegar   = roleToolsForPeers.includes('delegar_tarea');

    const lines = [
      `TU EQUIPO — COMPAÑEROS DISPONIBLES:`,
      `Trabajas junto a otros empleados del mismo negocio. Estos son sus nombres reales, no ficticios. Si un cliente te pregunta si conoces a alguno o te pide consultar con alguno, SÍ los conoces:`,
      ``,
      ...peers.map(p => {
        const label      = peerRoleLabel(p);
        const peerName   = p.agent_name || label;
        const cap        = peerCapabilitySummary(p);
        const toolCaps   = peerToolCapabilities(p);
        const capsSuffix = toolCaps.length > 0 ? ` Puede: ${toolCaps.join(', ')}.` : '';
        return `- ${peerName} (${label}): ${cap}${capsSuffix}`;
      }),
      ``,
      `NUNCA digas "no conozco a ${peers.map(p => p.agent_name || 'ese compañero').join(' / ')}" — esos son tus compañeros de equipo reales.`,
      `Si un compañero te llama, identifícate: "Soy ${agentName}, tu compañero/a de equipo."`,
    ];

    if (hasConsultar || hasDelegar) {
      lines.push(``, `MODOS DE COLABORACIÓN con tu equipo:`);
      if (hasConsultar) lines.push(
        `- consultar_agente(rol, tarea): pregunta puntual a un compañero. En "rol" usa el NOMBRE EXACTO del compañero de tu lista (ej: "Noah", "Nara") — nunca uses roles genéricos como "técnico" o "administrativo". Di "un momento por favor mientras consulto" antes de invocarla. El compañero responde y tú comunicas la respuesta al cliente.`
      );
      if (hasDelegar) lines.push(
        `- delegar_tarea(agente, tarea, success_criteria): para trabajo que toma minutos (cotizaciones, búsquedas amplias, redactar y enviar correos con datos compilados). En "agente" usa el NOMBRE EXACTO. En "tarea" incluye TODO lo necesario para que él la ejecute: correo del cliente, datos, contexto, formato.`
      );
      lines.push(
        `REGLA CRÍTICA — PROMESAS DE CORREO: si le prometes al cliente que "te enviaremos un correo" o "el equipo te contactará", DEBES invocar delegar_tarea ANTES de despedirte. Sin la llamada al tool, la promesa NO se cumple. La tarea debe incluir: (1) correo del cliente confirmado, (2) qué debe hacer el compañero, (3) formato esperado.`
      );
      lines.push(
        `REGLA DE ORO: nunca digas "no puedo ayudarte con eso" o "no conozco a X" si tienes un compañero que puede. Consúltale o deléga.`
      );
    }

    peerBlock = '\n\n' + lines.join('\n');
  }

  const mainSystemPrompt = await buildSystemPrompt(agent, learnings, agent.portal_email ?? undefined, supabaseSync);
  const messages: Array<{ role: string; content: string }> = [
    { role: 'system', content: mainSystemPrompt + peerBlock },
  ];

  const meerkatId = agent.features.meerkat_role_id;
  // Primero resolvemos la versión (aplicando flags + pin + legacy fallback),
  // luego pedimos el config. Esto mete pilar 3 sin cambiar la firma de
  // resolveMeerkatConfig (usada también por golden tests con versión explícita).
  const version = meerkatId
    ? await resolveMeerkatVersionForAgent(meerkatId, {
        portal_email: agent.portal_email ?? null,
        features: agent.features as unknown as { [k: string]: unknown; pinned_meerkat_version?: number | null | undefined; },
      })
    : null;
  const cfg: MeerkatModelConfig = await resolveMeerkatConfig(meerkatId ?? '', version);

  // F1.1 — customLLM opt-in per agent. Cuando features.use_custom_llm = true
  // apuntamos Vapi a nuestro endpoint /api/voice/llm que reformatea a Anthropic
  // con cache_control. El prompt de voz de ~900 líneas queda cacheado por 5min
  // y cada turno subsecuente paga 10% del input. Ahorro esperado 60-70% en
  // input tokens de voz vs anthropic native.
  //
  // Empezar activándolo en un agente demo, verificar en logs de Anthropic que
  // aparecen cache_creation_input_tokens y cache_read_input_tokens > 0, y
  // recién entonces propagar a producción.
  const useCustomLlm = !!(agent.features as unknown as Record<string, unknown>)?.use_custom_llm;
  const appUrl       = process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.centinelia.mx';
  const vapiSecret   = process.env.VAPI_SERVER_SECRET  ?? '';

  const modelBlock = useCustomLlm
    ? {
        provider: 'custom-llm',
        // Vapi appende '/chat/completions' automáticamente a la URL base.
        // Secret en query string como fallback si Vapi no puede inyectar headers.
        url: vapiSecret ? `${appUrl}/api/voice/llm?secret=${encodeURIComponent(vapiSecret)}` : `${appUrl}/api/voice/llm`,
        model:    cfg.model,      // pasa como identifier, nuestro endpoint lo respeta
        messages,
        temperature: cfg.temperature,
        maxTokens:   cfg.maxTokens,
        metadataSendMode: 'off',  // no mandar objeto `call` — ahorra tokens/latencia
        ...(toolIds.length > 0 ? { toolIds } : {}),
      }
    : {
        provider: cfg.provider,
        model:    cfg.model,
        messages,
        temperature: cfg.temperature,
        maxTokens:   cfg.maxTokens,
        ...(toolIds.length > 0 ? { toolIds } : {}),
      };

  return {
    name: `${agentName}, ${agent.business_name}`,
    model: modelBlock,
    voice: {
      provider: '11labs',
      voiceId: agent.elevenlabs_voice_id || '9Godp7dNohUvXk6qp0gS',
      model: cfg.voiceModel ?? 'eleven_turbo_v2_5',
      stability: 0.35,
      similarityBoost: 0.75,
      style: 0.40,
      speed: cfg.speed,
      useSpeakerBoost: true,
      optimizeStreamingLatency: 3,
      chunkPlan: {
        enabled: true,
        minCharacters: cfg.minChars,
        punctuationBoundaries: cfg.punctuationBoundaries ?? ['.', '!', '?', ','],
      },
    },
    firstMessage: (() => {
      const notice  = 'Esta llamada puede ser grabada.';
      const noNotice = !!agent.features.skip_recording_notice;
      const custom  = agent.first_message?.trim();
      if (custom) {
        if (noNotice || custom.toLowerCase().includes('grabada')) return custom;
        return `${custom} ${notice}`;
      }
      // Default corto y directo. Descubierto en primer battle test real: el default
      // anterior ('Business, buenos dias. Le habla X. Esta llamada puede ser grabada.
      // En que le puedo ayudar?') pesaba 17 palabras / ~7s de TTS a speed=0.91.
      // Este es 15 palabras / ~5.5s: mismo cumplimiento LFPDPPP, sin 'buenos dias'
      // (que depende del horario), pero mantiene el CTA final para invitar a hablar.
      return `Le habla ${agentName} de ${agent.business_name}, su llamada puede ser grabada. ¿En qué le puedo ayudar?`;
    })(),
    endCallMessage: 'Hasta luego.',
    // Solo frases INEQUÍVOCAS de cierre. "gracias por llamar" y "gracias por
    // comunicarse" fueron removidas porque agentes las usan como respuesta
    // amable a saludos del cliente ("Hello" → "Hola, gracias por llamar")
    // y Vapi cortaba a mitad de conversación. Ver call 019f...e0e88.
    endCallPhrases: [
      'hasta luego', 'hasta pronto', 'hasta la próxima',
      // Solo variantes CON pronombre. Las cortas sin pronombre ("que vaya
      // bien", "fue un placer") disparaban false positives — el LLM las
      // usa a mitad de conversación durante disculpas o cambios de tema.
      // El prompt refuerza que las despedidas SIEMPRE lleven pronombre.
      'que le vaya bien', 'que le vaya muy bien',
      'que te vaya bien', 'que te vaya muy bien',
      'que tenga buen día', 'que tenga un excelente día', 'que tenga buena tarde', 'que tenga buena noche',
      'que tengas buen día', 'que tengas un excelente día', 'que tengas buena tarde', 'que tengas buena noche',
      'nos vemos', 'nos hablamos', 'estamos en contacto', 'quedamos en contacto',
      'fue un placer atenderle', 'fue un placer atenderte',
      // Cierres casuales mexicanos que el LLM usa en llamadas informales.
      // Son inherentemente frases de despedida — no aparecen a mitad de conversación.
      'cualquier cosa me escribes', 'cualquier cosa me avisas',
      'cualquier cosa nos escribes', 'cualquier cosa nos avisas',
      'aquí estamos para lo que necesites', 'aquí estamos para lo que necesite',
      // Frases que Sofia usa en la práctica (observadas en transcripts reales).
      'gracias por la llamada', 'gracias por su llamada', 'gracias por tu llamada',
      'cuídese mucho', 'cuídate mucho', 'que esté bien', 'que estés bien',
      // En inglés — Sofia a veces cambia si el llamante lo hace.
      'take care', 'have a nice day', 'have a good day', 'goodbye',
    ],
    transcriber: (() => {
      const tier        = MEERKAT_PROMPT_TIER[meerkatId ?? ''] ?? 'full';
      const explicitLite = !!agent.features.lite_prompt;
      const isLite      = explicitLite || tier === 'lite';
      // Endpointing 150ms uniforme (subida moderada desde 100 en lite, mantiene
      // 150 en full). Nazre eligió bump conservador para reducir interrupciones
      // sin agregar latencia notable.
      return {
        provider:    'deepgram',
        model:       cfg.sttModel ?? 'nova-3',
        language:    agent.features.multilingual ? 'multi' : 'es',
        smartFormat: false,
        endpointing: 150,
      };
    })(),
    backgroundSound: 'office',
    backchannelingEnabled: true,
    backgroundDenoisingEnabled: true,
    // 15s: si no hay audio (ni del asistente ni del llamante) durante este
    // tiempo, Vapi corta la llamada. Es la red de seguridad cuando el LLM
    // dice una despedida no canónica que endCallPhrases no matchea
    // ("cualquier cosa me escribes", "take care", "gracias por la llamada").
    // Antes 30s → daba tiempo a Sofia a reiniciar con "¿todavía estás ahí?".
    // Antes 15s → Sofia se colgaba cuando encadenaba consultar_agente
    // (p50 7s) + delegar_tarea (p50 16s) porque el silencio acumulado
    // durante los tool calls consecutivos superaba el timeout. Ver
    // /admin/observabilidad/tools para latencias reales.
    silenceTimeoutSeconds: 25,
    maxDurationSeconds: VAPI_MAX_CALL_SECONDS,
    serverUrl: `${process.env.NEXT_PUBLIC_APP_URL}/api/voice/webhook?secret=${process.env.VAPI_SERVER_SECRET ?? ''}`,
    artifactPlan: {
      recordingEnabled: true,
      recordingFormat: 'wav;l16',
      transcriptPlan: {
        enabled: true,
        assistantName: agentName,
        userName: 'Cliente',
      },
    },
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
async function syncAgentToVapi(
  vapiAssistantId: string,
  agent:           VoiceAgent,
  learnings?:      AgentLearnings | null,
  opts?:           { force?: boolean },
): Promise<boolean> {
  // Guard: coordinadores nunca deben ir a Vapi. Si tienen vapi_agent_id es
  // leftover — limpiamos la DB y skip (no-op silencioso, no es error).
  if (isNonVoiceRole(agent)) {
    console.warn('[vapi] skipping syncAgentToVapi for non-voice role, clearing stale vapi_agent_id', {
      agentId: agent.id,
      role: (agent.features as { meerkat_role_id?: string })?.meerkat_role_id,
    });
    try {
      const supabase = createAdminClient();
      await supabase.from('voice_agents').update({ vapi_agent_id: null }).eq('id', agent.id);
    } catch (err) {
      console.error('[vapi] failed to clear stale vapi_agent_id:', err);
    }
    return true;
  }

  const enrichedAgent     = await enrichWithOrgData(agent);
  const peers             = await fetchTeamPeers(enrichedAgent);
  const toolIds           = await createVapiTools(enrichedAgent, peers);
  const resolvedLearnings = learnings !== undefined
    ? learnings
    : await fetchConversationalLearnings();
  const payload           = await buildVapiAssistant(enrichedAgent, toolIds, peers, resolvedLearnings);
  const body              = JSON.stringify(payload);

  // Content-hash cache: skip PATCH si el payload es identico al ultimo enviado.
  // Ver handoff_anti_waste_infra_pendiente.md. Bypass con opts.force cuando
  // side-effects (rotacion de tools, refresh de tokens server-side) requieran
  // forzar el sync aunque el hash no haya cambiado.
  const payloadHash = createHash('sha256').update(body).digest('hex');
  if (!opts?.force && agent.vapi_last_payload_hash === payloadHash) {
    return true;
  }

  const res = await fetch(`${VAPI_URL}/assistant/${vapiAssistantId}`, {
    method: 'PATCH',
    headers: headers(),
    body,
  });
  if (!res.ok) {
    const errText = await res.text();
    console.error('Vapi syncAgent error:', errText);
    throw new Error(errText);
  }

  try {
    const supabase = createAdminClient();
    await supabase
      .from('voice_agents')
      .update({ vapi_last_payload_hash: payloadHash })
      .eq('id', agent.id);
  } catch (err) {
    console.error('[vapi] failed to persist vapi_last_payload_hash:', err);
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
    // Excluir coordinadores (nox, niva): no son voice-capable, no tienen assistant
    // valido en Vapi, cualquier intento de update devuelve 404. Ver NON_VOICE_ROLES.
    const voicePeers = peers.filter(p => {
      const role = (p.features as { meerkat_role_id?: string } | null | undefined)?.meerkat_role_id;
      return !role || !NON_VOICE_ROLES.has(role);
    });
    if (!voicePeers.length) return;
    await Promise.allSettled(
      voicePeers.map(p => syncAgentToVapi(p.vapi_agent_id, p as VoiceAgent)),
    );
  } catch (e) {
    console.error('resyncPeerAgents error:', e);
  }
}

/**
 * Guard: coordinadores (Nox, Niva) NUNCA deben crearse ni actualizarse en Vapi.
 * Corren via nox-coordinator.ts / agent-chat con Claude directo. Si por error
 * llegan aca, no-op silencioso para prevenir provisionar assistants huerfanos.
 */
function isNonVoiceRole(agent: VoiceAgent): boolean {
  const role = (agent.features as { meerkat_role_id?: string } | null | undefined)?.meerkat_role_id;
  return !!role && NON_VOICE_ROLES.has(role);
}

export async function createVapiAssistant(agent: VoiceAgent): Promise<string | null> {
  if (isNonVoiceRole(agent)) {
    console.warn('[vapi] refusing createVapiAssistant for non-voice role', {
      agentId: agent.id,
      role: (agent.features as { meerkat_role_id?: string })?.meerkat_role_id,
    });
    return null;
  }
  const enrichedAgent = await enrichWithOrgData(agent);
  const peers   = await fetchTeamPeers(enrichedAgent);
  const toolIds = await createVapiTools(enrichedAgent, peers);
  const res = await fetch(`${VAPI_URL}/assistant`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(await buildVapiAssistant(enrichedAgent, toolIds, peers)),
  });
  if (!res.ok) {
    console.error('Vapi createAssistant error:', await res.text());
    return null;
  }
  const data = await res.json();
  return data.id ?? null;
  // Callers must save the returned ID to DB and then call resyncPeerAgents()
}

/**
 * Actualiza el assistant en Vapi. Por default también resincroniza a los
 * peers voice-capable (necesario cuando cambia agent_name, role, o
 * cualquier prop que aparezca en las tools consultar_agente/delegar_tarea
 * de los peers).
 *
 * Pasar `syncPeers: false` cuando el cambio SOLO afecta al agente actual
 * (learnings aprobados, cambio de voz, KB propio, prompt propio, etc.).
 * Evita N-1 requests innecesarias a Vapi por cambio local. Fix 2026-08-10.
 */
export async function updateVapiAssistant(
  vapiAssistantId: string,
  agent:           VoiceAgent,
  opts?:           { syncPeers?: boolean; force?: boolean },
): Promise<boolean> {
  if (isNonVoiceRole(agent)) {
    console.warn('[vapi] refusing updateVapiAssistant for non-voice role', {
      agentId: agent.id,
      role: (agent.features as { meerkat_role_id?: string })?.meerkat_role_id,
    });
    return false;
  }
  // throws if Vapi rejects — callers should catch
  await syncAgentToVapi(vapiAssistantId, agent, undefined, { force: opts?.force });
  const syncPeers = opts?.syncPeers ?? true;
  if (syncPeers) {
    // Fire-and-forget: push the updated tool list to all sibling agents
    resyncPeerAgents(agent.portal_email, agent.id).catch(console.error);
  }
  return true;
}

// Pushes updated prompts (with current global conversational learnings) to ALL active agents.
// Called by the cron after new learnings are activated — do NOT call on every request.
export async function pushConversationalPromptsToAllAgents(): Promise<{ synced: number; errors: number; phoneFixes: number; details: Array<{ id: string; name: string; ok: boolean; error?: string; phoneReassigned?: boolean }> }> {
  const supabase    = createAdminClient();
  const learnings   = await fetchConversationalLearnings();

  // Probe: si no hay learnings conversacionales activos, no re-pushear
  // el prompt a TODOS los agentes semanalmente. Ahorra N-agentes requests
  // Vapi cuando el ledger está limpio. Fix 2026-08-10.
  if (!learnings.general && !learnings.micro) {
    return { synced: 0, errors: 0, phoneFixes: 0, details: [] };
  }

  const { data: agents } = await supabase
    .from('voice_agents')
    .select('*')
    .eq('active', true)
    .not('vapi_agent_id', 'is', null);

  if (!agents?.length) return { synced: 0, errors: 0, phoneFixes: 0, details: [] };

  // Fetch todos los phones de Vapi una vez para no repetir GET por cada agente.
  const phoneMap = new Map<string, { id: string; assistantId: string | null }>();
  try {
    const listRes = await fetch(`${VAPI_URL}/phone-number`, { headers: headers() });
    if (listRes.ok) {
      const phones = await listRes.json() as Array<{ id: string; number?: string; assistantId?: string | null }>;
      for (const p of phones) {
        if (p.number) phoneMap.set(p.number, { id: p.id, assistantId: p.assistantId ?? null });
      }
    }
  } catch (e) {
    console.error('[pushConversationalPromptsToAllAgents] error fetching phones:', e);
  }

  let synced = 0;
  let errors = 0;
  let phoneFixes = 0;
  const details: Array<{ id: string; name: string; ok: boolean; error?: string; phoneReassigned?: boolean }> = [];

  // Process in batches of 5 to avoid hammering Vapi API
  for (let i = 0; i < agents.length; i += 5) {
    const batch = agents.slice(i, i + 5);
    const results = await Promise.allSettled(
      batch.map(a => syncAgentToVapi(a.vapi_agent_id, a as VoiceAgent, learnings)),
    );
    for (let j = 0; j < results.length; j++) {
      const r = results[j];
      const a = batch[j];
      const detail: { id: string; name: string; ok: boolean; error?: string; phoneReassigned?: boolean } = {
        id: a.id, name: `${a.agent_name} (${a.business_name})`, ok: r.status === 'fulfilled' && r.value === true,
      };

      if (r.status === 'fulfilled' && r.value) {
        synced++;

        // Chequeo de phone assignment: si el agente tiene phone_number,
        // verificar que Vapi lo tiene asociado al vapi_agent_id correcto.
        // Si no, reasignar. Esto previene el bug pre-piloto Monterrey donde
        // el phone perdió su asociación y las llamadas caían con Unauthorized.
        if (a.phone_number) {
          const phone = phoneMap.get(a.phone_number);
          if (phone && phone.assistantId !== a.vapi_agent_id) {
            try {
              const patchRes = await fetch(`${VAPI_URL}/phone-number/${phone.id}`, {
                method: 'PATCH',
                headers: headers(),
                body: JSON.stringify({ assistantId: a.vapi_agent_id }),
              });
              if (patchRes.ok) {
                phoneFixes++;
                detail.phoneReassigned = true;
                console.log(`[resync-phone-check] reasignado ${a.phone_number} → ${a.business_name} (${a.vapi_agent_id})`);
              } else {
                detail.error = `sync ok pero phone reassign falló: ${patchRes.status}`;
              }
            } catch (e) {
              detail.error = `sync ok pero phone reassign error: ${String(e)}`;
            }
          }
        }
      } else {
        errors++;
        detail.error = r.status === 'rejected' ? String(r.reason) : 'unknown';
      }

      details.push(detail);
    }
  }

  return { synced, errors, phoneFixes, details };
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

// Exported for snapshot testing only. Wraps buildVapiAssistant with the same
// inputs it receives during a real sync (empty tools + peers by default).
export async function buildVapiAssistantForSnapshot(agent: VoiceAgent) {
  return buildVapiAssistant(agent, [], [], null);
}
