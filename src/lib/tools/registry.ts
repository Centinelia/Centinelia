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
import { TOOL_TO_PACK } from './packs';

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
  gatedByFeature: string | null;   // DEPRECATED — usar pack. Se removerá en Fase 2.
  pack:         string | null;     // ID del pack en SKILL_PACKS, o null si tool no pertenece a pack
}

const A: Channel[] = ['voice', 'chat', 'email'];

const TOOL_REGISTRY_BASE: Omit<ToolEntry, 'pack'>[] = [
  // read/search
  { name: 'read_url',                 description: 'Lee el contenido de una URL pública',                  channels: A, category: 'web',       destructive: false, gatedByRole: null, gatedByFeature: null,      capability: null, policy: policyFor('read_url') },
  { name: 'buscar_en_web',            description: 'Búsqueda web general (Brave Search)',                   channels: A, category: 'web',       destructive: false, gatedByRole: null, gatedByFeature: null,      capability: null, policy: policyFor('buscar_en_web') },
  { name: 'search_leads',             description: 'Búsqueda estructurada de leads/empresas',               channels: A, category: 'web',       destructive: false, gatedByRole: ['niva'], gatedByFeature: null,  capability: null, policy: policyFor('search_leads') },
  // buscar_archivo/leer_archivo: post rename 2026-08-19 son el nombre canonical
  // en los 3 canales (antes: search_files/read_file en chat/email).
  { name: 'buscar_archivo',           description: 'Busca archivos en Drive del negocio',                   channels: A, category: 'drive',     destructive: false, gatedByRole: ['nelia','neo','naia','nox'], gatedByFeature: null, capability: 'files', policy: policyFor('buscar_archivo') },
  { name: 'leer_archivo',             description: 'Lee contenido de archivo del Drive',                    channels: A, category: 'drive',     destructive: false, gatedByRole: ['neo','nox'], gatedByFeature: null, capability: 'files', policy: policyFor('leer_archivo') },

  // destructive
  { name: 'enviar_correo',            description: 'Envía correo directo (verifier antes de send)',         channels: A, category: 'comms',     destructive: true,  gatedByRole: ['nico','nelia','naia','nox','niva','noah'], gatedByFeature: null, capability: 'email', policy: policyFor('enviar_correo') },
  { name: 'trigger_outbound_call',    description: 'Dispara llamada saliente (verifier antes)',             channels: A, category: 'comms',     destructive: true,  gatedByRole: ['noah'], gatedByFeature: 'outbound_calls', capability: 'phone', policy: policyFor('trigger_outbound_call') },

  // documents
  { name: 'create_document',          description: 'Genera PDF (factura, orden, cotización, general)',      channels: A, category: 'docs',      destructive: false, gatedByRole: ['nico','naia','nova','nox','niva'], gatedByFeature: null, capability: null, policy: policyFor('create_document') },
  { name: 'create_file',              description: 'Genera archivo Excel/Word/PowerPoint',                  channels: A, category: 'docs',      destructive: false, gatedByRole: ['nox','niva','nova'], gatedByFeature: null, capability: null, policy: policyFor('create_file') },
  { name: 'crear_borrador_contrato',   description: 'Crea borrador de contrato',                             channels: A, category: 'docs',      destructive: true,  gatedByRole: ['nox'], gatedByFeature: 'contract_drafts', capability: null, policy: policyFor('crear_borrador_contrato') },

  // drive
  { name: 'save_to_drive',            description: 'Sube archivo local al Drive del negocio',               channels: A, category: 'drive',     destructive: false, gatedByRole: ['nox','niva'], gatedByFeature: null, capability: 'files', policy: policyFor('save_to_drive') },
  { name: 'organize_files',           description: 'Renombra, mueve o crea carpetas en Drive',              channels: A, category: 'drive',     destructive: true,  gatedByRole: ['nox'], gatedByFeature: null,   capability: 'files', policy: policyFor('organize_files') },

  // calendar
  { name: 'list_calendar_events',     description: 'Lista eventos del calendario',                          channels: A, category: 'calendar',  destructive: false, gatedByRole: ['naia','nox','niva'], gatedByFeature: null, capability: null, policy: policyFor('list_calendar_events') },
  { name: 'create_calendar_event',    description: 'Crea evento en calendario',                             channels: A, category: 'calendar',  destructive: false, gatedByRole: ['naia','nox','niva'], gatedByFeature: null, capability: null, policy: policyFor('create_calendar_event') },
  { name: 'delete_calendar_event',    description: 'Elimina evento del calendario',                         channels: A, category: 'calendar',  destructive: true,  gatedByRole: ['naia'], gatedByFeature: null, capability: null, policy: policyFor('delete_calendar_event') },

  // civic
  { name: 'crear_reporte_civico',      description: 'Reporte cívico municipal',                              channels: A, category: 'gobierno',  destructive: false, gatedByRole: ['nara'], gatedByFeature: 'civic_reports', capability: null, policy: policyFor('crear_reporte_civico') },
  { name: 'consultar_reporte_civico', description: 'Consulta reporte cívico por folio',                     channels: A, category: 'gobierno',  destructive: false, gatedByRole: ['nara'], gatedByFeature: 'civic_reports', capability: null, policy: policyFor('consultar_reporte_civico') },
  { name: 'actualizar_reporte_civico', description: 'Actualiza estado de reporte cívico',                   channels: A, category: 'gobierno',  destructive: false, gatedByRole: ['nara'], gatedByFeature: 'civic_reports', capability: null, policy: policyFor('actualizar_reporte_civico') },

  // QB (feature-gated 'quickbooks')
  { name: 'qb_consultar_facturas',    description: 'Consulta facturas en QuickBooks',                       channels: A, category: 'quickbooks', destructive: false, gatedByRole: ['nico','niva'], gatedByFeature: 'quickbooks', capability: null, policy: policyFor('qb_consultar_facturas') },
  { name: 'qb_buscar_cliente',        description: 'Busca cliente en QuickBooks',                           channels: A, category: 'quickbooks', destructive: false, gatedByRole: ['nico','niva'], gatedByFeature: 'quickbooks', capability: null, policy: policyFor('qb_buscar_cliente') },
  { name: 'qb_crear_factura',         description: 'Crea factura en QuickBooks (destructiva, 1 op)',        channels: A, category: 'quickbooks', destructive: true,  gatedByRole: ['nico'], gatedByFeature: 'quickbooks', capability: null, policy: policyFor('qb_crear_factura') },

  // fiscal
  { name: 'solicitar_factura',        description: 'Emite CFDI vía el PAC del negocio (SF, CONTPAQi)',      channels: A, category: 'fiscal',    destructive: true,  gatedByRole: ['nico'], gatedByFeature: null, capability: null, policy: policyFor('solicitar_factura') },
  { name: 'consultar_factura',        description: 'Consulta estado de solicitud de CFDI',                  channels: A, category: 'fiscal',    destructive: false, gatedByRole: ['nico'], gatedByFeature: null, capability: null, policy: policyFor('consultar_factura') },
  // fiscal internos Centinelia (Nala) — timbra a nombre de Centinelia hacia sus clientes via Facturama
  { name: 'emitir_cfdi_centinelia',   description: 'Emite CFDI Ingreso a nombre de Centinelia (Nala interna, Facturama)', channels: A, category: 'fiscal', destructive: true,  gatedByRole: ['nala'], gatedByFeature: null, capability: null, policy: DEFAULT_POLICY },
  { name: 'solicitar_complemento_pago', description: 'Emite Complemento de Pago (REP) para un CFDI PPD ya timbrado (Nala interna, Facturama)', channels: A, category: 'fiscal', destructive: true,  gatedByRole: ['nala'], gatedByFeature: null, capability: null, policy: DEFAULT_POLICY },

  // productos / ML (feature-gated 'mercadolibre')
  { name: 'buscar_producto',          description: 'Busca producto en catálogo Notion',                     channels: A, category: 'catalog',   destructive: false, gatedByRole: ['noah'], gatedByFeature: null, capability: null, policy: policyFor('buscar_producto') },
  { name: 'catalogo_buscar_codigo',   description: 'Busca código de pieza/producto en catálogo Excel/CSV del cliente en la nube — Dropbox, Google Drive u OneDrive (pack cloud_catalog)', channels: A, category: 'catalog', destructive: false, gatedByRole: ['nox','noah'], gatedByFeature: 'cloud_catalog', capability: 'files', policy: DEFAULT_POLICY },
  { name: 'analizar_publicaciones_ml',description: 'Lista publicaciones Mercado Libre (solo chat)',         channels: ['chat'], category: 'mercadolibre', destructive: false, gatedByRole: ['noah','niva'], gatedByFeature: 'mercadolibre', capability: null, policy: policyFor('analizar_publicaciones_ml') },
  { name: 'ver_metricas_ml',          description: 'Métricas Mercado Libre (solo chat)',                    channels: ['chat'], category: 'mercadolibre', destructive: false, gatedByRole: ['noah','niva'], gatedByFeature: 'mercadolibre', capability: null, policy: policyFor('ver_metricas_ml') },

  // meta
  { name: 'delegar_tarea',            description: 'Delega tarea a otro empleado (loop on evidence)',       channels: A, category: 'meta',      destructive: false, gatedByRole: null, gatedByFeature: null,      capability: null, policy: policyFor('delegar_tarea') },
  { name: 'consultar_agente',         description: 'Consulta síncrona a otro empleado',                     channels: A, category: 'meta',      destructive: false, gatedByRole: null, gatedByFeature: null,      capability: null, policy: policyFor('consultar_agente') },
  { name: 'reportar_falla',           description: 'Reporta bug al equipo Centinelia',                      channels: A, category: 'meta',      destructive: false, gatedByRole: null, gatedByFeature: null,      capability: null, policy: DEFAULT_POLICY },

  // nash (interno) — solo se expone al meerkat interno Nash
  { name: 'revisar_incidentes_plataforma', description: 'Nash: lee las 5 fuentes de incidentes (bug_reports, llm_call_log errores, ops_inbox escalado stale, handoff_failed_responses, agent_tasks failed) con dedupe contra platform_incidents', channels: ['chat', 'email'], category: 'nash', destructive: false, gatedByRole: ['nash'], gatedByFeature: null, capability: null, policy: DEFAULT_POLICY },
  { name: 'crear_incidente',               description: 'Nash: crea fila en platform_incidents con dedupe por (source, source_id)',                                             channels: ['chat', 'email'], category: 'nash', destructive: false, gatedByRole: ['nash'], gatedByFeature: null,                       capability: null, policy: DEFAULT_POLICY },
  { name: 'responder_cliente_afectado',    description: 'Nash: envía WhatsApp o email al cliente afectado por un incidente',                                                    channels: ['chat', 'email'], category: 'nash', destructive: true,  gatedByRole: ['nash'], gatedByFeature: null,                       capability: null, policy: DEFAULT_POLICY },
  { name: 'enviar_a_claude_code',          description: 'Nash: crea GitHub issue con el prompt (NASH_GITHUB_TOKEN). Fallback email cuando el token falta',                       channels: ['chat', 'email'], category: 'nash', destructive: true,  gatedByRole: ['nash'], gatedByFeature: null,                       capability: null, policy: DEFAULT_POLICY },
  { name: 'escalar_al_owner',              description: 'Nash: WhatsApp a OWNER_WHATSAPP (fallback email hola@) marcando incidente como assigned_to=owner',                     channels: ['chat', 'email'], category: 'nash', destructive: true,  gatedByRole: ['nash'], gatedByFeature: null,                       capability: null, policy: DEFAULT_POLICY },
  { name: 'verificar_fix',                 description: 'Nash: re-check de la señal fuente. Si desapareció → status=resolved, si no → awaiting_verification',                   channels: ['chat', 'email'], category: 'nash', destructive: false, gatedByRole: ['nash'], gatedByFeature: null,                       capability: null, policy: DEFAULT_POLICY },
  { name: 'consultar_billing_org',         description: 'Nash: estado billing real de una org (minutos/tareas usados y disponibles, ciclo, modelo, ledger flag). Fuente de verdad para responder al owner sin alucinar cifras.', channels: ['chat', 'email'], category: 'nash', destructive: false, gatedByRole: ['nash'], gatedByFeature: null,                       capability: null, policy: DEFAULT_POLICY },
  { name: 'audit_ops_consumption',         description: 'Nash: audita consumo de ops de un portal para detectar silent-drains. Analiza ratio events/refs (posible re-cobro) y spike vs baseline móvil de 4 semanas.',                  channels: ['chat', 'email'], category: 'nash', destructive: false, gatedByRole: ['nash'], gatedByFeature: null,                       capability: null, policy: DEFAULT_POLICY },

  // brand / voc
  { name: 'extraer_tono_de_marca',    description: 'Extrae guía de tono desde muestras',                    channels: A, category: 'brand',     destructive: false, gatedByRole: ['niva'], gatedByFeature: null, capability: null, policy: DEFAULT_POLICY },
  { name: 'extraer_voz_del_cliente',  description: 'VoC desde llamadas/correos/tickets',                    channels: A, category: 'brand',     destructive: false, gatedByRole: ['nelia','nova','niva'], gatedByFeature: null, capability: null, policy: DEFAULT_POLICY },

  // sheets (feature-gated 'google_sheets')
  { name: 'sheets_agregar_fila',      description: 'Agrega fila al Google Sheet configurado para el propósito',    channels: ['chat', 'email', 'voice'], category: 'sheets', destructive: false, gatedByRole: ['nox'], gatedByFeature: 'google_sheets', capability: 'sheets.write', policy: policyFor('sheets_agregar_fila') },
  { name: 'sheets_actualizar_fila',   description: 'Actualiza fila existente en el Google Sheet',                  channels: ['chat', 'email', 'voice'], category: 'sheets', destructive: false, gatedByRole: ['nox'], gatedByFeature: 'google_sheets', capability: 'sheets.write', policy: policyFor('sheets_actualizar_fila') },
  { name: 'sheets_leer',              description: 'Lee el contenido del Google Sheet configurado',                 channels: ['chat', 'email', 'voice'], category: 'sheets', destructive: false, gatedByRole: ['nox'], gatedByFeature: 'google_sheets', capability: 'sheets.read',  policy: policyFor('sheets_leer') },
  { name: 'sheets_buscar',            description: 'Busca filas en el Google Sheet que contengan un texto',        channels: ['chat', 'email', 'voice'], category: 'sheets', destructive: false, gatedByRole: ['nox'], gatedByFeature: 'google_sheets', capability: 'sheets.read',  policy: policyFor('sheets_buscar') },

  // ─── F8 batch: 35+ tools funcionales pero sin declaración en registry ────
  // Ver Scope B Agent 1 sección 4. Sin estas entries, /admin/tools no las
  // descubre, auditRegistry() no gobierna, policy engine no aplica retry.

  // QB adicionales (feature-gated 'quickbooks')
  { name: 'qb_registrar_pago',        description: 'Registra pago en QuickBooks (destructivo, 1 op)',              channels: A, category: 'quickbooks', destructive: true,  gatedByRole: ['nico'], gatedByFeature: 'quickbooks', capability: null, policy: DEFAULT_POLICY },
  { name: 'qb_reporte_ingresos',      description: 'Reporte de ingresos/gastos/AR de QuickBooks por período',      channels: A, category: 'quickbooks', destructive: false, gatedByRole: ['nico'], gatedByFeature: 'quickbooks', capability: null, policy: DEFAULT_POLICY },

  // pack ciclo_oc_cfdi — Nala (facturista) + Nox (coordinador). Piloto AC Proyectos.
  { name: 'qb_crear_orden_compra',    description: 'Crea Orden de Compra en QuickBooks y abre expediente (destructivo, 1 op)', channels: ['chat', 'email'], category: 'ciclo_oc_cfdi', destructive: true,  gatedByRole: ['nox', 'nala'], gatedByFeature: 'quickbooks', capability: null, policy: DEFAULT_POLICY },
  { name: 'qb_consultar_orden_compra',description: 'Lee OC de QuickBooks + estado del expediente asociado',                    channels: ['chat', 'email'], category: 'ciclo_oc_cfdi', destructive: false, gatedByRole: ['nox', 'nala'], gatedByFeature: 'quickbooks', capability: null, policy: DEFAULT_POLICY },
  { name: 'qb_descargar_oc_pdf',      description: 'Descarga PDF de OC desde QB y lo archiva en Storage (1 op)',              channels: ['chat', 'email'], category: 'ciclo_oc_cfdi', destructive: false, gatedByRole: ['nox', 'nala'], gatedByFeature: 'quickbooks', capability: null, policy: DEFAULT_POLICY },
  { name: 'firmar_oc',                description: 'Evalúa reglas de autofirma y aplica firma digitalizada sobre PDF (1 op)', channels: ['chat', 'email'], category: 'ciclo_oc_cfdi', destructive: true,  gatedByRole: ['nox', 'nala'], gatedByFeature: null, capability: null, policy: DEFAULT_POLICY },
  { name: 'sf_timbrar_desde_oc',      description: 'Timbra CFDI en Solución Factible copiando conceptos del expediente OC (destructivo, 1 op)', channels: ['chat', 'email'], category: 'ciclo_oc_cfdi', destructive: true,  gatedByRole: ['nala'],       gatedByFeature: null,         capability: null, policy: DEFAULT_POLICY },

  // pack ciclo_oc_cfdi — bloque A: escalaciones humanas + pago + archivado
  { name: 'enviar_oc_a_firma_humana', description: 'Nox: escala OC al autorizador humano por correo cuando autofirma no procede (1 op)', channels: ['chat', 'email'], category: 'ciclo_oc_cfdi', destructive: false, gatedByRole: ['nox'],        gatedByFeature: null, capability: 'email', policy: DEFAULT_POLICY },
  { name: 'enviar_oc_a_pagos',        description: 'Nala: envía OC firmada al depto de pagos por correo para la transferencia (1 op)',      channels: ['chat', 'email'], category: 'ciclo_oc_cfdi', destructive: false, gatedByRole: ['nala'],       gatedByFeature: null, capability: 'email', policy: DEFAULT_POLICY },
  { name: 'registrar_comprobante_pago', description: 'Nala: registra el comprobante de pago del depto y transiciona expediente a oc_pagada (1 op)', channels: ['chat', 'email'], category: 'ciclo_oc_cfdi', destructive: false, gatedByRole: ['nala'], gatedByFeature: null, capability: null,   policy: DEFAULT_POLICY },
  { name: 'enviar_oc_a_proveedor',    description: 'Nala: envía OC firmada + comprobante al proveedor externo (destructivo, 1 op)',           channels: ['chat', 'email'], category: 'ciclo_oc_cfdi', destructive: true,  gatedByRole: ['nala'],       gatedByFeature: null, capability: 'email', policy: DEFAULT_POLICY },
  { name: 'archivar_expediente',      description: 'Nala: archiva XML+PDF+acuse en destino configurado (Dropbox/SMB/Windows agent) con nomenclatura (1 op)', channels: ['chat', 'email'], category: 'ciclo_oc_cfdi', destructive: false, gatedByRole: ['nala'], gatedByFeature: null, capability: 'files', policy: DEFAULT_POLICY },
  { name: 'qb_crear_orden_compra_desde_cotizacion', description: 'Nala: parsea cotización de proveedor (PDF o imagen) con Vision AI y crea OC en QB automáticamente. Delega en qb_crear_orden_compra (1 op)', channels: ['chat', 'email'], category: 'ciclo_oc_cfdi', destructive: true, gatedByRole: ['nala'], gatedByFeature: 'quickbooks', capability: null, policy: DEFAULT_POLICY },

  // QB admin departamentos AC (Nox: cotizaciones + gastos + caja chica)
  { name: 'qb_crear_cotizacion',      description: 'Crea cotización (Estimate) en QuickBooks para un cliente. Nox lo hace como admin, Noah cierra ventas cotizando en vivo (destructivo, 1 op)', channels: ['chat', 'email'], category: 'quickbooks', destructive: true, gatedByRole: ['nox', 'noah'], gatedByFeature: 'quickbooks', capability: null, policy: DEFAULT_POLICY },
  { name: 'qb_registrar_gasto',       description: 'Nox: registra un gasto (Purchase) en QuickBooks contra cuenta bancaria o tarjeta (destructivo, 1 op)', channels: ['chat', 'email'], category: 'quickbooks', destructive: true, gatedByRole: ['nox'], gatedByFeature: 'quickbooks', capability: null, policy: DEFAULT_POLICY },
  { name: 'qb_registrar_caja_chica',  description: 'Nox: registra un gasto contra la cuenta de Caja Chica en QuickBooks (destructivo, 1 op)',         channels: ['chat', 'email'], category: 'quickbooks', destructive: true, gatedByRole: ['nox'], gatedByFeature: 'quickbooks', capability: null, policy: DEFAULT_POLICY },

  // SF adicionales (cancelar + consultar SAT). Nala only.
  { name: 'sf_cancelar_cfdi',         description: 'Nala: solicita cancelación de CFDI ante el SAT via Solución Factible. Requiere invoicing_allow_agent_cancellation=true. Verifier obligatorio (destructivo IRREVERSIBLE si SAT acepta, 1 op)', channels: ['chat', 'email'], category: 'ciclo_oc_cfdi', destructive: true,  gatedByRole: ['nala'], gatedByFeature: null, capability: null, policy: DEFAULT_POLICY },
  { name: 'sf_consultar_estado_sat',  description: 'Nala: consulta estado real de una cancelación de CFDI ante el SAT. Read-only, sin ops.',                                                                                                     channels: ['chat', 'email'], category: 'ciclo_oc_cfdi', destructive: false, gatedByRole: ['nala'], gatedByFeature: null, capability: null, policy: DEFAULT_POLICY },

  // office docs (reutilización de docs previos)
  { name: 'buscar_documento_oficina', description: 'Busca documentos generados previamente en Oficina',            channels: A, category: 'docs',      destructive: false, gatedByRole: ['nia','noah','nico','nelia','naia','nova','nox','niva'], gatedByFeature: null, capability: null, policy: DEFAULT_POLICY },
  { name: 'enviar_documento_oficina', description: 'Reenvía un documento existente de Oficina como adjunto',       channels: A, category: 'docs',      destructive: true,  gatedByRole: ['nico','nelia','nox','niva'], gatedByFeature: null, capability: 'email', policy: DEFAULT_POLICY },

  // CRM / data capture
  { name: 'crear_lead',               description: 'Registra un lead con nombre/telefono/interés',                 channels: A, category: 'crm',       destructive: false, gatedByRole: ['nia','noah'], gatedByFeature: null, capability: null, policy: DEFAULT_POLICY },
  { name: 'crear_contacto_saliente',  description: 'Crea contacto en outbound_contacts para campañas',             channels: A, category: 'crm',       destructive: false, gatedByRole: ['nia','noah'], gatedByFeature: null, capability: null, policy: DEFAULT_POLICY },
  { name: 'agendar_cita',             description: 'Registra cita en la agenda del negocio',                       channels: A, category: 'crm',       destructive: false, gatedByRole: ['nia','naia'], gatedByFeature: null, capability: null, policy: DEFAULT_POLICY },
  { name: 'registrar_pedido',         description: 'Registra pedido de cliente (producto, cantidad, entrega)',     channels: A, category: 'crm',       destructive: false, gatedByRole: ['nia','noah'], gatedByFeature: null, capability: null, policy: DEFAULT_POLICY },
  { name: 'registrar_incidencia',     description: 'Registra queja/incidencia de cliente que no recibió su pedido. Manda correo al encargado y agenda llamada de verificación en 3 días.', channels: A, category: 'crm', destructive: true, gatedByRole: ['nia','noah','nelia'], gatedByFeature: 'incidencia_flow', capability: null, policy: DEFAULT_POLICY },
  { name: 'registrar_cliente_nuevo',  description: 'Registra un cliente nuevo que llama para darse de alta (sin queja). Manda correo al encargado pidiendo que lo contacte para tomarle el pedido. No agenda callback automático.', channels: A, category: 'crm', destructive: true, gatedByRole: ['nia','noah','nelia'], gatedByFeature: 'incidencia_flow', capability: null, policy: DEFAULT_POLICY },
  { name: 'verificar_recepcion_incidencia', description: 'Marca resultado de llamada de verificación de 3 días (ok/no_visitado/sin_respuesta). Solo se usa en llamadas salientes disparadas por auto_incident_verification.', channels: A, category: 'crm', destructive: true, gatedByRole: ['nia','noah','nelia'], gatedByFeature: 'incidencia_flow', capability: null, policy: DEFAULT_POLICY },
  { name: 'buscar_cliente',           description: 'Busca cliente existente por nombre/telefono',                  channels: A, category: 'crm',       destructive: false, gatedByRole: ['nia','noah','nico','nelia','nara','naia','nova'], gatedByFeature: null, capability: null, policy: DEFAULT_POLICY },
  { name: 'buscar_correo_enviado',    description: 'Busca correos enviados previamente para dar seguimiento',      channels: A, category: 'crm',       destructive: false, gatedByRole: ['nia','noah','nico','nelia','naia','nox','niva'], gatedByFeature: null, capability: 'email', policy: DEFAULT_POLICY },
  { name: 'agregar_tag_contacto',     description: 'Agrega tag a contacto para segmentación de campañas',          channels: A, category: 'crm',       destructive: false, gatedByRole: ['nia','noah'], gatedByFeature: null, capability: null, policy: DEFAULT_POLICY },
  { name: 'marcar_no_llamar',         description: 'Marca teléfono como "no volver a llamar" (regulatorio LFPDPPP)', channels: ['voice', 'email'], category: 'crm', destructive: true, gatedByRole: ['noah'], gatedByFeature: null, capability: null, policy: DEFAULT_POLICY },

  // helpdesk IT
  { name: 'crear_ticket',             description: 'Crea ticket de soporte IT con categoría y prioridad',          channels: A, category: 'helpdesk',  destructive: false, gatedByRole: ['neo','nova'], gatedByFeature: null, capability: null, policy: DEFAULT_POLICY },
  { name: 'consultar_incidentes',     description: 'Consulta incidentes activos por tema',                         channels: A, category: 'helpdesk',  destructive: false, gatedByRole: ['neo'], gatedByFeature: null, capability: null, policy: DEFAULT_POLICY },
  { name: 'buscar_directorio',        description: 'Busca en directorio interno de la org por área/expertise (helpdesk) o por rol (contacto_operaciones, autorizador_oc, encargado_pagos, dueno)', channels: A, category: 'helpdesk',  destructive: false, gatedByRole: ['neo','noah'], gatedByFeature: null, capability: null, policy: DEFAULT_POLICY },
  { name: 'iniciar_onboarding',       description: 'Dispara onboarding con correo de bienvenida',                  channels: A, category: 'helpdesk',  destructive: true,  gatedByRole: ['naia'], gatedByFeature: null, capability: 'email', policy: DEFAULT_POLICY },

  // voice-only (transferencias telefónicas y encuestas en llamada)
  { name: 'notificar_transferencia',  description: 'Voice-only: notifica al destinatario antes de transferir',    channels: ['voice'], category: 'voice', destructive: false, gatedByRole: ['nia','noah','nico','nelia','nara','nova'], gatedByFeature: null, capability: null, policy: DEFAULT_POLICY },
  { name: 'transferir_llamada',       description: 'Voice-only: transfiere llamada a número/agente',              channels: ['voice'], category: 'voice', destructive: true,  gatedByRole: ['nia','noah','nico','nelia','nara','nova'], gatedByFeature: null, capability: null, policy: DEFAULT_POLICY },
  { name: 'registrar_encuesta',       description: 'Voice-only: registra respuestas de encuesta telefónica',      channels: ['voice'], category: 'voice', destructive: false, gatedByRole: ['nia','nelia','nara'], gatedByFeature: null, capability: null, policy: DEFAULT_POLICY },

  // director / niva (finanzas + desempeño)
  { name: 'revisar_desempeno_equipo', description: 'Reporte de desempeño del equipo (director)',                   channels: A, category: 'finanzas',  destructive: false, gatedByRole: ['niva'], gatedByFeature: null,  capability: null, policy: DEFAULT_POLICY },
  { name: 'aprobar_gasto',            description: 'Registra aprobación/rechazo de gasto operativo (director, audit)', channels: A, category: 'finanzas', destructive: true,  gatedByRole: ['niva'], gatedByFeature: null,  capability: null, policy: DEFAULT_POLICY },
  { name: 'evaluar_limite_gasto',     description: 'Verifica si un gasto cabe en el presupuesto mensual',          channels: A, category: 'finanzas',  destructive: false, gatedByRole: ['niva'], gatedByFeature: null,  capability: null, policy: DEFAULT_POLICY },
  { name: 'verificar_gasto_recurrente', description: 'Consulta historial de proveedor para auto-approve facturas', channels: A, category: 'finanzas',  destructive: false, gatedByRole: ['nox','niva'], gatedByFeature: null, capability: null, policy: DEFAULT_POLICY },

  // Nox coordinator (non-voice)
  { name: 'preparar_brief_del_dia',   description: 'Nox: brief diario del owner (acción hoy / preparación / al tanto)', channels: ['chat', 'email'], category: 'meta', destructive: false, gatedByRole: ['nox'], gatedByFeature: null, capability: null, policy: DEFAULT_POLICY },

  // Pilar 2 creativity (docs generados con LLM, cobran 3-6 ops)
  // Nota: MEERKAT_TOOL_ACCESS en src/lib/creativity/meerkat-gates.ts controla
  // el runtime de estas tools. Aquí solo se documenta la distribución para
  // /admin/tools; mantener ambas fuentes sincronizadas.
  { name: 'generar_propuesta_comercial',    description: 'Genera propuesta comercial PDF (5 ops)',                  channels: A, category: 'creatividad', destructive: false, gatedByRole: ['noah'], gatedByFeature: null, capability: null, policy: DEFAULT_POLICY },
  { name: 'generar_cotizacion',             description: 'Genera cotización PDF con precios (4 ops)',              channels: A, category: 'creatividad', destructive: false, gatedByRole: ['noah'], gatedByFeature: null, capability: null, policy: DEFAULT_POLICY },
  { name: 'generar_one_pager',              description: 'Genera one-pager informativo PDF (3 ops)',                channels: A, category: 'creatividad', destructive: false, gatedByRole: ['nelia'], gatedByFeature: null, capability: null, policy: DEFAULT_POLICY },
  { name: 'generar_correo_estructurado',    description: 'Borrador de correo largo estructurado (2 ops)',           channels: A, category: 'creatividad', destructive: false, gatedByRole: ['noah','nico','naia','nelia'], gatedByFeature: null, capability: null, policy: DEFAULT_POLICY },
  { name: 'generar_pitch_deck',             description: 'Pitch deck PowerPoint 8-10 slides (6 ops)',               channels: A, category: 'creatividad', destructive: false, gatedByRole: ['niva'], gatedByFeature: null, capability: null, policy: DEFAULT_POLICY },
  { name: 'generar_reporte_metricas_excel', description: 'Reporte Excel de métricas del período (4 ops)',           channels: A, category: 'creatividad', destructive: false, gatedByRole: ['nelia','nara','niva'], gatedByFeature: null, capability: null, policy: DEFAULT_POLICY },

  // ML publicaciones (registro real de operación — voice + chat, email intencionalmente ausente)
  { name: 'crear_publicacion_ml',           description: 'Crea publicación en Mercado Libre (voice+chat)',          channels: ['voice', 'chat'], category: 'mercadolibre', destructive: true, gatedByRole: ['noah'], gatedByFeature: null, capability: null, policy: DEFAULT_POLICY },
  { name: 'actualizar_publicacion_ml',      description: 'Actualiza publicación en Mercado Libre (voice+chat)',     channels: ['voice', 'chat'], category: 'mercadolibre', destructive: true, gatedByRole: ['noah'], gatedByFeature: null, capability: null, policy: DEFAULT_POLICY },

  // meta / escalación
  { name: 'pedir_a_humano',           description: 'Escala a humano (info/action/approval) con audit en human_requests', channels: A, category: 'meta', destructive: false, gatedByRole: null, gatedByFeature: null, capability: null, policy: DEFAULT_POLICY },

  // trámites externos (piloto MTY, voice-only)
  { name: 'consultar_catalogo_externo', description: 'Voice-only: consulta catálogo de trámites municipal',        channels: ['voice'], category: 'tramites', destructive: false, gatedByRole: ['nara'], gatedByFeature: 'external_tramites', capability: null, policy: DEFAULT_POLICY },
  { name: 'buscar_en_padron_externo',   description: 'Voice-only: busca ciudadano en padrón municipal',            channels: ['voice'], category: 'tramites', destructive: false, gatedByRole: ['nara'], gatedByFeature: 'external_tramites', capability: null, policy: DEFAULT_POLICY },
  { name: 'enviar_tramite_externo',     description: 'Voice-only: envía trámite al backend municipal (destructivo)', channels: ['voice'], category: 'tramites', destructive: true,  gatedByRole: ['nara'], gatedByFeature: 'external_tramites', capability: null, policy: DEFAULT_POLICY },

  // pack inventory_excel — Nami (inventarios). Piloto AC Proyectos.
  // Opera Excel del cliente en SharePoint/OneDrive vía Microsoft Graph.
  // Read-only tools (buscar/snapshot) + write tools (agregar/actualizar/transferir).
  { name: 'inv_buscar_por_serie',     description: 'Nami: busca un equipo por número de serie en el INVENTARIO histórico',     channels: A, category: 'inventarios', destructive: false, gatedByRole: ['nami'], gatedByFeature: null, capability: 'files', policy: DEFAULT_POLICY },
  { name: 'inv_buscar_por_modelo',    description: 'Nami: busca equipos por modelo (filtros por estatus y bodega)',              channels: A, category: 'inventarios', destructive: false, gatedByRole: ['nami'], gatedByFeature: null, capability: 'files', policy: DEFAULT_POLICY },
  { name: 'inv_buscar_por_cliente',   description: 'Nami: busca equipos asignados a un cliente (útil para reconciliar mensajes sin serie)', channels: A, category: 'inventarios', destructive: false, gatedByRole: ['nami'], gatedByFeature: null, capability: 'files', policy: DEFAULT_POLICY },
  { name: 'inv_procesar_factura_trane', description: 'Nami: parsea XML CFDI de factura TRANE y agrega los equipos al INVENTARIO (1 fila por serie individual)', channels: A, category: 'inventarios', destructive: true,  gatedByRole: ['nami'], gatedByFeature: null, capability: 'files', policy: DEFAULT_POLICY },
  { name: 'inv_stock_snapshot',       description: 'Nami: snapshot de STOCK con detección de modelos por debajo del IDEAL',      channels: A, category: 'inventarios', destructive: false, gatedByRole: ['nami'], gatedByFeature: null, capability: 'files', policy: DEFAULT_POLICY },
  { name: 'inv_pedir_reposicion',     description: 'Nami: manda correo al encargado pidiendo reposición de N piezas de modelo X', channels: A, category: 'inventarios', destructive: true,  gatedByRole: ['nami'], gatedByFeature: null, capability: 'email', policy: DEFAULT_POLICY },
  { name: 'inv_agregar_equipo',       description: 'Nami: agrega equipo nuevo al INVENTARIO con serie, modelo, USD, TC, bodega', channels: A, category: 'inventarios', destructive: true,  gatedByRole: ['nami'], gatedByFeature: null, capability: 'files', policy: DEFAULT_POLICY },
  { name: 'inv_actualizar_estatus',   description: 'Nami: cambia estatus de equipo (ALMACEN → SEPARADO → ENTREGADO)',            channels: A, category: 'inventarios', destructive: true,  gatedByRole: ['nami'], gatedByFeature: null, capability: 'files', policy: DEFAULT_POLICY },
  { name: 'inv_asignar_cliente',      description: 'Nami: asigna cliente y vendedor a un equipo separado',                       channels: A, category: 'inventarios', destructive: true,  gatedByRole: ['nami'], gatedByFeature: null, capability: 'files', policy: DEFAULT_POLICY },
  { name: 'inv_registrar_venta',      description: 'Nami: registra datos de la venta (folio SF, fecha, precio) sobre el equipo',  channels: A, category: 'inventarios', destructive: true,  gatedByRole: ['nami'], gatedByFeature: null, capability: 'files', policy: DEFAULT_POLICY },
  { name: 'inv_transferir_bodega',    description: 'Nami: mueve un equipo entre bodegas (FLETEROS ↔ CENIZO ↔ TRANE)',            channels: A, category: 'inventarios', destructive: true,  gatedByRole: ['nami'], gatedByFeature: null, capability: 'files', policy: DEFAULT_POLICY },
  { name: 'inv_importar_backlog',     description: 'Nami: sincroniza BACKLOG desde el correo periódico de TRANE (bloqueado sin muestra)', channels: A, category: 'inventarios', destructive: true, gatedByRole: ['nami'], gatedByFeature: null, capability: 'files', policy: DEFAULT_POLICY },
  { name: 'inv_normalizar_bodegas',   description: 'Nami: normaliza aliases de bodega (FLETERO → FLETEROS) sobre el INVENTARIO',  channels: A, category: 'inventarios', destructive: true,  gatedByRole: ['nami'], gatedByFeature: null, capability: 'files', policy: DEFAULT_POLICY },
  { name: 'inv_reporte_utilidad',     description: 'Nami: calcula FACTOR de venta (precio_venta / costo_mx) por modelo/periodo',  channels: A, category: 'inventarios', destructive: false, gatedByRole: ['nami'], gatedByFeature: null, capability: 'files', policy: DEFAULT_POLICY },
];

export const TOOL_REGISTRY: ToolEntry[] = TOOL_REGISTRY_BASE.map(entry => ({
  ...entry,
  pack: TOOL_TO_PACK[entry.name] ?? null,
}));

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
