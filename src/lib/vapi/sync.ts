import { createAdminClient } from '@/lib/supabase/admin';
import { buildSystemPrompt } from '@/lib/voice/prompt-builder';
import type { VoiceAgent } from '@/types/agent';
import { VAPI_MAX_CALL_SECONDS, VAPI_VOICE_MAX_TOKENS } from '@/lib/constants';
import { MEERKAT_PROMPT_TIER } from '@/lib/voice/rules';

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

// ─── Org-level data enrichment ───────────────────────────────────────────────
// Org fields are stored in `organizations` (single source of truth).
// Before building any Vapi assistant, merge them over the per-agent row.

const ORG_SELECT = 'knowledge_base, owner_profile, owner_passphrase, business_description, business_hours, business_website, website_knowledge, google_review_url, email_brand_color, brand_color_secondary, brand_website, brand_address, email_footer_text';

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
    return { ...agent, ...org } as VoiceAgent;
  } catch {
    return agent;
  }
}

async function fetchTeamPeers(agent: VoiceAgent): Promise<TeamPeer[]> {
  if (!agent.portal_email) return [];
  try {
    const supabase = createAdminClient();
    const { data } = await supabase
      .from('voice_agents')
      .select('id, vapi_agent_id, agent_name, role, features, role_knowledge_base')
      .eq('portal_email', agent.portal_email)
      .eq('active', true)
      .neq('id', agent.id);

    return (data ?? []).filter((p): p is TeamPeer => !!p.vapi_agent_id);
  } catch {
    return [];
  }
}

// ─── Voice tool distribution by meerkat role ─────────────────────────────────

export const MEERKAT_VOICE_DISTRIBUTION: Record<string, string[]> = {
  nia:   ['crear_lead', 'agendar_cita', 'registrar_pedido', 'buscar_cliente', 'notificar_transferencia', 'transferir_llamada', 'registrar_encuesta', 'consultar_agente', 'delegar_tarea', 'reportar_falla'],
  noah:  ['crear_lead', 'registrar_pedido', 'notificar_transferencia', 'transferir_llamada', 'llamar_a', 'buscar_en_web', 'search_leads', 'analizar_publicaciones_ml', 'crear_publicacion_ml', 'actualizar_publicacion_ml', 'ver_metricas_ml', 'consultar_agente', 'reportar_falla'],
  nico:  ['buscar_cliente', 'notificar_transferencia', 'transferir_llamada', 'llamar_a', 'enviar_correo', 'crear_documento', 'qb_consultar_facturas', 'qb_buscar_cliente', 'qb_registrar_pago', 'reportar_falla'],
  nelia: ['buscar_cliente', 'notificar_transferencia', 'transferir_llamada', 'registrar_encuesta', 'enviar_correo', 'buscar_archivo', 'consultar_agente', 'reportar_falla'],
  neo:   ['crear_ticket', 'consultar_incidentes', 'buscar_directorio', 'buscar_archivo', 'leer_archivo', 'delegar_tarea', 'consultar_agente', 'reportar_falla'],
  nara:  ['create_civic_report', 'lookup_civic_report', 'update_civic_report', 'buscar_cliente', 'notificar_transferencia', 'transferir_llamada', 'delegar_tarea', 'consultar_agente', 'reportar_falla'],
  naia:  ['iniciar_onboarding', 'agendar_cita', 'buscar_cliente', 'registrar_encuesta', 'enviar_correo', 'crear_documento', 'list_calendar_events', 'create_calendar_event', 'delete_calendar_event', 'buscar_archivo', 'leer_archivo', 'reportar_falla'],
  nova:  ['buscar_cliente', 'notificar_transferencia', 'transferir_llamada', 'llamar_a', 'crear_ticket', 'crear_documento', 'delegar_tarea', 'consultar_agente', 'buscar_en_web', 'reportar_falla'],
  nox:   ['consultar_agente', 'delegar_tarea', 'enviar_correo', 'llamar_a', 'crear_documento', 'create_file', 'create_contract_draft', 'buscar_archivo', 'leer_archivo', 'save_to_drive', 'organize_files', 'list_calendar_events', 'create_calendar_event', 'delete_calendar_event', 'qb_consultar_facturas', 'reportar_falla'],
  niva:  ['consultar_agente', 'delegar_tarea', 'enviar_correo', 'llamar_a', 'crear_documento', 'create_file', 'save_to_drive', 'buscar_en_web', 'read_url', 'search_leads', 'list_calendar_events', 'create_calendar_event', 'qb_consultar_facturas', 'qb_buscar_cliente', 'qb_reporte_ingresos', 'qb_crear_factura', 'qb_registrar_pago', 'analizar_publicaciones_ml', 'ver_metricas_ml', 'reportar_falla'],
};

type ToolDef = Record<string, unknown>;
type ServerFn = (path: string) => unknown;

// Returns the Vapi tool definition for a given tool name, or null when the tool
// cannot be built for this agent (e.g. transferir_llamada without a transfer number).
// eslint-disable-next-line complexity
function buildToolDef(name: string, agent: VoiceAgent, server: ServerFn): ToolDef | null {
  switch (name) {

    case 'crear_lead': return { type: 'function', function: { name: 'crear_lead', description: 'Registra los datos de un prospecto interesado en contratar servicios.', parameters: { type: 'object', properties: { nombre: { type: 'string', description: 'Nombre completo del prospecto' }, negocio: { type: 'string', description: 'Nombre del negocio' }, giro: { type: 'string', description: 'Giro o industria del negocio' }, servicio: { type: 'string', description: 'Servicio que necesita' }, presupuesto: { type: 'string', description: 'Presupuesto aproximado' }, timeline: { type: 'string', description: 'Para cuándo lo necesita' }, email: { type: 'string', description: 'Correo electrónico' }, whatsapp: { type: 'string', description: 'Número de WhatsApp' } }, required: ['nombre', 'servicio'] } }, server: server('crear-lead') };

    case 'agendar_cita': return { type: 'function', function: { name: 'agendar_cita', description: 'Agenda, modifica o cancela una cita.', parameters: { type: 'object', properties: { accion: { type: 'string', enum: ['agendar', 'modificar', 'cancelar'], description: 'Acción a realizar' }, nombre: { type: 'string', description: 'Nombre del cliente' }, servicio: { type: 'string', description: 'Servicio para la cita' }, fecha: { type: 'string', description: 'Fecha de la cita (ej: lunes 23 de junio)' }, hora: { type: 'string', description: 'Hora de la cita' }, telefono: { type: 'string', description: 'Teléfono de confirmación' } }, required: ['accion', 'nombre'] } }, server: server('agendar-cita') };

    case 'registrar_pedido': return { type: 'function', function: { name: 'registrar_pedido', description: 'Registra un pedido por teléfono.', parameters: { type: 'object', properties: { nombre: { type: 'string', description: 'Nombre del cliente' }, telefono: { type: 'string', description: 'Teléfono del cliente' }, items: { type: 'string', description: 'Descripción de los productos o servicios pedidos' }, tipo: { type: 'string', enum: ['entrega', 'recoger'], description: 'Entrega a domicilio o recoger en sucursal' }, direccion: { type: 'string', description: 'Dirección de entrega (solo si tipo es entrega)' }, notas: { type: 'string', description: 'Notas adicionales del pedido' } }, required: ['nombre', 'items', 'tipo'] } }, server: server('registrar-pedido') };

    case 'buscar_cliente': return { type: 'function', function: { name: 'buscar_cliente', description: 'Busca el historial e información de un cliente existente por nombre o teléfono.', parameters: { type: 'object', properties: { identificador: { type: 'string', description: 'Nombre completo, número de teléfono, o WhatsApp del cliente' } }, required: ['identificador'] } }, server: server('buscar-cliente') };

    case 'notificar_transferencia': return { type: 'function', function: { name: 'notificar_transferencia', description: 'Notifica al equipo por WhatsApp que viene una transferencia. Llama a esta herramienta PRIMERO, luego usa transferir_llamada.', parameters: { type: 'object', properties: { nombre: { type: 'string', description: 'Nombre del cliente' }, motivo: { type: 'string', description: 'Motivo de la transferencia' }, resumen: { type: 'string', description: 'Resumen breve de la conversación' } }, required: ['motivo'] } }, server: server('notificar-transferencia') };

    case 'transferir_llamada':
      if (!agent.transfer_number) return null;
      return { type: 'transferCall', function: { name: 'transferir_llamada', description: 'Transfiere la llamada en tiempo real al equipo. Úsala DESPUÉS de notificar_transferencia cuando el cliente quiera hablar con un humano.', parameters: { type: 'object', properties: {} } }, destinations: [{ type: 'number', number: agent.transfer_number, message: 'Un momento por favor, te estoy comunicando con el equipo.' }], messages: [{ type: 'request-start', content: 'Claro, con mucho gusto te comunico con el equipo ahora mismo.' }] };

    case 'registrar_encuesta': return { type: 'function', function: { name: 'registrar_encuesta', description: 'Registra las respuestas capturadas de una encuesta de satisfacción. Llámala en cuanto tengas al menos una respuesta y el cliente se vaya a despedir, o cuando hayas recabado todas. Puedes haber recopilado las respuestas a lo largo de toda la conversación o al final; lo que importa es registrarlas antes de cerrar la llamada.', parameters: { type: 'object', properties: { survey_id: { type: 'string', description: 'ID de la encuesta activa (proporcionado en el prompt).' }, respuestas: { type: 'array', description: 'Lista de respuestas, una por pregunta.', items: { type: 'object', properties: { orden: { type: 'number', description: 'Número de orden de la pregunta (1, 2, 3…).' }, valor: { type: 'string', description: 'Respuesta del cliente.' } }, required: ['orden', 'valor'] } }, caller_number: { type: 'string', description: 'Número del llamante (opcional).' }, call_id: { type: 'string', description: 'ID de la llamada Vapi (opcional).' } }, required: ['survey_id', 'respuestas'] } }, server: server('registrar-encuesta') };

    case 'consultar_agente': return { type: 'function', function: { name: 'consultar_agente', description: 'Pregunta a otro agente del equipo algo que está fuera de tu conocimiento y necesitas su respuesta para continuar la conversación. El agente consultado responde con información o criterio experto. NO ejecuta acciones — solo responde. Úsala cuando necesites información que tiene otro especialista.', parameters: { type: 'object', properties: { rol: { type: 'string', description: 'Nombre o rol del agente a consultar. Ej: "administrativo", "técnico de redes", "recursos humanos".' }, tarea: { type: 'string', description: 'Pregunta específica que le haces al agente.' }, contexto: { type: 'string', description: 'Contexto relevante de la conversación (opcional).' } }, required: ['rol', 'tarea'] } }, server: server('consultar-agente') };

    case 'delegar_tarea': return { type: 'function', function: { name: 'delegar_tarea', description: 'Delega una tarea a otro agente del equipo para que la EJECUTE. El agente delegado toma acción real: envía correos, crea tickets, genera documentos, etc. Úsala cuando recibas una tarea que corresponde a otro especialista y que debes pasarle para que él la lleve a cabo. Espera la confirmación de lo que hizo.', parameters: { type: 'object', properties: { agente: { type: 'string', description: 'Nombre o rol del agente que debe ejecutar la tarea. Ej: "administrativo", "técnico de redes", "recursos humanos".' }, tarea: { type: 'string', description: 'Descripción detallada de la tarea a ejecutar, incluyendo toda la información necesaria (nombres, correos, teléfonos, detalles).' }, contexto: { type: 'string', description: 'Contexto de la conversación o solicitud original (opcional pero recomendado).' } }, required: ['agente', 'tarea'] } }, server: server('delegar-tarea') };

    case 'enviar_correo': return { type: 'function', function: { name: 'enviar_correo', description: 'Envía un correo electrónico a cualquier persona en nombre del dueño. Puede incluir un archivo de Drive/OneDrive como adjunto si el dueño lo pide. Úsala cuando el dueño te pida enviar un correo durante la llamada.', parameters: { type: 'object', properties: { to: { type: 'string', description: 'Dirección de correo del destinatario' }, subject: { type: 'string', description: 'Asunto del correo' }, body: { type: 'string', description: 'Cuerpo del correo' }, attachment_file_id: { type: 'string', description: 'ID del archivo de Drive/OneDrive obtenido de buscar_archivo (opcional)' }, attachment_file_name: { type: 'string', description: 'Nombre del archivo adjunto con extensión (opcional)' }, attachment_mime_type: { type: 'string', description: 'Tipo MIME del archivo (opcional)' } }, required: ['to', 'subject', 'body'] } }, server: server('enviar-correo') };

    case 'crear_documento': return { type: 'function', function: { name: 'crear_documento', description: 'Genera un documento PDF con el logo y colores del negocio y lo envía al correo del dueño. Usa template_type="proposal" para propuestas (incluye cliente y precio), "letter" para cartas formales, "general" para cualquier otro documento.', parameters: { type: 'object', properties: { title: { type: 'string', description: 'Título del documento' }, content: { type: 'string', description: 'Contenido. Usa # para secciones y ## para subsecciones.' }, filename: { type: 'string', description: 'Nombre del archivo sin extensión' }, template_type: { type: 'string', enum: ['general', 'proposal', 'letter'], description: 'Tipo de template' }, client_name: { type: 'string', description: 'Nombre del cliente (proposal)' }, client_email: { type: 'string', description: 'Correo del cliente (proposal)' }, total_price: { type: 'string', description: 'Precio total destacado. Ej: "$50,000 MXN" (proposal)' }, validity_days: { type: 'number', description: 'Días de validez (proposal)' }, recipient_name: { type: 'string', description: 'Nombre del destinatario (letter)' } }, required: ['title', 'content'] } }, server: server('crear-documento') };

    case 'llamar_a': return { type: 'function', function: { name: 'llamar_a', description: 'Realiza una llamada telefónica saliente a un número en nombre del dueño. Úsala cuando el dueño pida llamar a alguien durante la conversación.', parameters: { type: 'object', properties: { numero: { type: 'string', description: 'Número de teléfono con código de país. Ej: +5218113333333' }, nombre: { type: 'string', description: 'Nombre del contacto a llamar' }, mensaje: { type: 'string', description: 'Motivo de la llamada o mensaje para el contacto' } }, required: ['numero', 'mensaje'] } }, server: server('llamar-a') };

    case 'buscar_archivo': return { type: 'function', function: { name: 'buscar_archivo', description: 'Busca un archivo en Google Drive o OneDrive del dueño. Úsala cuando el dueño pida buscar un documento durante la llamada.', parameters: { type: 'object', properties: { busqueda: { type: 'string', description: 'Nombre o descripción del archivo a buscar' } }, required: ['busqueda'] } }, server: server('buscar-archivo') };

    case 'leer_archivo': return { type: 'function', function: { name: 'leer_archivo', description: 'Lee y extrae el contenido de texto de un archivo de Drive/OneDrive. Úsala después de buscar_archivo para acceder al contenido del documento.', parameters: { type: 'object', properties: { file_id: { type: 'string', description: 'ID del archivo (obtenido de buscar_archivo)' }, file_name: { type: 'string', description: 'Nombre del archivo para referencia' } }, required: ['file_id'] } }, server: server('leer-archivo') };

    case 'save_to_drive': return { type: 'function', function: { name: 'save_to_drive', description: 'Guarda o sube un archivo a Google Drive/OneDrive del dueño.', parameters: { type: 'object', properties: { nombre: { type: 'string', description: 'Nombre del archivo a guardar' }, contenido: { type: 'string', description: 'Contenido del archivo (para archivos de texto)' }, carpeta: { type: 'string', description: 'Carpeta destino en Drive/OneDrive (opcional)' } }, required: ['nombre'] } }, server: server('save-to-drive') };

    case 'create_file': return { type: 'function', function: { name: 'create_file', description: 'Crea un archivo de texto o documento en Google Drive/OneDrive del dueño.', parameters: { type: 'object', properties: { nombre: { type: 'string', description: 'Nombre del archivo con extensión (ej: reporte.txt)' }, contenido: { type: 'string', description: 'Contenido del archivo' }, carpeta: { type: 'string', description: 'Carpeta destino en Drive/OneDrive (opcional)' } }, required: ['nombre', 'contenido'] } }, server: server('create-file') };

    case 'organize_files': return { type: 'function', function: { name: 'organize_files', description: 'Organiza, mueve o renombra archivos en Google Drive/OneDrive del dueño.', parameters: { type: 'object', properties: { instruccion: { type: 'string', description: 'Qué hacer: mover, renombrar, crear carpeta, etc.' }, archivo_id: { type: 'string', description: 'ID del archivo a organizar (opcional)' }, destino: { type: 'string', description: 'Carpeta destino o nuevo nombre' } }, required: ['instruccion'] } }, server: server('organize-files') };

    case 'create_contract_draft': return { type: 'function', function: { name: 'create_contract_draft', description: 'Genera un borrador de contrato comercial en PDF y lo guarda en Drive. Úsala cuando el dueño pida preparar un contrato con un cliente.', parameters: { type: 'object', properties: { tipo: { type: 'string', description: 'Tipo de contrato: servicios, arrendamiento, compraventa, confidencialidad, etc.' }, cliente_nombre: { type: 'string', description: 'Nombre completo del cliente o empresa' }, cliente_rfc: { type: 'string', description: 'RFC del cliente (opcional)' }, descripcion: { type: 'string', description: 'Descripción del servicio o producto contratado' }, monto: { type: 'string', description: 'Monto total del contrato (ej: $50,000 MXN)' }, vigencia: { type: 'string', description: 'Duración o fecha de vencimiento del contrato' }, notas: { type: 'string', description: 'Cláusulas especiales o notas adicionales (opcional)' } }, required: ['tipo', 'cliente_nombre', 'descripcion'] } }, server: server('create-contract-draft') };

    case 'crear_ticket': return { type: 'function', function: { name: 'crear_ticket', description: 'Crea un ticket de soporte IT en la mesa de ayuda. Úsala cuando el usuario reporte un problema técnico. Asigna automáticamente al técnico según el tipo de problema.', parameters: { type: 'object', properties: { titulo: { type: 'string', description: 'Título breve del problema reportado' }, categoria: { type: 'string', enum: ['red', 'servidores', 'usuario', 'software', 'hardware', 'accesos', 'otro'], description: 'Categoría del problema' }, prioridad: { type: 'string', enum: ['baja', 'normal', 'alta', 'critica'], description: 'Prioridad del ticket' }, descripcion: { type: 'string', description: 'Descripción detallada del problema' }, caller_number: { type: 'string', description: 'Número de teléfono del usuario que llama' } }, required: ['titulo', 'categoria', 'prioridad'] } }, server: server('crear-ticket') };

    case 'consultar_incidentes': return { type: 'function', function: { name: 'consultar_incidentes', description: 'Consulta si hay incidentes activos en el sistema. Úsala al inicio de cada llamada de soporte para avisar al usuario sobre problemas conocidos antes de crear un ticket.', parameters: { type: 'object', properties: { tema: { type: 'string', description: 'Tema o sistema sobre el que pregunta el usuario (ej: internet, SAP, correo). Opcional.' } } } }, server: server('consultar-incidentes') };

    case 'buscar_directorio': return { type: 'function', function: { name: 'buscar_directorio', description: 'Busca en el directorio interno quién atiende un tipo de problema específico. Úsala para referir al usuario con el técnico o área correcta.', parameters: { type: 'object', properties: { tipo_problema: { type: 'string', description: 'Tipo de problema o área que se busca (ej: red, VPN, impresoras, SAP)' } }, required: ['tipo_problema'] } }, server: server('buscar-directorio') };

    case 'buscar_en_web': return { type: 'function', function: { name: 'buscar_en_web', description: 'Busca información actualizada en internet sobre un tema, empresa, producto o persona.', parameters: { type: 'object', properties: { query: { type: 'string', description: 'Término de búsqueda o pregunta a investigar' } }, required: ['query'] } }, server: server('buscar-en-web') };

    case 'read_url': return { type: 'function', function: { name: 'read_url', description: 'Lee y extrae el contenido de texto de una URL pública. Úsala para obtener información de páginas web específicas.', parameters: { type: 'object', properties: { url: { type: 'string', description: 'URL completa a leer (ej: https://example.com/page)' } }, required: ['url'] } }, server: server('read-url') };

    case 'search_leads': return { type: 'function', function: { name: 'search_leads', description: 'Busca prospectos en el CRM por nombre, negocio, giro o servicio.', parameters: { type: 'object', properties: { query: { type: 'string', description: 'Nombre, negocio, giro o servicio del prospecto a buscar' } }, required: ['query'] } }, server: server('search-leads') };

    case 'analizar_publicaciones_ml': return { type: 'function', function: { name: 'analizar_publicaciones_ml', description: 'Analiza las publicaciones activas del negocio en MercadoLibre: estado, visitas, ventas y oportunidades de mejora.', parameters: { type: 'object', properties: { filtro: { type: 'string', description: 'Filtrar por categoría o texto (opcional)' } } } }, server: server('analizar-publicaciones-ml') };

    case 'crear_publicacion_ml': return { type: 'function', function: { name: 'crear_publicacion_ml', description: 'Crea una nueva publicación en MercadoLibre con los datos del producto.', parameters: { type: 'object', properties: { titulo: { type: 'string', description: 'Título de la publicación' }, descripcion: { type: 'string', description: 'Descripción del producto' }, precio: { type: 'number', description: 'Precio en MXN' }, categoria: { type: 'string', description: 'Categoría del producto' }, condicion: { type: 'string', enum: ['nuevo', 'usado'], description: 'Condición del producto' }, stock: { type: 'number', description: 'Cantidad disponible' } }, required: ['titulo', 'precio'] } }, server: server('crear-publicacion-ml') };

    case 'actualizar_publicacion_ml': return { type: 'function', function: { name: 'actualizar_publicacion_ml', description: 'Actualiza el precio, stock o descripción de una publicación existente en MercadoLibre.', parameters: { type: 'object', properties: { item_id: { type: 'string', description: 'ID de la publicación (ej: MLM123456789)' }, precio: { type: 'number', description: 'Nuevo precio (opcional)' }, stock: { type: 'number', description: 'Nueva cantidad disponible (opcional)' }, descripcion: { type: 'string', description: 'Nueva descripción (opcional)' }, titulo: { type: 'string', description: 'Nuevo título (opcional)' } }, required: ['item_id'] } }, server: server('actualizar-publicacion-ml') };

    case 'ver_metricas_ml': return { type: 'function', function: { name: 'ver_metricas_ml', description: 'Consulta las métricas de ventas del negocio en MercadoLibre: ventas del mes, ingresos, preguntas pendientes.', parameters: { type: 'object', properties: { periodo: { type: 'string', enum: ['hoy', 'semana', 'mes'], description: 'Período de las métricas' } } } }, server: server('ver-metricas-ml') };

    case 'list_calendar_events': return { type: 'function', function: { name: 'list_calendar_events', description: 'Consulta los eventos del calendario del dueño para una fecha o rango.', parameters: { type: 'object', properties: { fecha: { type: 'string', description: 'Fecha específica (ej: lunes, mañana, 2026-07-25)' }, fecha_fin: { type: 'string', description: 'Fecha de fin para consultar un rango (opcional)' } }, required: ['fecha'] } }, server: server('list-calendar-events') };

    case 'create_calendar_event': return { type: 'function', function: { name: 'create_calendar_event', description: 'Crea un evento en el calendario del dueño.', parameters: { type: 'object', properties: { titulo: { type: 'string', description: 'Título del evento' }, fecha: { type: 'string', description: 'Fecha del evento (ej: lunes 28 de julio)' }, hora_inicio: { type: 'string', description: 'Hora de inicio (ej: 10:00)' }, hora_fin: { type: 'string', description: 'Hora de fin (ej: 11:00)' }, descripcion: { type: 'string', description: 'Descripción o notas del evento (opcional)' }, invitados: { type: 'string', description: 'Correos de invitados separados por coma (opcional)' } }, required: ['titulo', 'fecha', 'hora_inicio'] } }, server: server('create-calendar-event') };

    case 'delete_calendar_event': return { type: 'function', function: { name: 'delete_calendar_event', description: 'Elimina o cancela un evento del calendario del dueño.', parameters: { type: 'object', properties: { evento_id: { type: 'string', description: 'ID del evento a eliminar (obtenido de list_calendar_events)' }, titulo: { type: 'string', description: 'Título del evento (para confirmar al usuario)' } }, required: ['evento_id'] } }, server: server('delete-calendar-event') };

    case 'create_civic_report': return { type: 'function', function: { name: 'create_civic_report', description: 'Crea un reporte ciudadano: queja, solicitud de servicio o reporte de problema en la vía pública.', parameters: { type: 'object', properties: { tipo: { type: 'string', description: 'Tipo de reporte: queja, solicitud, reporte de daño, etc.' }, descripcion: { type: 'string', description: 'Descripción detallada del problema o solicitud' }, ubicacion: { type: 'string', description: 'Dirección o colonia donde se reporta el problema' }, nombre: { type: 'string', description: 'Nombre del ciudadano reportante' }, telefono: { type: 'string', description: 'Teléfono de contacto del ciudadano' } }, required: ['tipo', 'descripcion'] } }, server: server('create-civic-report') };

    case 'lookup_civic_report': return { type: 'function', function: { name: 'lookup_civic_report', description: 'Consulta el estado de un reporte ciudadano previamente registrado.', parameters: { type: 'object', properties: { folio: { type: 'string', description: 'Número de folio del reporte (opcional)' }, telefono: { type: 'string', description: 'Teléfono del ciudadano para buscar sus reportes (opcional)' } } } }, server: server('lookup-civic-report') };

    case 'update_civic_report': return { type: 'function', function: { name: 'update_civic_report', description: 'Actualiza el estado o agrega información adicional a un reporte ciudadano existente.', parameters: { type: 'object', properties: { folio: { type: 'string', description: 'Número de folio del reporte a actualizar' }, estado: { type: 'string', description: 'Nuevo estado del reporte (opcional)' }, nota: { type: 'string', description: 'Nota o información adicional (opcional)' } }, required: ['folio'] } }, server: server('update-civic-report') };

    case 'qb_consultar_facturas': return { type: 'function', function: { name: 'qb_consultar_facturas', description: 'Consulta las facturas en QuickBooks: pendientes de cobro, vencidas o de un cliente específico.', parameters: { type: 'object', properties: { cliente: { type: 'string', description: 'Nombre o ID del cliente (opcional)' }, estado: { type: 'string', enum: ['pendiente', 'vencida', 'pagada', 'todas'], description: 'Estado de las facturas a consultar' }, periodo: { type: 'string', description: 'Período: este mes, este trimestre, etc. (opcional)' } } } }, server: server('qb-consultar-facturas') };

    case 'qb_buscar_cliente': return { type: 'function', function: { name: 'qb_buscar_cliente', description: 'Busca un cliente en QuickBooks por nombre, correo o teléfono.', parameters: { type: 'object', properties: { query: { type: 'string', description: 'Nombre, correo o teléfono del cliente a buscar' } }, required: ['query'] } }, server: server('qb-buscar-cliente') };

    case 'qb_registrar_pago': return { type: 'function', function: { name: 'qb_registrar_pago', description: 'Registra el pago de una factura en QuickBooks.', parameters: { type: 'object', properties: { factura_id: { type: 'string', description: 'ID de la factura en QuickBooks' }, monto: { type: 'number', description: 'Monto del pago en MXN' }, metodo_pago: { type: 'string', description: 'Método de pago: efectivo, transferencia, cheque, tarjeta' }, fecha: { type: 'string', description: 'Fecha del pago (ej: hoy, 2026-07-22). Por defecto hoy.' }, referencia: { type: 'string', description: 'Número de referencia o confirmación (opcional)' } }, required: ['factura_id', 'monto', 'metodo_pago'] } }, server: server('qb-registrar-pago') };

    case 'qb_reporte_ingresos': return { type: 'function', function: { name: 'qb_reporte_ingresos', description: 'Genera un reporte de ingresos y gastos de QuickBooks para un período.', parameters: { type: 'object', properties: { periodo: { type: 'string', description: 'Período: este mes, este trimestre, este año, etc.' } }, required: ['periodo'] } }, server: server('qb-reporte-ingresos') };

    case 'qb_crear_factura': return { type: 'function', function: { name: 'qb_crear_factura', description: 'Crea una nueva factura en QuickBooks para un cliente.', parameters: { type: 'object', properties: { cliente_id: { type: 'string', description: 'ID del cliente en QuickBooks (obtenido de qb_buscar_cliente)' }, descripcion: { type: 'string', description: 'Descripción del servicio o producto facturado' }, monto: { type: 'number', description: 'Monto de la factura en MXN' }, fecha_vence: { type: 'string', description: 'Fecha de vencimiento (ej: en 30 días, 2026-08-22)' }, notas: { type: 'string', description: 'Notas adicionales en la factura (opcional)' } }, required: ['cliente_id', 'descripcion', 'monto'] } }, server: server('qb-crear-factura') };

    case 'iniciar_onboarding': return { type: 'function', function: { name: 'iniciar_onboarding', description: 'Inicia el proceso de onboarding para un nuevo empleado, cliente o proveedor. Envía automáticamente el correo de bienvenida con los pasos a seguir.', parameters: { type: 'object', properties: { contact_name: { type: 'string', description: 'Nombre completo del contacto a registrar en el onboarding' }, contact_email: { type: 'string', description: 'Correo electrónico del contacto' }, template_name: { type: 'string', description: 'Nombre de la plantilla de onboarding a usar (opcional; si no se indica, se usa la primera disponible)' } }, required: ['contact_name', 'contact_email'] } }, server: server('exec/iniciar-onboarding') };

    case 'reportar_falla': return { type: 'function', function: { name: 'reportar_falla', description: 'Envía un reporte de falla o irregularidad al equipo técnico de Centinelia. Úsalo cuando: (1) detectes un comportamiento inesperado en ti mismo, (2) el usuario reporte que algo no funcionó correctamente en llamadas anteriores, (3) encuentres un error del sistema, datos incorrectos o una limitación que impida tu trabajo. No lo uses para quejas del negocio del usuario, solo para fallas técnicas del sistema Centinelia.', parameters: { type: 'object', properties: { tipo: { type: 'string', description: 'Categoría de la falla: "Bug de sistema", "Comportamiento inesperado", "Datos incorrectos", "Limitación técnica" u "Otro".' }, descripcion: { type: 'string', description: 'Descripción clara de la falla: qué ocurrió, cuándo, y cuál debería ser el comportamiento correcto.' }, contexto: { type: 'string', description: 'Contexto relevante de la conversación o llamada donde se detectó la falla (opcional).' } }, required: ['tipo', 'descripcion'] } }, server: server('reportar-falla') };

    default: return null;
  }
}

// ─── Tool creation ────────────────────────────────────────────────────────────

async function createVapiTools(agent: VoiceAgent, peers: TeamPeer[] = []): Promise<string[]> {
  const base  = `${process.env.NEXT_PUBLIC_APP_URL}/api/voice/tools`;
  const id    = agent.id;
  const tools: ToolDef[] = [];
  const server: ServerFn = (path) => ({
    url:     `${base}/${path}?agent_id=${id}`,
    headers: { 'x-vapi-secret': process.env.VAPI_SERVER_SECRET ?? '' },
  });

  const meerkatId = (agent.features as unknown as Record<string, unknown>).meerkat_role_id as string | undefined;
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
    if ((agent.features as unknown as Record<string, unknown>).of_encuestas) tools.push(buildToolDef('registrar_encuesta', agent, server)!);
    tools.push(buildToolDef('reportar_falla', agent, server)!);
  }

  // One transferCall tool per active team peer — enables live agent-to-agent routing
  for (const peer of peers) {
    const toolName  = peerToolName(peer);
    const roleLabel = peerRoleLabel(peer);
    const peerName  = peer.agent_name || roleLabel;
    tools.push({
      type: 'transferCall',
      function: {
        name: toolName,
        description: `Transfiere la llamada a ${peerName} (${roleLabel}): ${peerCapabilitySummary(peer)} Úsalo cuando el cliente necesite este especialista.`,
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
  provider:              string;
  model:                 string;
  temperature:           number;
  maxTokens:             number;
  speed:                 number;
  minChars:              number;
  voiceModel?:           string;
  punctuationBoundaries?: string[];
}

const MEERKAT_MODEL_CONFIG: Record<string, MeerkatModelConfig> = {
  nia:    { provider: 'anthropic', model: 'claude-haiku-4-5-20251001', temperature: 0.35, maxTokens: 200, speed: 0.93, minChars: 25, voiceModel: 'eleven_turbo_v2_5', punctuationBoundaries: ['.', '!', '?', ','] },
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
      `COMPAÑEROS DE EQUIPO (transferencia en tiempo real):`,
      `Trabajas junto a otros empleados del mismo negocio. Son tus compañeros, no tus subordinados ni tus superiores.`,
      `Si un compañero te llama o te contacta, identifícate como su compañero/a: "Soy ${agentName}, tu compañero/a de equipo." No digas que eres empleado/a de él o ella — ambos son empleados del negocio.`,
      ...peers.map(p => {
        const label    = peerRoleLabel(p);
        const toolName = peerToolName(p);
        const peerName = p.agent_name || label;
        const cap      = peerCapabilitySummary(p);
        return `- ${peerName} (${label}): ${cap} Herramienta: ${toolName}.`;
      }),
      'Si el cliente solicita algo que corresponde a un compañero especialista, transfiérelo de inmediato con la herramienta indicada. No le hagas esperar ni expliques el proceso técnico.',
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
      model: cfg.voiceModel ?? 'eleven_turbo_v2_5',
      stability: 0.50,
      similarityBoost: 0.75,
      style: 0.20,
      speed: cfg.speed,
      useSpeakerBoost: true,
      optimizeStreamingLatency: 1,
      chunkPlan: {
        enabled: true,
        minCharacters: cfg.minChars,
        punctuationBoundaries: cfg.punctuationBoundaries ?? ['.', '!', '?'],
      },
    },
    firstMessage: (() => {
      const notice  = 'Esta llamada puede ser grabada.';
      const noNotice = !!(agent.features as unknown as Record<string, unknown>).skip_recording_notice;
      const custom  = agent.first_message?.trim();
      if (custom) {
        if (noNotice || custom.toLowerCase().includes('grabada')) return custom;
        return `${custom} ${notice}`;
      }
      return `${agent.business_name}, buenos días. Le habla ${agentName}. ${notice} ¿En qué le puedo ayudar?`;
    })(),
    endCallMessage: 'Hasta luego, que tenga un excelente día.',
    endCallPhrases: ['hasta luego', 'hasta pronto', 'que tenga un excelente día', 'que tenga buen día', 'adiós', 'fue un placer atenderle'],
    transcriber: (() => {
      const tier        = MEERKAT_PROMPT_TIER[meerkatId ?? ''] ?? 'full';
      const explicitLite = !!(agent.features as unknown as Record<string, unknown>).lite_prompt;
      const isLite      = explicitLite || tier === 'lite';
      return {
        provider:    'deepgram',
        model:       'nova-3',
        language:    agent.features.multilingual ? 'multi' : 'es',
        smartFormat: false,
        endpointing: isLite ? 150 : 200,
      };
    })(),
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
  const enrichedAgent     = await enrichWithOrgData(agent);
  const peers             = await fetchTeamPeers(enrichedAgent);
  const toolIds           = await createVapiTools(enrichedAgent, peers);
  const resolvedLearnings = learnings !== undefined
    ? learnings
    : await fetchConversationalLearnings();
  const res = await fetch(`${VAPI_URL}/assistant/${vapiAssistantId}`, {
    method: 'PATCH',
    headers: headers(),
    body: JSON.stringify(buildVapiAssistant(enrichedAgent, toolIds, peers, resolvedLearnings)),
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
  const enrichedAgent = await enrichWithOrgData(agent);
  const peers   = await fetchTeamPeers(enrichedAgent);
  const toolIds = await createVapiTools(enrichedAgent, peers);
  const res = await fetch(`${VAPI_URL}/assistant`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(buildVapiAssistant(enrichedAgent, toolIds, peers)),
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
