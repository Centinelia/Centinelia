/**
 * H2 — Registry único de tools para admin discoverability.
 *
 * Fuente derivada estáticamente: enumeramos las tools conocidas del executor
 * y las anotamos con capability (policies) + policy (retry/timeout). Los canales
 * donde vive cada tool se declaran aquí porque la fuente real está esparcida
 * entre buildTools() (voz), ALL_TOOLS (chat) y BASE_EMAIL_TOOLS (email).
 *
 * Regla: cuando agregues un tool nuevo al executor, añádelo también aquí para
 * que aparezca en /admin/tools.
 */
import { TOOL_CAPABILITIES } from '@/lib/policies/engine';
import { policyFor, DEFAULT_POLICY, type ToolPolicy } from './policies';

export type Channel = 'voice' | 'chat' | 'email';

export interface ToolEntry {
  name:         string;
  description:  string;
  channels:     Channel[];
  category:     string;
  capability:   string | null;
  policy:       ToolPolicy;
  destructive:  boolean;
  gatedByRole:  string[] | null;   // meerkats donde vive (null = todos)
  gatedByFeature: string | null;   // feature flag
}

const A: Channel[] = ['voice', 'chat', 'email'];

export const TOOL_REGISTRY: ToolEntry[] = [
  // read/search
  { name: 'read_url',                 description: 'Lee el contenido de una URL pública',                  channels: A, category: 'web',       destructive: false, gatedByRole: null, gatedByFeature: null,      capability: null, policy: policyFor('read_url') },
  { name: 'buscar_en_web',            description: 'Búsqueda web general (Brave Search)',                   channels: A, category: 'web',       destructive: false, gatedByRole: null, gatedByFeature: null,      capability: null, policy: policyFor('buscar_en_web') },
  { name: 'search_leads',             description: 'Búsqueda estructurada de leads/empresas',               channels: A, category: 'web',       destructive: false, gatedByRole: ['niva'], gatedByFeature: null,  capability: null, policy: policyFor('search_leads') },
  { name: 'search_files',             description: 'Busca archivos en Drive del negocio',                   channels: A, category: 'drive',     destructive: false, gatedByRole: null, gatedByFeature: null,      capability: 'files', policy: policyFor('search_files') },
  { name: 'read_file',                description: 'Lee contenido de archivo del Drive',                    channels: A, category: 'drive',     destructive: false, gatedByRole: null, gatedByFeature: null,      capability: 'files', policy: policyFor('read_file') },

  // destructive
  { name: 'send_email',               description: 'Envía correo directo (verifier antes de send)',         channels: A, category: 'comms',     destructive: true,  gatedByRole: null, gatedByFeature: null,      capability: 'email', policy: policyFor('send_email') },
  { name: 'trigger_outbound_call',    description: 'Dispara llamada saliente (verifier antes)',             channels: A, category: 'comms',     destructive: true,  gatedByRole: null, gatedByFeature: 'outbound_calls', capability: 'phone', policy: policyFor('trigger_outbound_call') },

  // documents
  { name: 'create_document',          description: 'Genera PDF (factura, orden, cotización, general)',      channels: A, category: 'docs',      destructive: false, gatedByRole: null, gatedByFeature: null,      capability: null, policy: policyFor('create_document') },
  { name: 'create_file',              description: 'Genera archivo Excel/Word/PowerPoint',                  channels: A, category: 'docs',      destructive: false, gatedByRole: ['nox','niva'], gatedByFeature: null, capability: null, policy: policyFor('create_file') },
  { name: 'create_contract_draft',    description: 'Crea borrador de contrato',                             channels: A, category: 'docs',      destructive: true,  gatedByRole: ['nox'], gatedByFeature: 'contract_drafts', capability: null, policy: policyFor('create_contract_draft') },

  // drive
  { name: 'save_to_drive',            description: 'Sube archivo local al Drive del negocio',               channels: A, category: 'drive',     destructive: false, gatedByRole: ['nox','niva'], gatedByFeature: null, capability: 'files', policy: policyFor('save_to_drive') },
  { name: 'organize_files',           description: 'Renombra, mueve o crea carpetas en Drive',              channels: A, category: 'drive',     destructive: true,  gatedByRole: ['nox'], gatedByFeature: null,   capability: 'files', policy: policyFor('organize_files') },

  // calendar
  { name: 'list_calendar_events',     description: 'Lista eventos del calendario',                          channels: A, category: 'calendar',  destructive: false, gatedByRole: null, gatedByFeature: null,      capability: null, policy: policyFor('list_calendar_events') },
  { name: 'create_calendar_event',    description: 'Crea evento en calendario',                             channels: A, category: 'calendar',  destructive: false, gatedByRole: null, gatedByFeature: null,      capability: null, policy: policyFor('create_calendar_event') },
  { name: 'delete_calendar_event',    description: 'Elimina evento del calendario',                         channels: A, category: 'calendar',  destructive: true,  gatedByRole: null, gatedByFeature: null,      capability: null, policy: policyFor('delete_calendar_event') },

  // civic
  { name: 'create_civic_report',      description: 'Reporte cívico municipal',                              channels: A, category: 'gobierno',  destructive: false, gatedByRole: ['nara'], gatedByFeature: 'civic_reports', capability: null, policy: policyFor('create_civic_report') },
  { name: 'lookup_civic_report',      description: 'Consulta reporte cívico por folio',                     channels: A, category: 'gobierno',  destructive: false, gatedByRole: ['nara'], gatedByFeature: 'civic_reports', capability: null, policy: policyFor('lookup_civic_report') },
  { name: 'update_civic_report',      description: 'Actualiza estado de reporte cívico',                    channels: A, category: 'gobierno',  destructive: false, gatedByRole: ['nara'], gatedByFeature: 'civic_reports', capability: null, policy: policyFor('update_civic_report') },

  // QB
  { name: 'qb_consultar_facturas',    description: 'Consulta facturas en QuickBooks',                       channels: A, category: 'quickbooks', destructive: false, gatedByRole: null, gatedByFeature: null,     capability: null, policy: policyFor('qb_consultar_facturas') },
  { name: 'qb_buscar_cliente',        description: 'Busca cliente en QuickBooks',                           channels: A, category: 'quickbooks', destructive: false, gatedByRole: null, gatedByFeature: null,     capability: null, policy: policyFor('qb_buscar_cliente') },
  { name: 'qb_crear_factura',         description: 'Crea factura en QuickBooks (destructiva, 1 op)',        channels: A, category: 'quickbooks', destructive: true,  gatedByRole: null, gatedByFeature: null,     capability: null, policy: policyFor('qb_crear_factura') },

  // fiscal
  { name: 'solicitar_factura',        description: 'Registra solicitud de CFDI al equipo humano',           channels: A, category: 'fiscal',    destructive: true,  gatedByRole: null, gatedByFeature: null,      capability: null, policy: policyFor('solicitar_factura') },
  { name: 'consultar_factura',        description: 'Consulta estado de solicitud de CFDI',                  channels: A, category: 'fiscal',    destructive: false, gatedByRole: null, gatedByFeature: null,      capability: null, policy: policyFor('consultar_factura') },

  // productos / ML
  { name: 'buscar_producto',          description: 'Busca producto en catálogo Notion',                     channels: A, category: 'catalog',   destructive: false, gatedByRole: null, gatedByFeature: null,      capability: null, policy: policyFor('buscar_producto') },
  { name: 'analizar_publicaciones_ml',description: 'Lista publicaciones Mercado Libre (solo chat)',         channels: ['chat'], category: 'mercadolibre', destructive: false, gatedByRole: ['niva'], gatedByFeature: null, capability: null, policy: policyFor('analizar_publicaciones_ml') },
  { name: 'ver_metricas_ml',          description: 'Métricas Mercado Libre (solo chat)',                    channels: ['chat'], category: 'mercadolibre', destructive: false, gatedByRole: ['niva'], gatedByFeature: null, capability: null, policy: policyFor('ver_metricas_ml') },

  // meta
  { name: 'delegate_task',            description: 'Delega tarea a otro empleado (loop on evidence)',       channels: A, category: 'meta',      destructive: false, gatedByRole: null, gatedByFeature: null,      capability: null, policy: policyFor('delegate_task') },
  { name: 'consult_agent',            description: 'Consulta síncrona a otro empleado',                     channels: A, category: 'meta',      destructive: false, gatedByRole: null, gatedByFeature: null,      capability: null, policy: policyFor('consult_agent') },
  { name: 'reportar_falla',           description: 'Reporta bug al equipo Centinelia',                      channels: A, category: 'meta',      destructive: false, gatedByRole: null, gatedByFeature: null,      capability: null, policy: DEFAULT_POLICY },

  // nash (interno) — solo se expone al meerkat interno Nash
  { name: 'revisar_incidentes_plataforma', description: 'Nash: lee las 5 fuentes de incidentes (bug_reports, llm_call_log errores, ops_inbox escalado stale, handoff_failed_responses, agent_tasks failed) con dedupe contra platform_incidents', channels: ['chat', 'email'], category: 'nash', destructive: false, gatedByRole: ['nash'], gatedByFeature: 'nash_passive_discovery', capability: null, policy: DEFAULT_POLICY },
  { name: 'crear_incidente',               description: 'Nash: crea fila en platform_incidents con dedupe por (source, source_id)',                                             channels: ['chat', 'email'], category: 'nash', destructive: false, gatedByRole: ['nash'], gatedByFeature: null,                       capability: null, policy: DEFAULT_POLICY },
  { name: 'responder_cliente_afectado',    description: 'Nash: envía WhatsApp o email al cliente afectado por un incidente',                                                    channels: ['chat', 'email'], category: 'nash', destructive: true,  gatedByRole: ['nash'], gatedByFeature: null,                       capability: null, policy: DEFAULT_POLICY },
  { name: 'enviar_a_claude_code',          description: 'Nash: crea GitHub issue con el prompt (NASH_GITHUB_TOKEN). Fallback email cuando el token falta',                       channels: ['chat', 'email'], category: 'nash', destructive: true,  gatedByRole: ['nash'], gatedByFeature: null,                       capability: null, policy: DEFAULT_POLICY },
  { name: 'escalar_al_owner',              description: 'Nash: WhatsApp a OWNER_WHATSAPP (fallback email hola@) marcando incidente como assigned_to=owner',                     channels: ['chat', 'email'], category: 'nash', destructive: true,  gatedByRole: ['nash'], gatedByFeature: null,                       capability: null, policy: DEFAULT_POLICY },
  { name: 'verificar_fix',                 description: 'Nash: re-check de la señal fuente. Si desapareció → status=resolved, si no → awaiting_verification',                   channels: ['chat', 'email'], category: 'nash', destructive: false, gatedByRole: ['nash'], gatedByFeature: null,                       capability: null, policy: DEFAULT_POLICY },
  { name: 'consultar_billing_org',         description: 'Nash: estado billing real de una org (minutos/tareas usados y disponibles, ciclo, modelo, ledger flag). Fuente de verdad para responder al owner sin alucinar cifras.', channels: ['chat', 'email'], category: 'nash', destructive: false, gatedByRole: ['nash'], gatedByFeature: null,                       capability: null, policy: DEFAULT_POLICY },

  // brand / voc
  { name: 'extraer_tono_de_marca',    description: 'Extrae guía de tono desde muestras',                    channels: A, category: 'brand',     destructive: false, gatedByRole: null, gatedByFeature: null,      capability: null, policy: DEFAULT_POLICY },
  { name: 'extraer_voz_del_cliente',  description: 'VoC desde llamadas/correos/tickets',                    channels: A, category: 'brand',     destructive: false, gatedByRole: null, gatedByFeature: null,      capability: null, policy: DEFAULT_POLICY },

  // sheets
  { name: 'sheets_agregar_fila',      description: 'Agrega fila al Google Sheet configurado para el propósito',    channels: ['chat', 'email', 'voice'], category: 'sheets', destructive: false, gatedByRole: null, gatedByFeature: 'google_sheets', capability: 'sheets.write', policy: policyFor('sheets_agregar_fila') },
  { name: 'sheets_actualizar_fila',   description: 'Actualiza fila existente en el Google Sheet',                  channels: ['chat', 'email', 'voice'], category: 'sheets', destructive: false, gatedByRole: null, gatedByFeature: 'google_sheets', capability: 'sheets.write', policy: policyFor('sheets_actualizar_fila') },
  { name: 'sheets_leer',              description: 'Lee el contenido del Google Sheet configurado',                 channels: ['chat', 'email', 'voice'], category: 'sheets', destructive: false, gatedByRole: null, gatedByFeature: 'google_sheets', capability: 'sheets.read',  policy: policyFor('sheets_leer') },
  { name: 'sheets_buscar',            description: 'Busca filas en el Google Sheet que contengan un texto',        channels: ['chat', 'email', 'voice'], category: 'sheets', destructive: false, gatedByRole: null, gatedByFeature: 'google_sheets', capability: 'sheets.read',  policy: policyFor('sheets_buscar') },

  // ─── F8 batch: 35+ tools funcionales pero sin declaración en registry ────
  // Ver Scope B Agent 1 sección 4. Sin estas entries, /admin/tools no las
  // descubre, auditRegistry() no gobierna, policy engine no aplica retry.

  // QB adicionales
  { name: 'qb_registrar_pago',        description: 'Registra pago en QuickBooks (destructivo, 1 op)',              channels: A, category: 'quickbooks', destructive: true,  gatedByRole: null, gatedByFeature: null,      capability: null, policy: DEFAULT_POLICY },
  { name: 'qb_reporte_ingresos',      description: 'Reporte de ingresos/gastos/AR de QuickBooks por período',      channels: A, category: 'quickbooks', destructive: false, gatedByRole: null, gatedByFeature: null,      capability: null, policy: DEFAULT_POLICY },

  // office docs (reutilización de docs previos)
  { name: 'buscar_documento_oficina', description: 'Busca documentos generados previamente en Oficina',            channels: A, category: 'docs',      destructive: false, gatedByRole: null, gatedByFeature: null,      capability: null, policy: DEFAULT_POLICY },
  { name: 'enviar_documento_oficina', description: 'Reenvía un documento existente de Oficina como adjunto',       channels: A, category: 'docs',      destructive: true,  gatedByRole: null, gatedByFeature: null,      capability: 'email', policy: DEFAULT_POLICY },

  // CRM / data capture
  { name: 'crear_lead',               description: 'Registra un lead con nombre/telefono/interés',                 channels: A, category: 'crm',       destructive: false, gatedByRole: null, gatedByFeature: null,      capability: null, policy: DEFAULT_POLICY },
  { name: 'crear_contacto_saliente',  description: 'Crea contacto en outbound_contacts para campañas',             channels: A, category: 'crm',       destructive: false, gatedByRole: null, gatedByFeature: 'outbound_calls', capability: null, policy: DEFAULT_POLICY },
  { name: 'agendar_cita',             description: 'Registra cita en la agenda del negocio',                       channels: A, category: 'crm',       destructive: false, gatedByRole: null, gatedByFeature: null,      capability: null, policy: DEFAULT_POLICY },
  { name: 'registrar_pedido',         description: 'Registra pedido de cliente (producto, cantidad, entrega)',     channels: A, category: 'crm',       destructive: false, gatedByRole: null, gatedByFeature: null,      capability: null, policy: DEFAULT_POLICY },
  { name: 'buscar_cliente',           description: 'Busca cliente existente por nombre/telefono',                  channels: A, category: 'crm',       destructive: false, gatedByRole: null, gatedByFeature: null,      capability: null, policy: DEFAULT_POLICY },
  { name: 'buscar_correo_enviado',    description: 'Busca correos enviados previamente para dar seguimiento',      channels: A, category: 'crm',       destructive: false, gatedByRole: null, gatedByFeature: null,      capability: 'email', policy: DEFAULT_POLICY },
  { name: 'agregar_tag_contacto',     description: 'Agrega tag a contacto para segmentación de campañas',          channels: A, category: 'crm',       destructive: false, gatedByRole: null, gatedByFeature: null,      capability: null, policy: DEFAULT_POLICY },
  { name: 'marcar_no_llamar',         description: 'Marca teléfono como "no volver a llamar" (regulatorio LFPDPPP)', channels: ['voice', 'email'], category: 'crm',    destructive: true,  gatedByRole: null, gatedByFeature: null,      capability: null, policy: DEFAULT_POLICY },

  // helpdesk IT
  { name: 'crear_ticket',             description: 'Crea ticket de soporte IT con categoría y prioridad',          channels: A, category: 'helpdesk',  destructive: false, gatedByRole: ['neo'], gatedByFeature: null,   capability: null, policy: DEFAULT_POLICY },
  { name: 'consultar_incidentes',     description: 'Consulta incidentes activos por tema',                         channels: A, category: 'helpdesk',  destructive: false, gatedByRole: ['neo'], gatedByFeature: null,   capability: null, policy: DEFAULT_POLICY },
  { name: 'buscar_directorio',        description: 'Busca en directorio interno quién atiende un problema',        channels: A, category: 'helpdesk',  destructive: false, gatedByRole: null,  gatedByFeature: null,     capability: null, policy: DEFAULT_POLICY },
  { name: 'iniciar_onboarding',       description: 'Dispara onboarding con correo de bienvenida',                  channels: A, category: 'helpdesk',  destructive: true,  gatedByRole: ['naia'], gatedByFeature: null,  capability: 'email', policy: DEFAULT_POLICY },

  // voice-only (transferencias telefónicas y encuestas en llamada)
  { name: 'notificar_transferencia',  description: 'Voice-only: notifica al destinatario antes de transferir',    channels: ['voice'], category: 'voice',   destructive: false, gatedByRole: null, gatedByFeature: null,   capability: null, policy: DEFAULT_POLICY },
  { name: 'transferir_llamada',       description: 'Voice-only: transfiere llamada a número/agente',              channels: ['voice'], category: 'voice',   destructive: true,  gatedByRole: null, gatedByFeature: null,   capability: null, policy: DEFAULT_POLICY },
  { name: 'registrar_encuesta',       description: 'Voice-only: registra respuestas de encuesta telefónica',      channels: ['voice'], category: 'voice',   destructive: false, gatedByRole: null, gatedByFeature: null,   capability: null, policy: DEFAULT_POLICY },

  // director / niva (finanzas + desempeño)
  { name: 'revisar_desempeno_equipo', description: 'Reporte de desempeño del equipo (director)',                   channels: A, category: 'finanzas',  destructive: false, gatedByRole: ['niva'], gatedByFeature: null,  capability: null, policy: DEFAULT_POLICY },
  { name: 'aprobar_gasto',            description: 'Registra aprobación/rechazo de gasto operativo (director, audit)', channels: A, category: 'finanzas', destructive: true,  gatedByRole: ['niva'], gatedByFeature: null,  capability: null, policy: DEFAULT_POLICY },
  { name: 'evaluar_limite_gasto',     description: 'Verifica si un gasto cabe en el presupuesto mensual',          channels: A, category: 'finanzas',  destructive: false, gatedByRole: ['niva'], gatedByFeature: null,  capability: null, policy: DEFAULT_POLICY },
  { name: 'verificar_gasto_recurrente', description: 'Consulta historial de proveedor para auto-approve facturas', channels: A, category: 'finanzas',  destructive: false, gatedByRole: null, gatedByFeature: null,      capability: null, policy: DEFAULT_POLICY },

  // Nox coordinator (non-voice)
  { name: 'preparar_brief_del_dia',   description: 'Nox: brief diario del owner (acción hoy / preparación / al tanto)', channels: ['chat', 'email'], category: 'meta', destructive: false, gatedByRole: ['nox'], gatedByFeature: null, capability: null, policy: DEFAULT_POLICY },

  // Pilar 2 creativity (docs generados con LLM, cobran 3-6 ops)
  { name: 'generar_propuesta_comercial',    description: 'Genera propuesta comercial PDF (5 ops)',                  channels: A, category: 'creatividad', destructive: false, gatedByRole: ['nox','niva','noah'], gatedByFeature: null, capability: null, policy: DEFAULT_POLICY },
  { name: 'generar_cotizacion',             description: 'Genera cotización PDF con precios (4 ops)',              channels: A, category: 'creatividad', destructive: false, gatedByRole: ['nox','niva','noah','nico'], gatedByFeature: null, capability: null, policy: DEFAULT_POLICY },
  { name: 'generar_one_pager',              description: 'Genera one-pager informativo PDF (3 ops)',                channels: A, category: 'creatividad', destructive: false, gatedByRole: ['nox','niva','noah','nelia'], gatedByFeature: null, capability: null, policy: DEFAULT_POLICY },
  { name: 'generar_correo_estructurado',    description: 'Borrador de correo largo estructurado (2 ops)',           channels: A, category: 'creatividad', destructive: false, gatedByRole: null, gatedByFeature: null,      capability: null, policy: DEFAULT_POLICY },
  { name: 'generar_pitch_deck',             description: 'Pitch deck PowerPoint 8-10 slides (6 ops)',               channels: A, category: 'creatividad', destructive: false, gatedByRole: ['nox','niva','noah'], gatedByFeature: null, capability: null, policy: DEFAULT_POLICY },
  { name: 'generar_reporte_metricas_excel', description: 'Reporte Excel de métricas del período (4 ops)',           channels: A, category: 'creatividad', destructive: false, gatedByRole: ['nox','niva','noah','nara','nelia'], gatedByFeature: null, capability: null, policy: DEFAULT_POLICY },

  // ML publicaciones (registro real de operación — voice + chat, email intencionalmente ausente)
  { name: 'crear_publicacion_ml',           description: 'Crea publicación en Mercado Libre (voice+chat)',          channels: ['voice', 'chat'], category: 'mercadolibre', destructive: true, gatedByRole: ['noah'], gatedByFeature: null, capability: null, policy: DEFAULT_POLICY },
  { name: 'actualizar_publicacion_ml',      description: 'Actualiza publicación en Mercado Libre (voice+chat)',     channels: ['voice', 'chat'], category: 'mercadolibre', destructive: true, gatedByRole: ['noah'], gatedByFeature: null, capability: null, policy: DEFAULT_POLICY },

  // meta / escalación
  { name: 'pedir_a_humano',           description: 'Escala a humano (info/action/approval) con audit en human_requests', channels: A, category: 'meta', destructive: false, gatedByRole: null, gatedByFeature: null, capability: null, policy: DEFAULT_POLICY },

  // trámites externos (piloto MTY, voice-only)
  { name: 'consultar_catalogo_externo', description: 'Voice-only: consulta catálogo de trámites municipal',        channels: ['voice'], category: 'tramites', destructive: false, gatedByRole: ['nara'], gatedByFeature: 'external_tramites', capability: null, policy: DEFAULT_POLICY },
  { name: 'buscar_en_padron_externo',   description: 'Voice-only: busca ciudadano en padrón municipal',            channels: ['voice'], category: 'tramites', destructive: false, gatedByRole: ['nara'], gatedByFeature: 'external_tramites', capability: null, policy: DEFAULT_POLICY },
  { name: 'enviar_tramite_externo',     description: 'Voice-only: envía trámite al backend municipal (destructivo)', channels: ['voice'], category: 'tramites', destructive: true,  gatedByRole: ['nara'], gatedByFeature: 'external_tramites', capability: null, policy: DEFAULT_POLICY },
];

export function getToolByName(name: string): ToolEntry | undefined {
  return TOOL_REGISTRY.find(t => t.name === name);
}

/** Sanity check contra el mapa TOOL_CAPABILITIES para detectar drift. */
export function auditRegistry(): { missing: string[]; extra: string[] } {
  const registryCaps = new Map(TOOL_REGISTRY.map(t => [t.name, t.capability]));
  const missing: string[] = [];
  const extra:   string[] = [];
  for (const [name, cap] of Object.entries(TOOL_CAPABILITIES)) {
    const r = registryCaps.get(name);
    if (r === undefined) missing.push(name);
    else if (r !== cap) extra.push(`${name}: cap='${r}' vs policies='${cap}'`);
  }
  return { missing, extra };
}
