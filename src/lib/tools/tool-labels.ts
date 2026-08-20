/**
 * Nombres amigables para tools que ve el owner en /configurar (Capa 3 UI).
 *
 * Fuente de verdad de los nombres técnicos: TOOL_REGISTRY. Aquí solo mapeamos
 * a copy user-facing (sin snake_case, sin nombres internos). Si una tool no
 * está aquí, `formatToolLabel` cae al fallback (snake_case → Title Case) para
 * que la UI nunca muestre string crudo.
 *
 * Regla: cuando agregues una tool al preset de algún meerkat o a un pack,
 * agrégale también un label aquí. Copy en español, sin em-dash, sin "IA",
 * sin "agente" (usar "empleado"). Máximo 6 palabras.
 */

export const TOOL_LABELS: Record<string, string> = {
  // Universales
  delegar_tarea:                'Delegar tarea a otro empleado',
  consultar_agente:             'Consultar a otro empleado',
  pedir_a_humano:               'Pedir apoyo a una persona',
  reportar_falla:               'Reportar una falla',
  read_url:                     'Leer una página web',
  buscar_en_web:                'Buscar en internet',

  // Comms
  enviar_correo:                'Enviar correo',
  buscar_correo_enviado:        'Buscar correos enviados',
  agregar_tag_contacto:         'Etiquetar contacto',
  iniciar_onboarding:           'Iniciar onboarding',

  // Voz — llamadas
  crear_lead:                   'Registrar un lead',
  crear_contacto_saliente:      'Guardar contacto para llamar después',
  agendar_cita:                 'Agendar cita',
  registrar_pedido:             'Registrar pedido por teléfono',
  buscar_cliente:               'Buscar cliente',
  notificar_transferencia:      'Avisar antes de transferir',
  transferir_llamada:           'Transferir llamada',
  registrar_encuesta:           'Registrar respuestas de encuesta',
  llamar_a:                     'Iniciar una llamada',
  marcar_no_llamar:             'Marcar teléfono como no volver a llamar',
  trigger_outbound_call:        'Iniciar llamada saliente',

  // Docs
  crear_documento:              'Generar documento en PDF',
  create_document:              'Generar documento en PDF',
  create_file:                  'Generar archivo Excel, Word o PowerPoint',
  crear_borrador_contrato:      'Redactar borrador de contrato',
  buscar_documento_oficina:     'Buscar documentos generados',
  enviar_documento_oficina:     'Enviar documento generado',
  generar_propuesta_comercial:  'Redactar propuesta comercial',
  generar_cotizacion:           'Redactar cotización',
  generar_one_pager:            'Redactar one-pager',
  generar_pitch_deck:           'Redactar pitch deck',
  generar_reporte_metricas_excel: 'Generar reporte de métricas en Excel',
  generar_correo_estructurado:  'Redactar correo estructurado',

  // Drive
  buscar_archivo:               'Buscar archivo en Drive',
  leer_archivo:                 'Leer archivo del Drive',
  save_to_drive:                'Guardar archivo en Drive',
  organize_files:               'Organizar archivos en Drive',

  // Calendar
  list_calendar_events:         'Ver eventos del calendario',
  create_calendar_event:        'Crear evento en calendario',
  delete_calendar_event:        'Eliminar evento del calendario',

  // Helpdesk
  crear_ticket:                 'Crear ticket',
  consultar_incidentes:         'Consultar incidentes',
  buscar_directorio:            'Buscar en directorio interno',

  // Reportes cívicos
  crear_reporte_civico:         'Crear reporte ciudadano',
  consultar_reporte_civico:     'Consultar reporte ciudadano',
  actualizar_reporte_civico:    'Actualizar reporte ciudadano',

  // Trámites gobierno externos
  consultar_catalogo_externo:   'Consultar catálogo de trámites',
  buscar_en_padron_externo:     'Buscar en padrón municipal',
  enviar_tramite_externo:       'Enviar trámite al sistema municipal',

  // QuickBooks
  qb_consultar_facturas:        'Consultar facturas en QuickBooks',
  qb_buscar_cliente:            'Buscar cliente en QuickBooks',
  qb_crear_factura:             'Crear factura en QuickBooks',
  qb_registrar_pago:            'Registrar pago en QuickBooks',
  qb_reporte_ingresos:          'Reporte de ingresos en QuickBooks',
  qb_crear_cotizacion:          'Crear cotización en QuickBooks',
  qb_crear_orden_compra:        'Crear orden de compra en QuickBooks',
  qb_consultar_orden_compra:    'Consultar orden de compra',
  qb_descargar_oc_pdf:          'Descargar PDF de orden de compra',
  qb_crear_orden_compra_desde_cotizacion: 'Convertir cotización en orden de compra',
  qb_registrar_gasto:           'Registrar gasto en QuickBooks',
  qb_registrar_caja_chica:      'Registrar caja chica en QuickBooks',

  // Facturación CFDI (SF / CONTPAQi)
  solicitar_factura:            'Emitir factura CFDI',
  consultar_factura:            'Consultar estado de factura',
  solicitar_cancelacion_factura: 'Solicitar cancelación de factura',
  firmar_oc:                    'Firmar orden de compra',
  sf_timbrar_desde_oc:          'Timbrar CFDI desde orden de compra',
  sf_cancelar_cfdi:             'Cancelar CFDI',
  sf_consultar_estado_sat:      'Consultar estado en SAT',
  enviar_oc_a_pagos:            'Enviar orden de compra a pagos',
  registrar_comprobante_pago:   'Registrar comprobante de pago',
  enviar_oc_a_proveedor:        'Enviar orden de compra al proveedor',
  archivar_expediente:          'Archivar expediente',
  enviar_oc_a_firma_humana:     'Enviar orden de compra a firma humana',

  // Catálogo / productos
  buscar_producto:              'Buscar producto en catálogo',
  catalogo_buscar_codigo:       'Buscar código en catálogo de la nube',

  // Sheets
  sheets_agregar_fila:          'Agregar fila a Google Sheets',
  sheets_actualizar_fila:       'Actualizar fila en Google Sheets',
  sheets_leer:                  'Leer Google Sheets',
  sheets_buscar:                'Buscar en Google Sheets',

  // MercadoLibre
  analizar_publicaciones_ml:    'Analizar publicaciones de MercadoLibre',
  crear_publicacion_ml:         'Crear publicación en MercadoLibre',
  actualizar_publicacion_ml:    'Actualizar publicación en MercadoLibre',
  ver_metricas_ml:              'Ver métricas de MercadoLibre',

  // RRHH
  registrar_falta:              'Registrar falta',
  consultar_vacaciones:         'Consultar vacaciones',
  solicitar_permiso:            'Solicitar permiso',
  verificar_incidencia:         'Verificar incidencia',

  // Despacho de campo
  asignar_unidad_campo:         'Asignar unidad de campo',
  consultar_unidades_disponibles: 'Ver unidades disponibles',

  // Insights & aprobaciones
  extraer_voz_del_cliente:      'Extraer voz del cliente',
  extraer_tono_de_marca:        'Extraer tono de marca',
  revisar_desempeno_equipo:     'Revisar desempeño del equipo',
  aprobar_gasto:                'Aprobar un gasto',
  evaluar_limite_gasto:         'Evaluar límite de gasto',
  verificar_gasto_recurrente:   'Verificar gasto recurrente',
  search_leads:                 'Buscar leads',
  preparar_brief_del_dia:       'Preparar brief del día',
  actualizar_disponibilidad_diaria: 'Actualizar disponibilidad del día',
};

/**
 * Devuelve el label amigable para una tool. Si no está en TOOL_LABELS, genera
 * un fallback capitalizando el snake_case (nunca devuelve string crudo).
 */
export function formatToolLabel(name: string): string {
  const explicit = TOOL_LABELS[name];
  if (explicit) return explicit;
  return name
    .split('_')
    .filter(Boolean)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}
