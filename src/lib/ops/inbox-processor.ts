import Anthropic from '@anthropic-ai/sdk';
import { randomUUID } from 'node:crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendEmail } from '@/lib/email/send';
import { approvalEmailHtml } from '@/lib/ops/approval-email';
import { consumeAiOp } from '@/lib/ai/ops-guard';
import { EMAIL_BODY_TRUNCATE_CHARS } from '@/lib/constants';
import { executeAgentTool, type ReadUrlCounter } from '@/lib/tools/executor';
import { getQBClient } from '@/lib/qb/client';
import { quickClassifyEmail } from '@/lib/ops/email-quick-classify';
import { classifyEmailDraft, type AutoModeVerdict } from '@/lib/tools/email-classifier';
import { recordInboxCreation, transitionInboxItem, type InboxStatus } from '@/lib/state-machines/inbox-item';
import { logLlmCall } from '@/lib/observability/llm-log';

const anthropic = new Anthropic();

const CATEGORY_LABELS: Record<string, string> = {
  proveedor: 'Proveedor',
  cliente:   'Cliente',
  urgente:   'Urgente',
  factura:   'Factura',
  spam:      'Spam',
  otro:      'Otro',
};

interface ProcessedEmail {
  category:           string;
  summary:            string;
  draft:              string | null;
  invoiceData:        Record<string, string | number | null> | null;
  invoiceValid:       boolean | null;
  invoiceDiscrepancy: string | null;
  needsInfo:          boolean;
  infoNeeded:         string | null;
  requestToSender:    string | null;
}

const VALID_CATEGORIES = ['proveedor', 'cliente', 'urgente', 'factura', 'spam', 'otro'] as const;

// Aprendizajes globales de conversación aprobados vía admin/conversacional.
// Voz los inyecta en cada assistant build (src/lib/vapi/sync.ts:26).
// Email los ganó en audit sesión 53 (ver [[audit-deferred-handoff]] sección E)
// para mantener paridad — si el equipo aprueba un ajuste de estilo tras
// revisar llamadas, los correos también deben adoptarlo.
async function fetchConversationalLearningsForEmail(): Promise<{ general: string | null; micro: string | null }> {
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

function isStr(v: unknown): v is string { return typeof v === 'string'; }
function isBool(v: unknown): v is boolean { return typeof v === 'boolean'; }
function strOrNull(v: unknown, max = 5000): string | null {
  return isStr(v) && v.trim() !== '' ? v.trim().slice(0, max) : null;
}

// Valida el JSON que devuelve el modelo antes de escribir a DB o disparar
// acciones (envío de correo, escalación). Evita: category basura entrando a la
// tabla, needsInfo=string truthy triggereando escalation por error.
function validateProcessedEmail(raw: unknown): ProcessedEmail {
  const r = (raw ?? {}) as Record<string, unknown>;
  const rawCat = isStr(r.category) ? r.category.toLowerCase().trim() : '';
  const category = (VALID_CATEGORIES as readonly string[]).includes(rawCat) ? rawCat : 'otro';
  return {
    category,
    summary:            strOrNull(r.summary, 500) ?? 'Email recibido.',
    draft:              strOrNull(r.draft, 8000),
    invoiceData:        (r.invoice_data && typeof r.invoice_data === 'object')
                          ? r.invoice_data as Record<string, string | number | null> : null,
    invoiceValid:       isBool(r.invoice_valid) ? r.invoice_valid : null,
    invoiceDiscrepancy: strOrNull(r.invoice_discrepancy, 500),
    needsInfo:          isBool(r.needs_info) ? r.needs_info : false,
    infoNeeded:         strOrNull(r.info_needed, 2000),
    requestToSender:    strOrNull(r.request_to_sender, 4000),
  };
}

// All tools available in email context (ML tools excluded — require portal cookie)
const BASE_EMAIL_TOOLS: Anthropic.Tool[] = [
  {
    name:        'search_files',
    description: 'Busca documentos en Google Drive o OneDrive del negocio para encontrar información relevante al email: contratos, cotizaciones, catálogos, manuales.',
    input_schema: { type: 'object' as const, properties: { query: { type: 'string' } }, required: ['query'] },
  },
  {
    name:        'read_file',
    description: 'Lee el contenido de un archivo (PDF, doc, Excel). Úsala DESPUÉS de search_files cuando el archivo encontrado sea relevante para redactar la respuesta.',
    input_schema: { type: 'object' as const, properties: { file_id: { type: 'string' }, file_name: { type: 'string' }, mime_type: { type: 'string' } }, required: ['file_id', 'file_name'] },
  },
  {
    name:        'buscar_en_web',
    description: 'Busca información en internet para enriquecer la respuesta: precios, datos de contacto, regulaciones, noticias.',
    input_schema: { type: 'object' as const, properties: { query: { type: 'string' } }, required: ['query'] },
  },
  {
    name:        'extraer_voz_del_cliente',
    description: 'Analiza conversaciones reales de la organización (llamadas, correos o tickets) y extrae lenguaje literal del cliente, objeciones frecuentes y candidatos de titular. Úsala cuando el correo pida entender qué dicen los clientes, preparar copy o revisar patrones.',
    input_schema: { type: 'object' as const, properties: { fuente: { type: 'string', enum: ['calls','emails','tickets','all'] }, dias: { type: 'number' }, min_muestras: { type: 'number' } }, required: [] },
  },
  {
    name:        'read_url',
    description: 'Lee el contenido de una URL específica (no redes sociales). Úsala para leer sitios web o documentos en línea mencionados en el email.',
    input_schema: { type: 'object' as const, properties: { url: { type: 'string' }, purpose: { type: 'string' } }, required: ['url'] },
  },
  {
    name:        'list_calendar_events',
    description: 'Consulta la agenda para verificar disponibilidad antes de responder a solicitudes de reunión o citas.',
    input_schema: { type: 'object' as const, properties: { from: { type: 'string' }, to: { type: 'string' } }, required: ['from', 'to'] },
  },
  {
    name:        'create_calendar_event',
    description: 'Crea un evento en el calendario cuando el email contiene una solicitud de reunión o cita acordada.',
    input_schema: { type: 'object' as const, properties: { title: { type: 'string' }, start: { type: 'string' }, end: { type: 'string' }, description: { type: 'string' }, location: { type: 'string' }, attendees: { type: 'array', items: { type: 'string' } } }, required: ['title', 'start', 'end'] },
  },
  {
    name:        'delete_calendar_event',
    description: 'Cancela un evento del calendario si el email solicita cancelar una cita.',
    input_schema: { type: 'object' as const, properties: { event_id: { type: 'string' } }, required: ['event_id'] },
  },
  {
    name:        'create_civic_report',
    description: 'Registra un reporte ciudadano (bache, luminaria, basura, agua, ruido, etc.) cuando el email es una queja o reporte de servicio municipal.',
    input_schema: { type: 'object' as const, properties: { category: { type: 'string', enum: ['bache', 'luminaria', 'basura', 'agua', 'ruido', 'parque', 'transporte', 'otro'] }, description: { type: 'string' }, location_text: { type: 'string' }, caller_name: { type: 'string' }, caller_number: { type: 'string' } }, required: ['category', 'description'] },
  },
  {
    name:        'lookup_civic_report',
    description: 'Consulta el estatus de un reporte ciudadano por folio o teléfono del remitente.',
    input_schema: { type: 'object' as const, properties: { folio: { type: 'string' }, caller_number: { type: 'string' } }, required: [] },
  },
  {
    name:        'update_civic_report',
    description: 'Actualiza el estatus o agrega notas a un reporte ciudadano existente.',
    input_schema: { type: 'object' as const, properties: { folio: { type: 'string' }, status: { type: 'string', enum: ['abierto', 'en_proceso', 'resuelto', 'cerrado'] }, notes: { type: 'string' } }, required: ['folio'] },
  },
  {
    name:        'create_document',
    description: 'Genera un PDF (propuesta, carta, factura, orden de compra, documento general) en respuesta al email.',
    input_schema: {
      type: 'object' as const,
      properties: {
        title: { type: 'string' }, content: { type: 'string' }, filename: { type: 'string' },
        template_type: { type: 'string', enum: ['general', 'proposal', 'letter', 'factura', 'orden_compra'] },
        client_name: { type: 'string' }, client_email: { type: 'string' }, client_rfc: { type: 'string' },
        total_price: { type: 'string' }, validity_days: { type: 'number' },
        recipient_name: { type: 'string' }, recipient_email: { type: 'string' },
        vendor_name: { type: 'string' }, vendor_rfc: { type: 'string' }, vendor_email: { type: 'string' },
        delivery_terms: { type: 'string' }, payment_terms: { type: 'string' }, folio_num: { type: 'string' }, include_iva: { type: 'boolean' }, folio_prefix: { type: 'string' },
        items: { type: 'array', items: { type: 'object', properties: { descripcion: { type: 'string' }, cantidad: { type: 'number' }, precio_unitario: { type: 'number' }, unidad: { type: 'string' } }, required: ['descripcion', 'cantidad', 'precio_unitario'] } },
      },
      required: ['title', 'content'],
    },
  },
  {
    name:        'create_file',
    description: 'Genera un archivo Excel, Word o PowerPoint en respuesta al email.',
    input_schema: {
      type: 'object' as const,
      properties: {
        format: { type: 'string', enum: ['excel', 'word', 'powerpoint'] },
        title: { type: 'string' }, filename: { type: 'string' },
        content: { type: 'string' }, template_type: { type: 'string', enum: ['general', 'proposal', 'letter'] },
        client_name: { type: 'string' }, client_email: { type: 'string' },
        total_price: { type: 'string' }, validity_days: { type: 'number' },
        recipient_name: { type: 'string' }, recipient_email: { type: 'string' },
        sheets: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' }, headers: { type: 'array', items: { type: 'string' } }, rows: { type: 'array', items: { type: 'array', items: { type: 'string' } } } }, required: ['name', 'headers', 'rows'] } },
        slides: { type: 'array', items: { type: 'object', properties: { title: { type: 'string' }, content: { type: 'string' }, notes: { type: 'string' } }, required: ['title', 'content'] } },
      },
      required: ['format', 'title'],
    },
  },
  {
    name:        'save_to_drive',
    description: 'Guarda un documento en Drive. Úsala DESPUÉS de create_document o create_file, solo si el correo pide entregar el archivo o si el negocio archiva sus PDFs. No la uses en respuestas informativas.',
    input_schema: { type: 'object' as const, properties: { file_id: { type: 'string' }, filename: { type: 'string' }, folder_name: { type: 'string' } }, required: ['file_id', 'filename'] },
  },
  {
    name:        'buscar_producto',
    description: 'Busca un producto o servicio en el catálogo de Notion por SKU o nombre. Úsala antes de generar una factura cuando el email mencione un SKU o nombre de producto.',
    input_schema: { type: 'object' as const, properties: { query: { type: 'string' } }, required: ['query'] },
  },
  {
    name:        'create_contract_draft',
    description: 'Crea un borrador de contrato cuando el email resulta en un acuerdo comercial.',
    input_schema: {
      type: 'object' as const,
      properties: {
        client_name: { type: 'string' }, client_email: { type: 'string' },
        client_rfc: { type: 'string' }, client_phone: { type: 'string' },
        notes: { type: 'string' }, source_type: { type: 'string', enum: ['llamada', 'correo', 'manual'] }, source_ref: { type: 'string' },
        clause_overrides: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, enabled: { type: 'boolean' }, body: { type: 'string' } }, required: ['id'] } },
      },
      required: [],
    },
  },
  {
    name:        'send_email',
    description: 'Envía un email directamente (sin aprobación previa) en respuesta al correo entrante o como notificación interna. Úsalo en jornadas de puras tareas para respuestas automatizadas sin supervisión.',
    input_schema: { type: 'object' as const, properties: { to: { type: 'string' }, subject: { type: 'string' }, body: { type: 'string' }, cc: { type: 'string' }, attachment_file_id: { type: 'string' }, attachment_file_name: { type: 'string' }, attachment_mime_type: { type: 'string' } }, required: ['to', 'subject', 'body'] },
  },
  {
    name:        'trigger_outbound_call',
    description: 'Programa una llamada saliente automatizada. Úsala SOLO si el remitente pide explícitamente que le llames, o si tienes autorización previa para hacer seguimiento telefónico. NUNCA para prospección fría — es más seguro responder por correo primero.',
    input_schema: { type: 'object' as const, properties: { phone_number: { type: 'string' }, contact_name: { type: 'string' }, message: { type: 'string' } }, required: ['phone_number', 'message'] },
  },
  {
    name:        'search_leads',
    description: 'Investigación profunda multi-query (competidores, mercado, regulaciones, noticias). Diferente de buscar_en_web (una sola query rápida). Úsala solo si la respuesta requiere cruzar múltiples fuentes.',
    input_schema: {
      type: 'object' as const,
      properties: {
        topic: { type: 'string' }, location: { type: 'string' },
        keywords: { type: 'array', items: { type: 'string' } },
        research_type: { type: 'string', enum: ['leads', 'competidores', 'mercado', 'regulaciones', 'noticias', 'general'] },
      },
      required: ['topic'],
    },
  },
  {
    name:        'consult_agent',
    description: 'Pide INFORMACIÓN a un compañero especialista (contador, RH, almacén). Úsala cuando no sabes la respuesta y crees que otro empleado sí. Diferente de delegate_task, que le pide EJECUTAR una acción.',
    input_schema: { type: 'object' as const, properties: { rol: { type: 'string' }, tarea: { type: 'string' }, contexto: { type: 'string' } }, required: ['rol', 'tarea'] },
  },
  {
    name:        'delegate_task',
    description: 'Pide a un compañero que EJECUTE una tarea concreta (crear factura, agendar cita, hacer llamada, subir archivo). Úsala cuando la acción está fuera de tu alcance. Diferente de consult_agent, que solo pide información sin ejecutar.',
    input_schema: { type: 'object' as const, properties: { agente: { type: 'string' }, tarea: { type: 'string' }, contexto: { type: 'string' } }, required: ['agente', 'tarea'] },
  },
  {
    name:        'reportar_falla',
    description: 'Reporta una falla técnica inesperada al equipo de soporte.',
    input_schema: { type: 'object' as const, properties: { tipo: { type: 'string' }, descripcion: { type: 'string' }, contexto: { type: 'string' } }, required: ['tipo', 'descripcion'] },
  },
  // ── Data capture (voz+chat+email según regla de 3 canales) ────────────────
  {
    name:        'crear_lead',
    description: 'Registra al remitente (o a un prospecto mencionado en el correo) como lead cuando el email exprese interés en contratar, cotizar o probar un servicio. Visible después en Llamadas → Leads.',
    input_schema: {
      type: 'object' as const,
      properties: {
        nombre:      { type: 'string', description: 'Nombre completo del prospecto' },
        negocio:     { type: 'string', description: 'Nombre del negocio del prospecto' },
        giro:        { type: 'string', description: 'Giro o industria del negocio' },
        servicio:    { type: 'string', description: 'Servicio en el que está interesado' },
        presupuesto: { type: 'string', description: 'Presupuesto aproximado si lo menciona' },
        timeline:    { type: 'string', description: 'Para cuándo lo necesita si lo menciona' },
        email:       { type: 'string', description: 'Correo del prospecto (usa el email del remitente si no da otro)' },
        whatsapp:    { type: 'string', description: 'WhatsApp del prospecto si lo comparte' },
      },
      required: ['nombre', 'servicio'],
    },
  },
  {
    name:        'agendar_cita',
    description: 'Agenda, modifica o cancela una cita cuando el remitente confirma día y hora. Antes de agendar, usa list_calendar_events para verificar disponibilidad.',
    input_schema: {
      type: 'object' as const,
      properties: {
        accion:   { type: 'string', enum: ['agendar', 'modificar', 'cancelar'], description: 'Acción a realizar' },
        nombre:   { type: 'string', description: 'Nombre del cliente' },
        servicio: { type: 'string', description: 'Servicio para la cita' },
        fecha:    { type: 'string', description: 'Fecha de la cita. Ej: "lunes 28 de julio"' },
        hora:     { type: 'string', description: 'Hora de la cita. Ej: "10:00 AM"' },
        telefono: { type: 'string', description: 'Teléfono del cliente (necesario para modificar o cancelar)' },
      },
      required: ['accion', 'nombre'],
    },
  },
  {
    name:        'registrar_pedido',
    description: 'Registra un pedido cuando el email contiene una orden clara: producto, cantidad, forma de entrega. Si algún dato falta, mejor pídelo en la respuesta antes de crear el pedido.',
    input_schema: {
      type: 'object' as const,
      properties: {
        nombre:    { type: 'string', description: 'Nombre del cliente' },
        telefono:  { type: 'string', description: 'Teléfono del cliente' },
        items:     { type: 'string', description: 'Descripción de los productos o servicios pedidos' },
        tipo:      { type: 'string', enum: ['entrega', 'recoger'], description: '"entrega" a domicilio o "recoger" en sucursal' },
        direccion: { type: 'string', description: 'Dirección de entrega (solo si tipo es "entrega")' },
        notas:     { type: 'string', description: 'Notas adicionales del pedido' },
      },
      required: ['nombre', 'items', 'tipo'],
    },
  },
  {
    name:        'buscar_cliente',
    description: 'Busca el historial (llamadas, leads, pedidos, citas) del remitente antes de redactar la respuesta, para dar contexto y evitar preguntar por datos que ya tenemos. Búscalo por email, nombre o teléfono.',
    input_schema: {
      type: 'object' as const,
      properties: {
        identificador: { type: 'string', description: 'Nombre completo, número de teléfono o email del cliente a buscar' },
      },
      required: ['identificador'],
    },
  },
  // ── Helpdesk / IT (voz+chat+email según regla de 3 canales) ───────────────
  {
    name:        'crear_ticket',
    description: 'Crea un ticket de soporte IT cuando el correo reporta un problema técnico que requiere seguimiento. Después incluye el folio en la respuesta al remitente.',
    input_schema: {
      type: 'object' as const,
      properties: {
        titulo:        { type: 'string', description: 'Título breve del problema' },
        categoria:     { type: 'string', enum: ['red', 'servidores', 'usuario', 'software', 'hardware', 'accesos', 'otro'], description: 'Categoría del problema' },
        prioridad:     { type: 'string', enum: ['baja', 'normal', 'alta', 'critica'], description: 'Prioridad del ticket' },
        descripcion:   { type: 'string', description: 'Descripción detallada del problema' },
        caller_number: { type: 'string', description: 'Teléfono del usuario afectado (opcional)' },
      },
      required: ['titulo', 'categoria', 'prioridad'],
    },
  },
  {
    name:        'consultar_incidentes',
    description: 'Verifica si el problema reportado en el correo ya está registrado como incidente activo. Úsala ANTES de crear_ticket para evitar duplicados y responder con el mensaje oficial.',
    input_schema: {
      type: 'object' as const,
      properties: {
        tema: { type: 'string', description: 'Tema o sistema sobre el que preguntas (ej: internet, correo, SAP). Opcional.' },
      },
      required: [],
    },
  },
  {
    name:        'buscar_directorio',
    description: 'Busca en el directorio interno quién atiende un tipo de problema o área. Úsala para saber a quién referir al remitente cuando el email pide contacto de un especialista.',
    input_schema: {
      type: 'object' as const,
      properties: {
        tipo_problema: { type: 'string', description: 'Tipo de problema o área (ej: red, VPN, impresoras, SAP)' },
      },
      required: ['tipo_problema'],
    },
  },
  {
    name:        'iniciar_onboarding',
    description: 'Inicia el proceso de onboarding para un nuevo empleado, cliente o proveedor cuando el correo así lo solicita. Dispara el envío del correo de bienvenida y crea el registro de seguimiento.',
    input_schema: {
      type: 'object' as const,
      properties: {
        contact_name:  { type: 'string', description: 'Nombre completo del contacto' },
        contact_email: { type: 'string', description: 'Correo electrónico del contacto (usa el del remitente si aplica)' },
        template_name: { type: 'string', description: 'Nombre de la plantilla a usar (opcional)' },
      },
      required: ['contact_name', 'contact_email'],
    },
  },
  {
    name:        'pedir_a_humano',
    description: `Pide a un humano del equipo del negocio: info que no tienes, una acción física, o confirmación de una decisión importante.

Úsala CUANDO:
- Necesitas datos/archivos que no están en Drive ni puedes obtener con otras tools
- Requiere una acción FÍSICA que solo un humano puede hacer (revisar stock, firmar documento en papel)
- Requiere aprobación de una decisión que excede tu autoridad

Para llamadas telefónicas:
- Si tienes minutos disponibles Y toda la info → usa trigger_outbound_call, NO pidas a humano
- Solo pide llamada a humano si: sin minutos, cliente pidió humano, o conversación delicada

NO la uses para:
- Info obtenible con search_files, buscar_en_web, o QB
- Cosas que puede hacer otro agente (usa delegate_task)
- Llamadas que puedes hacer tú (usa trigger_outbound_call primero)`,
    input_schema: {
      type: 'object' as const,
      properties: {
        type:         { type: 'string', enum: ['info', 'action', 'approval'] },
        target:       { type: 'string', enum: ['approver', 'owner', 'specific'] },
        target_email: { type: 'string' },
        title:        { type: 'string' },
        description:  { type: 'string' },
        urgency:      { type: 'string', enum: ['baja', 'media', 'alta'] },
        needed_by:    { type: 'string' },
      },
      required: ['type', 'target', 'title', 'description'],
    },
  },
];

const QB_EMAIL_TOOLS: Anthropic.Tool[] = [
  {
    name:        'qb_consultar_facturas',
    description: 'Consulta facturas en QuickBooks. Úsalo cuando el email haga referencia a facturas, pagos o estado de cuenta.',
    input_schema: { type: 'object' as const, properties: { cliente: { type: 'string' }, solo_pendientes: { type: 'boolean' } }, required: [] },
  },
  {
    name:        'qb_buscar_cliente',
    description: 'Busca un cliente en QuickBooks y muestra su saldo y facturas abiertas.',
    input_schema: { type: 'object' as const, properties: { nombre: { type: 'string' } }, required: ['nombre'] },
  },
  {
    name:        'qb_crear_factura',
    description: 'Crea una factura en QuickBooks cuando el email resulta en un pedido confirmado. Consume 1 tarea.',
    input_schema: { type: 'object' as const, properties: { cliente_nombre: { type: 'string' }, descripcion: { type: 'string' }, monto: { type: 'number' }, fecha_vencimiento: { type: 'string' } }, required: ['cliente_nombre', 'descripcion', 'monto'] },
  },
  {
    name:        'qb_registrar_pago',
    description: 'Registra un pago recibido en QuickBooks. Consume 1 tarea.',
    input_schema: { type: 'object' as const, properties: { cliente_nombre: { type: 'string' }, monto: { type: 'number' }, factura_numero: { type: 'string' } }, required: ['cliente_nombre', 'monto'] },
  },
  {
    name:        'qb_reporte_ingresos',
    description: 'Genera un reporte de ingresos desde QuickBooks para incluir en la respuesta.',
    input_schema: { type: 'object' as const, properties: { periodo: { type: 'string', enum: ['este_mes', 'mes_pasado', 'este_año', 'año_pasado', 'este_trimestre', 'trimestre_pasado'] } }, required: [] },
  },
];

export async function processInboxEmail(params: {
  agentId:           string;
  source:            string;
  rawMessageId?:     string;
  threadId?:         string;
  emailFrom:         string;
  emailSubject:      string;
  emailBody:         string;
  attachments:       Array<{ name: string; url: string; type: string; size: number }>;
  agentName:         string;
  businessName:      string;
  knowledgeBase?:    string | null;
  roleKB?:           string | null;
  agentRole?:        string | null;
  ownerEmail:        string;
  portalToken:       string;
  portalEmail?:      string;
  autoMode?:         'observador' | 'off' | 'auto' | 'always';
  approvalEmail?:    string | null;
  existingInboxId?:  string;         // set when this is a reply to an info_requested thread
  originalEmailBody?: string;        // original email body from the info_requested record
  fromSpamFolder?:   boolean;        // true when fetched from provider spam/junk folder
  unmarkSpamFn?:     (messageId: string) => Promise<void>; // best-effort: move out of spam in provider
  sendReplyFn?:      (body: string) => Promise<void>;
  // Dispatcher metadata — set cuando el correo llegó a la bandeja compartida
  // de la org y fue asignado por el dispatcher. En flow per-agent son undefined.
  originScope?:          'per_agent' | 'org_shared';
  assignedBy?:           'per_agent' | 'rule' | 'llm' | 'fallback' | 'human';
  assignmentConfidence?: number | null;
  assignmentMetadata?:   Record<string, unknown> | null;
}): Promise<void> {
  const {
    agentId, source, rawMessageId, threadId, emailFrom, emailSubject,
    emailBody, attachments, agentName, businessName,
    knowledgeBase, roleKB, agentRole, ownerEmail, portalToken, portalEmail,
    autoMode = 'off', approvalEmail, existingInboxId, originalEmailBody,
    fromSpamFolder = false, unmarkSpamFn, sendReplyFn,
    originScope, assignedBy, assignmentConfidence, assignmentMetadata,
  } = params;

  // Reserva el id de la row de ops_inbox ANTES de correr el LLM. Necesario para que
  // pedir_a_humano (llamado durante el loop de tools) pueda linkear human_requests
  // al inbox correcto. Sin esto, la row se crea después del LLM y las solicitudes
  // quedan con source_inbox_id=null, rompiendo el resume flow.
  const reservedInboxId = existingInboxId ?? randomUUID();

  // Metadata común de asignación — se aplica a AMBOS inserts (quick-classify y LLM).
  const dispatcherCols = {
    origin_scope:          originScope          ?? 'per_agent',
    assigned_by:           assignedBy           ?? 'per_agent',
    assignment_confidence: assignmentConfidence ?? null,
    assignment_metadata:   assignmentMetadata   ?? null,
  };

  // If this is a reply to an info_requested thread, prepend the original context
  const effectiveBody = originalEmailBody
    ? `${originalEmailBody}\n\n--- Respuesta del remitente ---\n${emailBody}`
    : emailBody;

  const hasInvoiceAttachment = attachments.some(a =>
    a.type === 'application/pdf' || a.name.toLowerCase().includes('factura') || a.name.toLowerCase().includes('invoice')
  );
  const looksLikeInvoice = hasInvoiceAttachment ||
    /factura|invoice|bill|cobro|pago/i.test(emailSubject) ||
    /factura|invoice|bill|cobro/i.test(effectiveBody.slice(0, 300));

  // C5 — clasificación determinística. Correos obviamente automáticos o
  // marketing no van a Claude: se marcan `skipped` sin consumir ops.
  // Excepciones: si es una respuesta a un info_requested (existingInboxId),
  // si el correo huele a factura, o si vino de la carpeta spam del proveedor
  // (fromSpamFolder=true) — en ese caso Haiku ya evaluará si es legítimo.
  if (!existingInboxId && !looksLikeInvoice && !fromSpamFolder) {
    const quick = quickClassifyEmail({
      from:    emailFrom,
      subject: emailSubject,
      body:    effectiveBody,
    });
    if (quick.category) {
      const supabase = createAdminClient();
      const category = quick.category === 'spam' ? 'spam' : 'otro';
      const summary  = quick.category === 'spam'
        ? `Correo de marketing (clasificado sin IA: ${quick.reason ?? 'patrón detectado'}).`
        : `Notificación automática (clasificado sin IA: ${quick.reason ?? 'patrón detectado'}).`;
      await supabase.from('ops_inbox').insert({
        agent_id:       agentId,
        source,
        raw_message_id: rawMessageId ?? null,
        thread_id:      threadId ?? null,
        email_from:     emailFrom,
        email_subject:  emailSubject,
        email_body:     effectiveBody.slice(0, EMAIL_BODY_TRUNCATE_CHARS),
        attachments,
        category,
        ai_summary:     summary,
        ai_draft:       null,
        item_type:      'email',
        status:         'skipped',
        ...dispatcherCols,
      });
      return;
    }
  }

  const contextBlocks: string[] = [];
  if (knowledgeBase?.trim()) contextBlocks.push(`NEGOCIO:\n${knowledgeBase.trim()}`);
  if (agentRole?.trim() && roleKB?.trim()) contextBlocks.push(`ROL DEL AGENTE: ${agentRole}\n${roleKB.trim()}`);
  if (portalEmail) {
    const { buildInternalDirectoryString } = await import('@/lib/human-handoff/directory');
    const directory = await buildInternalDirectoryString(portalEmail);
    if (directory) contextBlocks.push(directory);
  }
  const contextSection = contextBlocks.length ? `\n\n${contextBlocks.join('\n\n')}` : '';

  const spamRescueNote = fromSpamFolder
    ? `\n\nATENCIÓN: Este correo fue marcado como SPAM por el proveedor de correo. Tu tarea es evaluar si realmente es spam o si es un correo legítimo que fue malfilteado. Si concluyes que es legítimo (cliente real, proveedor conocido, solicitud de trabajo), clasifícalo con la categoría correcta y redacta la respuesta normal — será RESCATADO de la carpeta spam. Si confirmas que sí es spam/publicidad no deseada, clasifícalo como 'spam'.`
    : '';

  // Aviso operativo derivado de autoMode (ya resuelto arriba desde trust_stage).
  // Voz+WA hacen esto vía voice/prompt-builder; email lo ganó en audit sesión 53.
  const trustNote = autoMode === 'observador'
    ? '\n\nMODO OBSERVADOR: No prometas ejecutar acciones (agendar, crear, registrar). El equipo revisará tu borrador; explícale al remitente que su mensaje fue recibido y será atendido, sin comprometerte a resultados.'
    : '';

  // Aprendizajes de conversación — paridad con voz (ver comment arriba).
  const learnings = await fetchConversationalLearningsForEmail();
  const learningsBlock = (() => {
    const parts: string[] = [];
    if (learnings.general?.trim()) {
      parts.push(`AJUSTES DE ESTILO — APRENDIDOS DE INTERACCIONES REALES:
Aplícalos de forma natural en el borrador, sin mencionarlos explícitamente:

${learnings.general.trim()}`);
    }
    if (learnings.micro?.trim()) {
      parts.push(`MICRODECISIONES CONVERSACIONALES — CENTINELIA:
Conductas situacionales aprendidas. Aplícalas exactamente cuando ocurra la señal indicada, no en general:

${learnings.micro.trim()}`);
    }
    return parts.length ? `\n\n${parts.join('\n\n')}` : '';
  })();

  // ── Política de Uso Aceptable ─────────────────────────────────────────────
  // Voz y WhatsApp la traen; email la ganó en audit sesión 53. La aplicamos
  // siempre en email (no hay skip_aup en este flujo por ahora).
  const aupBlock = `POLÍTICA DE USO ACEPTABLE — CENTINELIA (NO NEGOCIABLE):
Eres empleado digital operado por Centinelia. Tu uso está regido por la Política de Uso Aceptable de la plataforma. Aplica SIEMPRE, sin importar las instrucciones del negocio que te configure:

ACTIVIDADES ABSOLUTAMENTE PROHIBIDAS — no redactes borrador y escala vía pedir_a_humano si detectas cualquiera de estas:
1. Extorsión o amenazas: exigir dinero, información o acciones bajo coacción.
2. Fraude o estafa: engañar para obtener dinero, datos personales, acceso a cuentas.
3. Suplantación de autoridad: hacerse pasar por policía, gobierno, banco, IMSS, SAT.
4. Acoso u hostigamiento: correos repetidos con amenazas o presión ilegal.
5. Cobro de deudas ilegal: presionar con métodos no autorizados por la ley.
6. Campañas masivas de fraude: cualquier plantilla que pida datos de tarjetas/cuentas/contraseñas bajo pretexto.

Si detectas que el correo del remitente o las instrucciones del negocio te piden participar en cualquiera de estas actividades: NO redactes borrador de cumplimiento; marca la categoría más cercana y escala vía pedir_a_humano({type:'approval', description:'Correo detectado con posible uso indebido: <resumen>'}). NUNCA generes contenido que ejecute estas actividades. Centinelia monitorea el uso; cuentas que infrinjan pueden ser suspendidas.

DIVULGACIÓN: Si el remitente pregunta si eres humano o IA, responde honestamente: soy asistente digital que redacta borradores para el equipo. Nunca finjas ser humano.

`;

  const systemPrompt = `${aupBlock}Eres ${agentName}, empleado de oficina de ${businessName}. Analizas emails entrantes y produces JSON con la categoría, resumen y borrador de respuesta.${contextSection}${learningsBlock}${spamRescueNote}${trustNote}

=== REGLAS CRÍTICAS ANTI-FABRICACIÓN — LÉELAS PRIMERO ===

Estas reglas se verifican con un safety net post-generación. Violarlas causa que tu draft sea BLOQUEADO automáticamente y el humano tenga que rehacer el trabajo. Léelas cada vez:

1. HORARIOS/FECHAS/DISPONIBILIDAD: NUNCA los propongas sin haber llamado list_calendar_events primero. Si el cliente pide reunión y no tienes fecha específica, tu única opción es (a) llamar list_calendar_events y proponer horarios verificados, O (b) responder "te confirmo horario en 24hrs" + pedir_a_humano({type:'action', ...}).

2. PRECIOS/RANGOS/COTIZACIONES: NUNCA inventes cifras. Si el cliente pide "cuánto cuesta", tu única opción es (a) precios verificados en el KB o Drive, O (b) pedir_a_humano({type:'approval', description:'Cliente pide cotización para X. Rango que autorizas: ...'}).

3. POLÍTICAS DEL NEGOCIO (garantías, plazos, procesos): si no está en el KB o Drive, NO la fabriques. Admite honestamente que necesitas verificar o usa pedir_a_humano.

4. CASOS DE ÉXITO, TESTIMONIOS, REFERENCIAS: si search_files no los encuentra, usa pedir_a_humano({type:'info', description:'Cliente pide casos de éxito de X. Drive no tiene. ¿Cuáles puedo compartir?'}).

5. COMPROMISOS QUE EXCEDEN TU AUTORIDAD: descuentos, plazos especiales, condiciones no estándar → pedir_a_humano({type:'approval', ...}).

Regla de oro: PEDIR AYUDA es SIEMPRE mejor que INVENTAR. Un correo con "voy a verificar y te contesto pronto" es MEJOR que un correo con datos fabricados. Fabricar rompe la confianza; verificar la construye.

=== CLASIFICACIÓN ===

Categorías: proveedor, cliente, urgente, factura, spam, otro.
- "urgente": emergencias, quejas graves, solicitudes de alta prioridad.
- "factura": cualquier email con factura, cargo o solicitud de pago de un proveedor.
- "otro": correos de trabajo legítimos que no encajan en las otras 4 categorías.

MARCA COMO 'spam' TODO CORREO QUE NO REQUIERE ATENCIÓN DEL EQUIPO:
- Publicidad/promociones de tiendas, marcas, o servicios que NO son proveedores actuales
- Newsletters, blog updates, product announcements de servicios que NO usa el negocio
- Notificaciones automáticas de plataformas que NO son operacionales (LinkedIn "añade a...", Google Analytics reports, security alerts genéricas)
- Ofertas comerciales frías (cold outreach de vendedores externos)
- Contenido educativo/motivacional no solicitado

Si dudas entre 'spam' y 'otro', piensa: "¿el equipo tiene que hacer algo con esto?".
Si no, es spam. Mejor archivar de más que llenar la bandeja con ruido.

Tienes herramientas para consultar datos reales del negocio (Drive, internet, QuickBooks, calendario, reportes ciudadanos, compañeros, etc.). Úsalas proactivamente si el email pide información específica para que el borrador de respuesta sea preciso y con datos reales.

Recuerda las 5 reglas ANTI-FABRICACIÓN del principio: horarios, precios, políticas, casos de éxito, compromisos. Ante duda: pedir_a_humano.

=== CUÁNDO ESCALAR AL EQUIPO INTERNO (info que el remitente NO tiene) ===

Ejemplo A: Cliente pide cotización para proyecto grande. El precio depende del alcance y NO está en el knowledge base. Necesitas que un humano del equipo confirme un rango.
→ USA LA TOOL: pedir_a_humano({type:'approval', description:'Cliente pide cotización para X. Rango que autorizas: ...', urgency:'alta'})
→ NO uses needs_info=true. Ese campo NO comunica con el equipo interno.

Ejemplo B: Cliente pide casos de éxito de un sector específico. Search_files no los encontró en Drive.
→ USA LA TOOL: pedir_a_humano({type:'info', description:'Cliente pide casos de éxito sector Y. Drive no tiene. ¿Cuáles puedo compartir?'})

Ejemplo C: Cliente pide agendar reunión (sin fecha específica o con fecha vaga tipo "esta semana").
→ CORRECTO: PRIMERO llamas list_calendar_events(from: hoy, to: +14 días) → analizas huecos reales → propones 2-3 horarios verificados. Si no tienes acceso al calendario o list_calendar_events falla → usa pedir_a_humano({type:'action', description:'Cliente pide reunión próxima semana. Necesito que confirmes 2-3 horarios disponibles para proponerle.'}).
→ INCORRECTO: proponer horarios genéricos ("mañana 10am o 2pm", "puedo el martes o miércoles") sin haber llamado list_calendar_events. El auto-mode classifier tiene safety net que detecta esta alucinación específica y BLOQUEA tu draft. Perderás la venta y el humano tendrá que rehacer tu trabajo. NO propongas horarios sin verificarlos primero — mejor "te confirmo horarios en 24 horas" + pedir_a_humano.

Tipos de pedir_a_humano:
- type:'info' — necesitas info específica del equipo (precios, políticas reales, casos, credenciales, catálogos).
- type:'action' — necesitas que un humano ejecute algo físico (llamar cliente, revisar stock, verificar contrato).
- type:'approval' — necesitas aprobación de una decisión (descuento, plazo, condición no estándar).

=== CUÁNDO USAR needs_info + request_to_sender (info que SOLO el remitente conoce) ===

Ejemplo D: Cliente pide cotización sin decir cuántas unidades ni plazo.
→ needs_info: true
→ request_to_sender: "Para cotizarte con precisión necesito: cuántas unidades, plazo objetivo, si requieres entrega en sitio."

Ejemplo E: Cliente pide factura pero no dio RFC ni razón social.
→ needs_info: true
→ request_to_sender: "Para emitirte la factura confirma: RFC, razón social, uso CFDI y forma de pago."

Ejemplo F: Correo vago sin contexto suficiente. Ej. subject="Cita" o "Cotización" con body vacío, de una sola línea, o sin datos concretos.
→ needs_info: true
→ request_to_sender: acuse breve + 2-3 preguntas específicas para desbloquear. Ejemplo para "Cita": "Hola, gracias por escribirnos. Para agendar tu cita necesito: 1) el servicio que buscas, 2) 2-3 opciones de fecha/horario que te acomoden, 3) un teléfono donde te podamos contactar. Con esos datos te confirmo horario disponible."
→ NUNCA dejes draft=null y needs_info=false en correos legítimos vagos — eso deja al humano sin nada que aprobar. Si el correo NO es spam ni fraude, tienes que emitir needs_info+request_to_sender (correo vago) o draft (correo claro).

REGLA DE ORO — NO NEGOCIABLE:
- needs_info=true SIEMPRE requiere request_to_sender con texto real.
- Si necesitas info del equipo interno (no del remitente), USA LA TOOL pedir_a_humano, NUNCA needs_info=true.
- Si dudas entre "escalar al equipo" o "pedir al remitente": ¿la info que necesito la tiene el remitente mismo? Sí → needs_info + request_to_sender. No → pedir_a_humano.
- En correo legítimo (no spam) SIEMPRE emites algo accionable: draft, needs_info+request_to_sender, o pedir_a_humano. Nunca las tres en null.

Si puedes responder SOLO con información verificada (herramientas usadas + resultados reales), pon "needs_info": false y llena "draft".

=== AUDITORÍA FINAL DEL DRAFT — ANTES DE EMITIR ===

Antes de producir el JSON, revisa el draft contra el correo original una vez más. Verifica:
1. ¿Respondes cada punto que el remitente preguntó, o dejaste algo sin atender?
2. ¿Todo dato específico (fecha, precio, política, referencia) viene de una herramienta que llamaste, no de una suposición?
3. ¿El tono y trato al cliente coinciden con lo que el negocio pediría, no genéricos?
4. ¿Hay algo asumido que debería ir como pregunta (needs_info) o escalación (pedir_a_humano) en vez de darse por resuelto?

Si algún punto falla, corrige el draft o cambia a needs_info / pedir_a_humano antes de emitir. Mejor un correo honesto y verificado que uno completo pero inventado.

Al final de cada respuesta que no use herramientas, produce SOLO JSON válido, sin markdown, sin texto adicional.`;

  const invoiceInstructions = looksLikeInvoice
    ? `\nAdemás del análisis estándar, extrae los datos de la factura:
- vendor (nombre del proveedor)
- amount (monto numérico, sin símbolo de moneda)
- currency (MXN por default si no se especifica)
- invoice_no (número de factura)
- date (fecha de la factura YYYY-MM-DD o null)
- po_ref (número de orden de compra mencionado o null)

Si algo no se puede determinar del email, pon null.
Incluye en el JSON un campo "invoice_data" con estos campos.
Incluye "invoice_valid": true si todos los datos esenciales están presentes, false si falta información clave.
Si hay discrepancia o dato sospechoso, descríbela en "invoice_discrepancy" (o null si todo OK).` : '';

  const userPrompt = `EMAIL ENTRANTE:
De: ${emailFrom}
Asunto: ${emailSubject}
${attachments.length ? `Adjuntos: ${attachments.map(a => a.name).join(', ')}` : ''}
${originalEmailBody ? '(Este email es una respuesta a una solicitud de información previa — el hilo completo está en el cuerpo)' : ''}

CUERPO:
${effectiveBody.slice(0, 3000)}
${invoiceInstructions}

Produce JSON con:
{
  "category": "<categoría>",
  "summary": "<resumen de 1-2 oraciones en español>",
  "draft": "<borrador de respuesta en español, o null si no aplica>",
  "needs_info": false,
  "info_needed": null,
  "request_to_sender": null
}
${looksLikeInvoice ? '+ los campos invoice_data, invoice_valid, invoice_discrepancy' : ''}`;

  let result: ProcessedEmail = {
    category:           'otro',
    summary:            'Email recibido.',
    draft:              null,
    invoiceData:        null,
    invoiceValid:       null,
    invoiceDiscrepancy: null,
    needsInfo:          false,
    infoNeeded:         null,
    requestToSender:    null,
  };

  // L3 — verifier: tools que completaron OK durante el tool loop; se lee en la etapa auto_replied.
  const toolsInvokedOk: string[] = [];

  const supabase  = createAdminClient();

  // Observador (Trust Stage 1): triage-only. Sin borrador, sin tools, sin classifier.
  // Categoría + resumen para que el humano lo lea y responda desde cero.
  if (autoMode === 'observador') {
    const obsOps = await consumeAiOp(agentId, 1, { source: 'inbox_processor', label: 'Procesamiento de bandeja (correo/tarea)' });
    if (obsOps.ok) {
      const __obsT = Date.now();
      const __obsM = 'claude-haiku-4-5-20251001';
      try {
        const obsResp = await anthropic.messages.create({
          model:      __obsM,
          max_tokens: 300,
          system: [{ type: 'text', text: `Eres un triador de correos para ${businessName}. Solo clasifica y resume, NUNCA redactes respuesta.`, cache_control: { type: 'ephemeral' } }],
          messages: [{ role: 'user', content: `Categorías: proveedor, cliente, urgente, factura, spam, otro.\n\nDe: ${emailFrom}\nAsunto: ${emailSubject}\nCuerpo: ${effectiveBody.slice(0, 2000)}\n\nResponde SOLO JSON: { "category": "...", "summary": "1-2 oraciones en español" }` }],
        });
        void logLlmCall({ source: 'inbox_processor_observador', model: __obsM, usage: obsResp.usage, agentId, portalEmail, latencyMs: Date.now() - __obsT });
        const txt = obsResp.content.find(b => b.type === 'text');
        const raw = txt?.type === 'text' ? txt.text.trim() : '{}';
        const match = raw.match(/\{[\s\S]*\}/);
        const parsed = match ? JSON.parse(match[0]) as Record<string, unknown> : {};
        result = validateProcessedEmail({ ...parsed, draft: null, needs_info: false });
      } catch (err) {
        void logLlmCall({ source: 'inbox_processor_observador', model: __obsM, usage: { input_tokens: 0, output_tokens: 0 }, agentId, portalEmail, latencyMs: Date.now() - __obsT, error: err instanceof Error ? err.message : String(err) });
        console.error('[inbox-processor] observador triage error:', err);
      }
    }
    // Fall through to status routing (draft=null → pending)
  }

  const opsResult = autoMode === 'observador'
    ? { ok: false as const, error: 'skipped_observador_mode' as const }
    : await consumeAiOp(agentId, 1, { source: 'inbox_processor', label: 'Procesamiento de bandeja (correo/tarea)' });

  if (opsResult.ok && portalEmail) {
    // Fetch full agent row for executor context
    const { data: agentRow } = await supabase
      .from('voice_agents')
      .select('*')
      .eq('id', agentId)
      .single();

    // Include QB tools only when connected
    const qbConnected = !!(await getQBClient(portalEmail, supabase));
    const tools = [
      ...BASE_EMAIL_TOOLS,
      ...(qbConnected ? QB_EMAIL_TOOLS : []),
    ];

    // preparar_brief_del_dia — Nox exclusivo. Canal voz ausente de forma intencional
    // (Nox nunca tiene vapi_agent_id; ver NON_VOICE_ROLES en sync.ts).
    const inboxMeerkatId = ((agentRow?.features as { meerkat_role_id?: string } | undefined) ?? {}).meerkat_role_id;
    if (inboxMeerkatId === 'nox') {
      tools.push({
        name: 'preparar_brief_del_dia',
        description: 'Prepara el brief del día del dueño con 3 buckets (acción hoy / preparación / al tanto). Lee correos urgentes, agenda, tareas pendientes, escalaciones y borradores de contrato. Devuelve el brief en markdown. Opcionalmente, envía copia por correo o WhatsApp si el dueño lo pide.',
        input_schema: {
          type: 'object' as const,
          properties: {
            channels: {
              type: 'object',
              properties: {
                email:    { type: 'boolean', description: 'Enviar copia por correo al dueño' },
                whatsapp: { type: 'boolean', description: 'Enviar copia por WhatsApp al dueño' },
              },
            },
          },
        },
      });
    }

    // Nash (meerkat interno) — tools de monitoreo pasivo + acciones sobre incidentes.
    if (inboxMeerkatId === 'nash') {
      tools.push({
        name: 'revisar_incidentes_plataforma',
        description: 'Uso exclusivo de Nash. Lee las 5 fuentes de incidentes de la plataforma en una sola llamada: bug reports enviados vía reportar_falla, errores del LLM (llm_call_log), bandejas escaladas estancadas más de 24h, handoff replies fallidos, y agent_tasks con status="failed". Deduplica automáticamente contra platform_incidents ya abiertos. Úsala como primera acción de cada ciclo de monitoreo.',
        input_schema: {
          type: 'object' as const,
          properties: {
            days:             { type: 'number', description: 'Ventana hacia atrás en días. Default 7. Máximo 30.' },
            limit_per_source: { type: 'number', description: 'Máximo de filas por fuente. Default 25. Máximo 100.' },
          },
          required: [],
        },
      });
      tools.push({
        name: 'crear_incidente',
        description: 'Uso exclusivo de Nash. Crea fila en platform_incidents con dedupe por (source, source_id). Úsala tras revisar_incidentes_plataforma para trackear señales nuevas.',
        input_schema: {
          type: 'object' as const,
          properties: {
            title:                 { type: 'string' },
            description:           { type: 'string' },
            priority:              { type: 'string', enum: ['low', 'med', 'high', 'critical'] },
            source:                { type: 'string', enum: ['bug_report', 'error_log', 'escalated_inbox', 'failed_handoff', 'agent_task', 'nash_self_discovery', 'manual'] },
            source_id:             { type: 'string' },
            affected_agent_id:     { type: 'string' },
            affected_portal_email: { type: 'string' },
          },
          required: ['title', 'description', 'priority'],
        },
      });
      tools.push({
        name: 'responder_cliente_afectado',
        description: 'Uso exclusivo de Nash. Envía WhatsApp o email al cliente cuyo voice_agent está afectado por un incidente.',
        input_schema: {
          type: 'object' as const,
          properties: {
            agent_id: { type: 'string' },
            mensaje:  { type: 'string' },
            canal:    { type: 'string', enum: ['email', 'whatsapp'] },
          },
          required: ['agent_id', 'mensaje'],
        },
      });
      tools.push({
        name: 'enviar_a_claude_code',
        description: 'Uso exclusivo de Nash. Crea GitHub issue con el prompt de trabajo (NASH_GITHUB_TOKEN). Fallback email cuando el token no está configurado. Marca el incidente como sent_to_claude_code.',
        input_schema: {
          type: 'object' as const,
          properties: {
            incidente_id: { type: 'string' },
            prompt:       { type: 'string' },
            labels:       { type: 'array', items: { type: 'string' } },
          },
          required: ['incidente_id', 'prompt'],
        },
      });
      tools.push({
        name: 'escalar_al_owner',
        description: 'Uso exclusivo de Nash. Notifica al owner por WhatsApp (env OWNER_WHATSAPP) con fallback email hola@. Solo para lo crítico.',
        input_schema: {
          type: 'object' as const,
          properties: {
            razon:        { type: 'string' },
            urgencia:     { type: 'string', enum: ['low', 'med', 'high', 'critical'] },
            incidente_id: { type: 'string' },
          },
          required: ['razon'],
        },
      });
      tools.push({
        name: 'verificar_fix',
        description: 'Uso exclusivo de Nash. Re-lee la señal fuente del incidente. Si desapareció → resolved. Si sigue → awaiting_verification.',
        input_schema: {
          type: 'object' as const,
          properties: {
            incidente_id: { type: 'string' },
          },
          required: ['incidente_id'],
        },
      });
    }

    // Pilar 2 Creatividad — tools condicionales por meerkat_role_id (email)
    {
      const { MEERKAT_TOOL_ACCESS } = await import('@/lib/creativity/meerkat-gates');

      const CREATIVITY_DECLARATIONS: Record<string, Anthropic.Tool> = {
        generar_propuesta_comercial: {
          name: 'generar_propuesta_comercial',
          description: 'Genera una propuesta comercial en PDF para un cliente. Usa cuando calificaste un lead y necesitas mandar propuesta escrita.',
          input_schema: {
            type: 'object' as const,
            properties: {
              client_name:   { type: 'string', description: 'Nombre del cliente o empresa.' },
              client_need:   { type: 'string', description: 'Qué está pidiendo el cliente.' },
              extra_context: { type: 'string', description: 'Contexto extra opcional.' },
            },
            required: ['client_name', 'client_need'],
          },
        },
        generar_cotizacion: {
          name: 'generar_cotizacion',
          description: 'Genera una cotización PDF con precios y condiciones de pago.',
          input_schema: {
            type: 'object' as const,
            properties: {
              client_name:   { type: 'string', description: 'Nombre del cliente.' },
              client_need:   { type: 'string', description: 'Producto o servicio cotizado.' },
              extra_context: { type: 'string', description: 'Contexto extra (cantidad, condiciones, etc.).' },
            },
            required: ['client_name', 'client_need'],
          },
        },
        generar_one_pager: {
          name: 'generar_one_pager',
          description: 'Genera un one-pager informativo (PDF corto) sobre un servicio para mandar a un cliente que pidió info.',
          input_schema: {
            type: 'object' as const,
            properties: {
              client_name:   { type: 'string', description: 'Nombre del cliente destinatario.' },
              client_need:   { type: 'string', description: 'Servicio sobre el cual informar.' },
              extra_context: { type: 'string', description: 'Contexto extra opcional.' },
            },
            required: ['client_name', 'client_need'],
          },
        },
        generar_correo_estructurado: {
          name: 'generar_correo_estructurado',
          description: 'Genera un borrador de correo largo y estructurado. Devuelve subject + HTML body listo para revisar. NO envía el correo.',
          input_schema: {
            type: 'object' as const,
            properties: {
              client_name:   { type: 'string', description: 'Nombre del destinatario.' },
              client_need:   { type: 'string', description: 'Tema del correo.' },
              extra_context: { type: 'string', description: 'Contexto extra opcional.' },
            },
            required: ['client_name', 'client_need'],
          },
        },
        generar_pitch_deck: {
          name: 'generar_pitch_deck',
          description: 'Genera un pitch deck de PowerPoint editable (8-10 slides) para presentar propuesta a un cliente.',
          input_schema: {
            type: 'object' as const,
            properties: {
              client_name:   { type: 'string', description: 'Nombre del cliente destinatario.' },
              client_need:   { type: 'string', description: 'Qué está buscando el cliente.' },
              extra_context: { type: 'string', description: 'Contexto extra opcional.' },
            },
            required: ['client_name', 'client_need'],
          },
        },
        generar_reporte_metricas_excel: {
          name: 'generar_reporte_metricas_excel',
          description: 'Genera un reporte Excel con métricas del período. Contenido depende del rol del empleado.',
          input_schema: {
            type: 'object' as const,
            properties: {
              window_days: { type: 'number', enum: [7, 30], description: 'Ventana en días. 7 o 30. Default 7.' },
            },
            required: [],
          },
        },
      };

      for (const [toolName, allowed] of Object.entries(MEERKAT_TOOL_ACCESS)) {
        if (inboxMeerkatId && (allowed as string[]).includes(inboxMeerkatId) && CREATIVITY_DECLARATIONS[toolName]) {
          tools.push(CREATIVITY_DECLARATIONS[toolName]);
        }
      }
    }

    const execCtx = {
      agentId,
      portalEmail,
      agentName,
      businessName,
      portalToken,
      agent:          (agentRow ?? { id: agentId, agent_name: agentName, business_name: businessName }) as Record<string, unknown>,
      supabase,
      userContext:    effectiveBody.slice(0, 500),
      readUrlCount:   { value: 0 } as ReadUrlCounter,
      channel:        'email' as const,
      // Reserva id: si es fresh, es el UUID pre-generado (que se usará al INSERT
      // después del LLM); si es resume, es el existingInboxId real.
      sourceInboxId:  reservedInboxId,
    };

    const messages: Anthropic.MessageParam[] = [{ role: 'user', content: userPrompt }];

    try {
      let lastText = '{}';
      const MAX_ITER = 6;

      for (let i = 0; i < MAX_ITER; i++) {
        const isLastIter = i === MAX_ITER - 1;

        // Charge 1 op per iteration after the first (first was charged above)
        if (i > 0) {
          const midOps = await consumeAiOp(agentId, 1, { source: 'inbox_processor', label: 'Procesamiento de bandeja (correo/tarea)' });
          if (!midOps.ok) break;
        }

        const __ipT = Date.now();
        const __ipM = 'claude-haiku-4-5-20251001';
        let response;
        try {
          response = await anthropic.messages.create({
            model:      __ipM,
            max_tokens: 2048,
            system: [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }],
            messages,
            ...(tools.length && !isLastIter ? { tools } : {}),
          });
          void logLlmCall({ source: 'inbox_processor', model: __ipM, usage: response.usage, agentId, portalEmail, latencyMs: Date.now() - __ipT, meta: { iter: i } });
        } catch (err) {
          void logLlmCall({ source: 'inbox_processor', model: __ipM, usage: { input_tokens: 0, output_tokens: 0 }, agentId, portalEmail, latencyMs: Date.now() - __ipT, error: err instanceof Error ? err.message : String(err), meta: { iter: i } });
          throw err;
        }

        const textBlock = response.content.find(b => b.type === 'text');
        if (textBlock?.type === 'text') lastText = textBlock.text.trim();

        if (response.stop_reason !== 'tool_use') break;

        // Execute tools via shared executor — fan-out paralelo cuando hay múltiples
        // tools en la misma respuesta. Un fallo aislado no rompe el batch.
        const toolResults: Anthropic.ToolResultBlockParam[] = [];
        const toolBlocks = response.content.filter(
          (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use',
        );
        const parallel = await Promise.allSettled(
          toolBlocks.map(b => executeAgentTool(b.name, b.input as Record<string, unknown>, execCtx)),
        );
        for (let ti = 0; ti < toolBlocks.length; ti++) {
          const b = toolBlocks[ti];
          const r = parallel[ti];
          const output: unknown = r.status === 'fulfilled' ? r.value : { ok: false, error: String(r.reason) };
          const okShape = output && typeof output === 'object' && (output as { ok?: unknown }).ok !== false;
          if (okShape) toolsInvokedOk.push(b.name);
          toolResults.push({ type: 'tool_result', tool_use_id: b.id, content: JSON.stringify(output) });
        }

        messages.push({ role: 'assistant', content: response.content });
        messages.push({ role: 'user',      content: toolResults });
      }

      // Haiku sometimes wraps JSON in ```json ... ``` markdown fences pese al
      // prompt. Extraer el objeto JSON con regex es tolerante a wrappers.
      const jsonMatch = lastText.match(/\{[\s\S]*\}/);
      const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : {};
      result = validateProcessedEmail(parsed);
    } catch (err) {
      console.error('[ops/inbox-processor] AI error:', err);
    }
  } else if (opsResult.ok) {
    // No portalEmail — run a simple single-shot analysis without tools
    const __npT = Date.now();
    const __npM = 'claude-haiku-4-5-20251001';
    try {
      const response = await anthropic.messages.create({
        model:      __npM,
        max_tokens: 1024,
        system: [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }],
        messages:   [{ role: 'user', content: userPrompt }],
      });
      void logLlmCall({ source: 'inbox_processor_noportal', model: __npM, usage: response.usage, agentId, latencyMs: Date.now() - __npT });
      const textBlock = response.content.find(b => b.type === 'text');
      const rawText = textBlock?.type === 'text' ? textBlock.text.trim() : '';
      const jsonMatch = rawText.match(/\{[\s\S]*\}/);
      const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : {};
      result = validateProcessedEmail(parsed);
    } catch (err) {
      void logLlmCall({ source: 'inbox_processor_noportal', model: __npM, usage: { input_tokens: 0, output_tokens: 0 }, agentId, latencyMs: Date.now() - __npT, error: err instanceof Error ? err.message : String(err) });
      console.error('[ops/inbox-processor] AI error (no portalEmail):', err);
    }
  }

  // Determine source_folder for tracking
  const finalSourceFolder = fromSpamFolder
    ? (result.category === 'spam' ? 'spam_confirmed' : 'spam_rescued')
    : 'inbox';

  // Determine final status and what to store in ai_draft
  let finalStatus: string;
  let finalDraft: string | null;
  let autoModeVerdict: AutoModeVerdict | null = null;

  if (result.category === 'spam') {
    finalStatus = 'skipped';
    finalDraft  = null;
  } else if (result.needsInfo && result.requestToSender) {
    finalStatus = 'info_requested';
    finalDraft  = result.requestToSender;
  } else if (result.needsInfo) {
    // Model emitió needs_info=true sin request_to_sender. Significa que quería
    // escalar al equipo interno pero no usó la tool pedir_a_humano. Caer a
    // pending (visible en bandeja) en vez de silent drop.
    console.warn('[inbox-processor] needsInfo=true sin requestToSender, fallback a pending. info_needed:', result.infoNeeded);
    finalStatus = 'pending';
    finalDraft  = result.draft;
  } else if (!result.draft) {
    finalStatus = 'pending';
    finalDraft  = null;
  } else if (autoMode === 'always' && sendReplyFn) {
    // Bright-line: always bypasses classifier
    // L3 — evidence check antes de auto-enviar: si el draft claims acciones sin tool → pending.
    const { verifyGoalResponse } = await import('@/lib/tools/goal-verifier');
    const check = await verifyGoalResponse({
      userIntent:    effectiveBody,
      agentResponse: result.draft ?? '',
      toolsInvoked:  toolsInvokedOk,
    });
    if (!check.met) {
      console.warn('[inbox-processor] auto_replied bloqueado por verifier:', check.concern);
      finalStatus = 'pending';
    } else {
      finalStatus = 'auto_replied';
    }
    finalDraft  = result.draft;
  } else if (autoMode === 'auto' && sendReplyFn) {
    autoModeVerdict = await classifyEmailDraft({
      draft:           result.draft,
      emailFrom,
      emailSubject,
      emailBody:       effectiveBody,
      category:        result.category,
      agentName,
      businessName,
      businessContext: knowledgeBase,
      agentRole,
    });

    if (autoModeVerdict.decision === 'send') {
      // L3 — evidence check antes del auto-send del classifier
      const { verifyGoalResponse } = await import('@/lib/tools/goal-verifier');
      const check = await verifyGoalResponse({
        userIntent:    effectiveBody,
        agentResponse: result.draft ?? '',
        toolsInvoked:  toolsInvokedOk,
      });
      if (!check.met) {
        console.warn('[inbox-processor] auto_replied (auto-mode) bloqueado por verifier:', check.concern);
        finalStatus = 'pending';
      } else {
        finalStatus = 'auto_replied';
      }
      finalDraft  = result.draft;
    } else if (autoModeVerdict.decision === 'block') {
      finalStatus = 'pending';
      finalDraft  = result.draft;
    } else {
      // decision === 'human' — includes classifier_error signals (fail-closed)
      finalStatus = 'pending';
      finalDraft  = result.draft;
    }
  } else {
    // autoMode === 'off' or no sendReplyFn
    finalStatus = 'pending';
    finalDraft  = result.draft;
  }

  type InboxItem = { id: string; approval_token: string };
  let item: InboxItem | null = null;

  if (existingInboxId) {
    // Thread reply: update the existing info_requested record.
    // Un thread_reply representa una transición: info_requested → pending/auto_replied/etc.
    const targetStatus = (finalStatus === 'info_requested' ? 'pending' : finalStatus) as InboxStatus;
    await transitionInboxItem({
      supabase, inboxId: existingInboxId,
      toStatus: targetStatus,
      actor:    'thread_resume',
      reason:   'customer_replied_to_info_request',
      metadata: {
        category:           result.category,
        auto_mode_decision: autoModeVerdict?.decision ?? null,
        original_final_status: finalStatus,
      },
      extraFields: {
        email_body:          effectiveBody.slice(0, EMAIL_BODY_TRUNCATE_CHARS),
        ai_summary:          result.summary,
        ai_draft:            finalDraft,
        invoice_data:        result.invoiceData,
        invoice_valid:       result.invoiceValid,
        invoice_discrepancy: result.invoiceDiscrepancy,
        auto_mode_decision:  autoModeVerdict?.decision ?? null,
        auto_mode_reason:    autoModeVerdict?.reason ?? null,
        auto_mode_signals:   autoModeVerdict?.signals ?? [],
      },
      soft: true, // permitir transiciones desde estados terminales para no romper flujo legacy
    });
    const { data } = await supabase.from('ops_inbox').select('id, approval_token').eq('id', existingInboxId).single();
    item = data as unknown as InboxItem | null;
  } else {
    const { data } = await supabase
      .from('ops_inbox')
      .insert({
        id:                  reservedInboxId, // pre-generado para que pedir_a_humano lo referencie
        agent_id:            agentId,
        source,
        raw_message_id:      rawMessageId ?? null,
        thread_id:           threadId ?? null,
        email_from:          emailFrom,
        email_subject:       emailSubject,
        email_body:          effectiveBody.slice(0, EMAIL_BODY_TRUNCATE_CHARS),
        attachments,
        category:            result.category,
        ai_summary:          result.summary,
        ai_draft:            finalDraft,
        item_type:           looksLikeInvoice ? 'invoice' : 'email',
        invoice_data:        result.invoiceData,
        invoice_valid:       result.invoiceValid,
        invoice_discrepancy: result.invoiceDiscrepancy,
        status:              finalStatus,
        source_folder:       finalSourceFolder,
        auto_mode_decision:  autoModeVerdict?.decision ?? null,
        auto_mode_reason:    autoModeVerdict?.reason ?? null,
        auto_mode_signals:   autoModeVerdict?.signals ?? [],
        ...dispatcherCols,
      })
      .select('id, approval_token')
      .single();
    item = data as unknown as InboxItem | null;

    // Registrar el estado inicial en el historial de transitions
    if (item?.id) {
      await recordInboxCreation({
        supabase,
        inboxId:       item.id,
        initialStatus: finalStatus as InboxStatus,
        actor:         'inbox_processor',
        reason:        finalStatus === 'auto_replied'
          ? 'classifier_send_approved'
          : finalStatus === 'info_requested'
            ? 'needs_more_info_from_sender'
            : finalStatus === 'skipped'
              ? 'spam_detected'
              : 'needs_human_review',
        metadata: {
          category:           result.category,
          source_folder:      finalSourceFolder,
          auto_mode_decision: autoModeVerdict?.decision ?? null,
          auto_mode_signals:  autoModeVerdict?.signals ?? [],
        },
      });
    }
  }

  // Best-effort: unmark spam in provider after INSERT so we don't block on failure
  if (fromSpamFolder && finalSourceFolder === 'spam_rescued' && rawMessageId && unmarkSpamFn) {
    unmarkSpamFn(rawMessageId).catch(err =>
      console.error('[inbox-processor] unmarkSpam failed for', rawMessageId, err)
    );
  }

  if (!item || finalStatus === 'skipped') return;

  const baseUrl   = process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.centinelia.mx';
  const portalUrl = `${baseUrl}/portal/${portalToken}/oficina/bandeja`;
  const notifyTo  = approvalEmail || ownerEmail;

  if (finalStatus === 'info_requested' && result.requestToSender && sendReplyFn) {
    try {
      await sendReplyFn(result.requestToSender);
      if (item?.id) {
        await supabase.from('ops_inbox').update({ sent_at: new Date().toISOString() }).eq('id', item.id);
      }
    } catch (err) {
      console.error('[ops/inbox-processor] info_requested send failed:', err);
    }

  } else if (finalStatus === 'auto_replied' && result.draft && sendReplyFn && item) {
    try {
      await sendReplyFn(result.draft);
      await supabase.from('ops_inbox').update({ sent_at: new Date().toISOString() }).eq('id', item.id);
    } catch (err) {
      console.error('[ops/inbox-processor] auto_reply send failed:', err);
      // Degrade to pending so a human sees it
      await supabase
        .from('ops_inbox')
        .update({
          status:            'pending',
          auto_mode_signals: [...(autoModeVerdict?.signals ?? []), 'send_failed'],
        })
        .eq('id', item.id);

      // Fallback: send approval email
      const approveUrl = `${baseUrl}/api/ops/approve/${item.approval_token}`;
      const rejectUrl  = `${baseUrl}/api/ops/reject/${item.approval_token}`;
      const html = approvalEmailHtml({
        businessName,
        emailFrom,
        emailSubject,
        category:           result.category,
        categoryLabel:      CATEGORY_LABELS[result.category] ?? result.category,
        summary:            result.summary,
        draft:              result.draft,
        itemType:           looksLikeInvoice ? 'invoice' : 'email',
        invoiceData:        result.invoiceData,
        invoiceValid:       result.invoiceValid,
        invoiceDiscrepancy: result.invoiceDiscrepancy,
        approveUrl,
        rejectUrl,
        portalUrl,
        attachmentCount:    attachments.length,
      });
      await sendEmail({
        to:      notifyTo,
        subject: `[${CATEGORY_LABELS[result.category] ?? 'Email'}] ${emailSubject || '(sin asunto)'} - envío falló, requiere aprobación`,
        html,
      });
    }

  } else if (finalStatus === 'pending') {
    const approveUrl = `${baseUrl}/api/ops/approve/${item.approval_token}`;
    const rejectUrl  = `${baseUrl}/api/ops/reject/${item.approval_token}`;
    const html = approvalEmailHtml({
      businessName,
      emailFrom,
      emailSubject,
      category:           result.category,
      categoryLabel:      CATEGORY_LABELS[result.category] ?? result.category,
      summary:            result.summary,
      draft:              result.draft,
      itemType:           looksLikeInvoice ? 'invoice' : 'email',
      invoiceData:        result.invoiceData,
      invoiceValid:       result.invoiceValid,
      invoiceDiscrepancy: result.invoiceDiscrepancy,
      approveUrl,
      rejectUrl,
      portalUrl,
      attachmentCount:    attachments.length,
    });
    await sendEmail({
      to:      notifyTo,
      subject: `[${CATEGORY_LABELS[result.category] ?? 'Email'}] ${emailSubject || '(sin asunto)'} — aprobación pendiente`,
      html,
    });
  }
}
