/**
 * Mapping compartido entre canales voice/chat/email.
 *
 * - VOICE_TO_CHAT: traduce nombres de tools de voz (executor) al nombre que
 *   usan chat y email. `null` = la tool voice no tiene equivalente en chat.
 * - UNIVERSAL_TOOLS: 6 tools que TODO meerkat recibe sin importar su preset.
 *   Se agregan después de filtrar por MEERKAT_VOICE_DISTRIBUTION para no
 *   duplicar si el preset ya las listó.
 *
 * Origen: feedback-tool-bloat-reglas regla #1 (2026-08-18). Los presets
 * en MEERKAT_VOICE_DISTRIBUTION ya no listan las universales.
 */

export const VOICE_TO_CHAT: Record<string, string | null> = {
  // Renombres voice → chat/email
  enviar_correo:             'send_email',
  crear_documento:           'create_document',
  buscar_documento_oficina:  'buscar_documento_oficina',
  enviar_documento_oficina:  'enviar_documento_oficina',
  llamar_a:                  'trigger_outbound_call',
  buscar_archivo:            'search_files',
  leer_archivo:              'read_file',
  consultar_agente:          'consult_agent',
  delegar_tarea:             'delegate_task',

  // Voice-only (no aplica a chat/email)
  notificar_transferencia:   null,
  transferir_llamada:        null,
  registrar_encuesta:        null,

  // Data capture
  crear_lead:                'crear_lead',
  crear_contacto_saliente:   'crear_contacto_saliente',
  buscar_correo_enviado:     'buscar_correo_enviado',
  agendar_cita:              'agendar_cita',
  registrar_pedido:          'registrar_pedido',
  buscar_cliente:            'buscar_cliente',
  crear_ticket:              'crear_ticket',
  consultar_incidentes:      'consultar_incidentes',
  buscar_directorio:         'buscar_directorio',
  iniciar_onboarding:        'iniciar_onboarding',

  // Same name in both channels
  create_contract_draft:     'create_contract_draft',
  create_file:               'create_file',
  save_to_drive:             'save_to_drive',
  organize_files:            'organize_files',
  buscar_en_web:             'buscar_en_web',
  extraer_voz_del_cliente:   'extraer_voz_del_cliente',
  extraer_tono_de_marca:     'extraer_tono_de_marca',
  read_url:                  'read_url',
  search_leads:              'search_leads',
  list_calendar_events:      'list_calendar_events',
  create_calendar_event:     'create_calendar_event',
  delete_calendar_event:     'delete_calendar_event',
  create_civic_report:       'create_civic_report',
  lookup_civic_report:       'lookup_civic_report',
  update_civic_report:       'update_civic_report',
  analizar_publicaciones_ml: 'analizar_publicaciones_ml',
  crear_publicacion_ml:      'crear_publicacion_ml',
  actualizar_publicacion_ml: 'actualizar_publicacion_ml',
  ver_metricas_ml:           'ver_metricas_ml',
  reportar_falla:            'reportar_falla',
  qb_consultar_facturas:     'qb_consultar_facturas',
  qb_buscar_cliente:         'qb_buscar_cliente',
  qb_registrar_pago:         'qb_registrar_pago',
  qb_reporte_ingresos:       'qb_reporte_ingresos',
  qb_crear_factura:          'qb_crear_factura',
  solicitar_factura:              'solicitar_factura',
  consultar_factura:              'consultar_factura',
  solicitar_cancelacion_factura:  'solicitar_cancelacion_factura',
  revisar_desempeno_equipo:   'revisar_desempeno_equipo',
  aprobar_gasto:              'aprobar_gasto',
  evaluar_limite_gasto:       'evaluar_limite_gasto',
  verificar_gasto_recurrente: 'verificar_gasto_recurrente',
  sheets_agregar_fila:        'sheets_agregar_fila',
  sheets_actualizar_fila:     'sheets_actualizar_fila',
  sheets_leer:                'sheets_leer',
  sheets_buscar:              'sheets_buscar',
  marcar_no_llamar:          null,  // voice-only en chat portal (owner no habla con clientes), pero email SÍ (ver EMAIL_ONLY_TOOLS)
  agregar_tag_contacto:      'agregar_tag_contacto',
  pedir_a_humano:            'pedir_a_humano',
  catalogo_buscar_codigo:    'catalogo_buscar_codigo',
};

/**
 * Base universal — 6 tools que todo meerkat recibe sin importar el preset.
 * Los presets en MEERKAT_VOICE_DISTRIBUTION ya no listan estas.
 */
export const UNIVERSAL_TOOLS: string[] = [
  'delegate_task', 'consult_agent', 'pedir_a_humano',
  'reportar_falla', 'read_url', 'buscar_en_web',
];

/**
 * Tools que solo aplican al canal email (no chat portal).
 * marcar_no_llamar: cliente responde por correo "no me llamen" → LFPDPPP.
 *   En chat portal es null (owner no lo pide).
 */
export const EMAIL_ONLY_TOOLS_FROM_VOICE: string[] = [
  'marcar_no_llamar',
];
