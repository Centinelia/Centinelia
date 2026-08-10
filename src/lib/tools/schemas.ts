/**
 * Single source of truth for cross-canal tool schemas.
 *
 * Each entry is in Anthropic format (input_schema). The voice adapter converts to
 * Vapi format. Channels that still have inline definitions are marked with
 * // TODO: migrate to registry comments in their source files.
 *
 * MIGRATED TOOLS (15):
 *   crear_lead, crear_contacto_saliente, agendar_cita, list_calendar_events,
 *   create_calendar_event, delete_calendar_event, save_to_drive,
 *   buscar_documento_oficina, enviar_documento_oficina, send_email (enviar_correo),
 *   consult_agent (consultar_agente), delegate_task (delegar_tarea),
 *   buscar_correo_enviado, buscar_cliente, reportar_falla
 *
 * DRIFT RESOLVED (winner noted per tool):
 *   - crear_lead: chat won (anti-hallucination "confirm" guardrail)
 *   - crear_contacto_saliente: chat won (tags description richer)
 *   - agendar_cita: chat won (has ubicacion field, clearer fecha_iso note)
 *   - list_calendar_events: delegate won (ISO 8601 with timezone, aligned with voice)
 *   - create_calendar_event: delegate won (generate_meet_link with anti-hallucination URL note)
 *   - delete_calendar_event: delegate won (cleaner)
 *   - save_to_drive: chat won (clearer storage_path note)
 *   - buscar_documento_oficina: chat won (richer kind enum explanations)
 *   - enviar_documento_oficina: parity — both channels identical
 *   - send_email: chat won (has cc field, full params)
 *   - consult_agent: chat won (has caller_verified param)
 *   - delegate_task: chat won (has caller_verified + success_criteria + max_iterations)
 *   - buscar_correo_enviado: chat won (richer description; voice/email identical)
 *   - buscar_cliente: chat won (mentions calls/leads/pedidos/citas in description)
 *   - reportar_falla: chat won (better-scoped: "not for auth errors")
 */

import type Anthropic from '@anthropic-ai/sdk';

interface ToolSchema extends Anthropic.Tool {
  /** Channels where this tool is used (informational only; not enforced here). */
  channels?: readonly ('voice' | 'chat' | 'email' | 'delegate')[];
  /**
   * Vapi server path override.
   * Defaults to `exec/${name}` when omitted.
   * Set to a kebab-case path for legacy per-tool voice routes
   * (e.g. 'crear-lead' → /api/voice/tools/crear-lead).
   */
  voiceServerPath?: string;
}

// ─── Canonical schemas ────────────────────────────────────────────────────────

export const TOOL_SCHEMAS: Record<string, ToolSchema> = {

  // 1. crear_lead — chat version won (anti-hallucination "confirm" guardrail)
  crear_lead: {
    name: 'crear_lead',
    description: 'Registra un prospecto interesado en los servicios del negocio (aparece en Llamadas del portal). Si ya lo registraste hace unos minutos con el mismo whatsapp o email, el sistema hace merge automatico, NO re-ejecutes esta tool para "confirmar" — solo dile al dueno donde revisar. REGLA CRÍTICA: SIEMPRE después de crear_lead debes invocar también crear_contacto_saliente con el mismo teléfono y motivo del interés, más los tags que MEJOR describan al contacto según lo que sabes de él. Usa tu criterio para elegir tags — piensa cómo el dueño querría segmentarlo después: nivel de interés ("Interesado", "Curioso", "En evaluación"), tipo de cliente ("B2B", "PYME", "Enterprise", "Retail"), señales de urgencia ("Urgente", "Presupuesto listo"), o categoría ("Lead", "VIP", "Cliente-actual", "Prospecto-frío"). Puedes combinar varios. Si de veras no tienes más info que el interés inicial, ["Lead"] es un fallback aceptable. Son dos tools en un solo turno.',
    input_schema: {
      type: 'object' as const,
      properties: {
        nombre:      { type: 'string', description: 'Nombre completo del prospecto' },
        negocio:     { type: 'string', description: 'Nombre del negocio del prospecto' },
        giro:        { type: 'string', description: 'Giro o industria del negocio' },
        servicio:    { type: 'string', description: 'Servicio en el que está interesado' },
        presupuesto: { type: 'string', description: 'Presupuesto aproximado' },
        timeline:    { type: 'string', description: 'Para cuándo lo necesita' },
        email:       { type: 'string', description: 'Correo electrónico del prospecto' },
        whatsapp:    { type: 'string', description: 'Número de WhatsApp del prospecto' },
      },
      required: ['nombre', 'servicio'],
    },
    channels: ['voice', 'chat', 'email'],
    voiceServerPath: 'crear-lead',
  },

  // 2. crear_contacto_saliente — chat version won (tags description richer)
  crear_contacto_saliente: {
    name: 'crear_contacto_saliente',
    description: 'Agrega un contacto a la lista de outbound para llamarle despues (aparece en Campanas del portal). Debe invocarse SIEMPRE junto con crear_lead (mismo turno) para que todo prospecto registrado quede también visible en Campañas. También úsala independiente cuando el dueño pida seguimiento por llamada. NO la confundas con agregar_tag_contacto (esa solo etiqueta contactos que YA existen).',
    input_schema: {
      type: 'object' as const,
      properties: {
        nombre:       { type: 'string', description: 'Nombre del contacto' },
        telefono:     { type: 'string', description: 'Telefono a llamar (obligatorio)' },
        email:        { type: 'string', description: 'Correo del contacto (opcional)' },
        motivo:       { type: 'string', description: 'Motivo o contexto de la llamada de seguimiento' },
        tags: {
          type: 'array',
          items: { type: 'string' },
          description: 'Etiquetas para clasificar el contacto — usa TU criterio según lo que sepas del prospecto. Piensa cómo el dueño querría segmentarlo después. Ejemplos: nivel de interés ("Interesado", "Curioso"), tipo ("B2B", "PYME", "Enterprise"), urgencia ("Urgente", "Presupuesto listo"), categoría ("Lead", "VIP", "Cliente-actual"). Puedes combinar varios. ["Lead"] es fallback aceptable si no hay más info.',
        },
        scheduled_at: { type: 'string', description: 'Fecha/hora ISO 8601 sugerida (opcional). Si se omite, queda en pending sin agendar.' },
      },
      required: ['telefono'],
    },
    channels: ['voice', 'chat', 'email'],
    voiceServerPath: 'crear-contacto-saliente',
  },

  // 3. agendar_cita — chat version won (has ubicacion field, clearer fecha_iso note)
  agendar_cita: {
    name: 'agendar_cita',
    description: 'Agenda, modifica o cancela una cita de un cliente. CRÍTICO: para agendar/modificar SIEMPRE debes mandar fecha_iso (YYYY-MM-DD) y hora (HH:MM 24h) — si las omites el sistema RECHAZA la operación. Para cancelar solo necesitas telefono.',
    input_schema: {
      type: 'object' as const,
      properties: {
        accion:       { type: 'string', enum: ['agendar', 'modificar', 'cancelar'], description: 'Acción a realizar' },
        nombre:       { type: 'string', description: 'Nombre del cliente' },
        servicio:     { type: 'string', description: 'Servicio para la cita' },
        fecha:        { type: 'string', description: 'Fecha en lenguaje natural para mostrar al cliente (ej: "lunes 28 de julio"). Es SOLO cosmética — la fecha real que usa el sistema es fecha_iso.' },
        fecha_iso:    { type: 'string', description: 'Fecha ISO YYYY-MM-DD (ej: 2026-08-11). OBLIGATORIA para agendar/modificar. Confirma el AÑO correcto (no repitas 2025 si estamos en 2026).' },
        hora:         { type: 'string', description: 'Hora en formato HH:MM 24h (ej: "14:30" para 2:30pm, "12:00" para mediodía). OBLIGATORIA para agendar/modificar.' },
        duracion_min: { type: 'number', description: 'Duración estimada de la cita en minutos. Default 60.' },
        telefono:     { type: 'string', description: 'Teléfono del cliente (necesario para cancelar o modificar)' },
        ubicacion:    { type: 'string', description: 'Dirección física, link de videollamada (Zoom/Meet), oficina, o instrucciones para llegar.' },
      },
      required: ['accion', 'nombre'],
    },
    channels: ['voice', 'chat', 'email'],
    voiceServerPath: 'agendar-cita',
  },

  // 4. list_calendar_events — delegate version won (ISO 8601 with timezone explicit)
  list_calendar_events: {
    name: 'list_calendar_events',
    description: 'Consulta eventos del calendario del dueño (Google Calendar u Outlook) en un rango. Úsala para verificar disponibilidad antes de agendar.',
    input_schema: {
      type: 'object' as const,
      properties: {
        from: { type: 'string', description: 'Inicio del rango en ISO 8601 (ej: 2026-08-11T00:00:00-06:00)' },
        to:   { type: 'string', description: 'Fin del rango en ISO 8601 (ej: 2026-08-12T00:00:00-06:00)' },
      },
      required: ['from', 'to'],
    },
    channels: ['voice', 'chat', 'email', 'delegate'],
    // exec/ path (no voiceServerPath override needed)
  },

  // 5. create_calendar_event — delegate version won (best anti-hallucination + generate_meet_link)
  create_calendar_event: {
    name: 'create_calendar_event',
    description: 'Crea un evento en el calendario del dueño. Si la reunión es por videollamada Meet y NO tienes un link propio, PASA generate_meet_link=true — el sistema crea el Meet real automáticamente y devuelve el link en el message del tool_result. Úsalo SIEMPRE que necesites un link Meet en un correo — nunca inventes URLs.',
    input_schema: {
      type: 'object' as const,
      properties: {
        title:              { type: 'string', description: 'Título del evento' },
        start:              { type: 'string', description: 'Inicio ISO 8601 con timezone' },
        end:                { type: 'string', description: 'Fin ISO 8601 con timezone' },
        description:        { type: 'string', description: 'Descripción o notas (opcional)' },
        location:           { type: 'string', description: 'Ubicación física o link propio (opcional)' },
        attendees:          { type: 'array', items: { type: 'string' }, description: 'Correos de invitados (opcional)' },
        generate_meet_link: { type: 'boolean', description: 'true para auto-generar link Google Meet real. USA true cuando necesites Meet y no tengas link propio.' },
      },
      required: ['title', 'start', 'end'],
    },
    channels: ['voice', 'chat', 'email', 'delegate'],
    // exec/ path (no voiceServerPath override needed)
  },

  // 6. delete_calendar_event — delegate version won (concise)
  delete_calendar_event: {
    name: 'delete_calendar_event',
    description: 'Elimina o cancela un evento del calendario del dueño.',
    input_schema: {
      type: 'object' as const,
      properties: {
        event_id: { type: 'string', description: 'ID del evento a eliminar' },
      },
      required: ['event_id'],
    },
    channels: ['voice', 'chat', 'email', 'delegate'],
    // exec/ path (no voiceServerPath override needed)
  },

  // 7. save_to_drive — chat version won (clearer storage_path note)
  save_to_drive: {
    name: 'save_to_drive',
    description: 'Guarda un documento generado en Google Drive o OneDrive del dueño. Úsala después de create_document cuando el dueño quiera que el archivo quede en su Drive, o cuando pida explícitamente guardar algo en la nube. Puede crear la carpeta de destino automáticamente si no existe.',
    input_schema: {
      type: 'object' as const,
      properties: {
        file_id:     { type: 'string', description: 'storage_path del documento generado (campo file_id de create_document). Ej: "uuid/nombre-1234567890.pdf"' },
        filename:    { type: 'string', description: 'Nombre del archivo en Drive/OneDrive, con extensión. Ej: "Propuesta Acme 2026.pdf"' },
        folder_name: { type: 'string', description: 'Carpeta de destino en Drive/OneDrive. Se crea si no existe. Ej: "Propuestas 2026". Omite si quiere guardarlo en la raíz.' },
      },
      required: ['file_id', 'filename'],
    },
    channels: ['voice', 'chat', 'email', 'delegate'],
    voiceServerPath: 'save-to-drive',
  },

  // 8. buscar_documento_oficina — chat version won (richer kind enum explanations)
  buscar_documento_oficina: {
    name: 'buscar_documento_oficina',
    description: 'Busca documentos ya generados y guardados en la Oficina del negocio (facturas, cotizaciones, cartas, propuestas, one-pagers, pitch decks, reportes Excel, órdenes de compra). Úsala cuando el usuario pida "el documento que le mandé la semana pasada" o cuando quieras reutilizar algo antes de generar uno nuevo. Devuelve una lista con id, título, tipo, folio y fecha. Luego usa enviar_documento_oficina con el id para adjuntarlo a un correo. IMPORTANTE: si no estás seguro del tipo exacto, OMITE el parámetro kind y busca solo por query — así verás todos los tipos que matchean.',
    input_schema: {
      type: 'object' as const,
      properties: {
        query:   { type: 'string', description: 'Texto para buscar en título, filename o folio. Opcional. Ejemplos: "CRM", "ACME", "onboarding".' },
        kind: {
          type: 'string',
          enum: ['propuesta', 'cotizacion', 'one_pager', 'pitch_deck', 'report_excel', 'correo', 'factura', 'orden_compra', 'proposal', 'letter', 'general', 'nota_venta', 'excel', 'word', 'powerpoint'],
          description: 'Filtro por tipo EXACTO. Valores válidos (usa el que aplique): "propuesta" (propuestas comerciales), "cotizacion" (cotizaciones con folio COT-XXXXXX), "one_pager" (one-pagers ejecutivos), "pitch_deck" (pitch decks PowerPoint), "report_excel" (reportes Excel), "correo" (correos estructurados), "factura", "orden_compra", "letter" (cartas), "general" (notas y otros). Si no estás seguro, OMITE este parámetro.',
        },
        cliente: { type: 'string', description: 'Filtro por nombre del cliente (fuzzy).' },
        limit:   { type: 'number', description: 'Máximo de resultados. Default 10, máximo 50.' },
      },
      required: [],
    },
    channels: ['voice', 'chat', 'email', 'delegate'],
    voiceServerPath: 'buscar-documento-oficina',
  },

  // 9. enviar_documento_oficina — parity, both channels identical
  enviar_documento_oficina: {
    name: 'enviar_documento_oficina',
    description: 'Adjunta un documento ya existente de la Oficina a un correo saliente. Requiere document_id previamente obtenido de buscar_documento_oficina. Úsala cuando el cliente pida reenviar algo ("mándame de nuevo la cotización de la semana pasada") en lugar de generar uno nuevo.',
    input_schema: {
      type: 'object' as const,
      properties: {
        document_id: { type: 'string', description: 'ID del documento devuelto por buscar_documento_oficina (uuid).' },
        to:          { type: 'string', description: 'Correo del destinatario.' },
        subject:     { type: 'string', description: 'Asunto del correo.' },
        body:        { type: 'string', description: 'Cuerpo del correo. Texto plano — se convierte a HTML.' },
      },
      required: ['document_id', 'to', 'subject', 'body'],
    },
    channels: ['voice', 'chat', 'email'],
    voiceServerPath: 'enviar-documento-oficina',
  },

  // 10. send_email — chat version won (has cc + attachment params).
  //     Voice uses tool name 'enviar_correo'; chat/email use 'send_email'.
  //     Voice adapter maps via voiceServerPath; the name in this entry is
  //     the Anthropic/chat-canonical name. buildToolDef in sync.ts handles
  //     the voice-side rename via the case 'enviar_correo' wrapper.
  send_email: {
    name: 'send_email',
    description: 'Envía un correo electrónico a cualquier destinatario en nombre del negocio. Puede incluir un archivo adjunto de Google Drive o OneDrive. Úsala cuando el dueño te pida enviar un correo, con o sin adjunto.',
    input_schema: {
      type: 'object' as const,
      properties: {
        to:                   { type: 'string', description: 'Dirección de correo del destinatario' },
        subject:              { type: 'string', description: 'Asunto del correo' },
        body:                 { type: 'string', description: 'Cuerpo del correo en texto. Puedes usar saltos de línea.' },
        cc:                   { type: 'string', description: 'Dirección en copia (opcional)' },
        attachment_file_id:   { type: 'string', description: 'ID del archivo de Drive/OneDrive a adjuntar (obtenido de search_files). Opcional.' },
        attachment_file_name: { type: 'string', description: 'Nombre del archivo adjunto con extensión. Ej: propuesta-acme.pdf' },
        attachment_mime_type: { type: 'string', description: 'Tipo MIME del archivo (de search_files). Ej: application/vnd.google-apps.document' },
      },
      required: ['to', 'subject', 'body'],
    },
    channels: ['chat', 'email', 'delegate'],
    // NOTE: voice uses tool name 'enviar_correo' with voiceServerPath 'enviar-correo'.
    // The voice case is kept inline in sync.ts under case 'enviar_correo' to avoid
    // name collision. This registry entry is used by chat/email/delegate only.
  },

  // 11. consult_agent — chat version won (has caller_verified param).
  //     Voice uses name 'consultar_agente'; chat uses 'consult_agent'.
  //     This entry is named 'consult_agent' (chat canonical).
  consult_agent: {
    name: 'consult_agent',
    description: 'Consulta a otro empleado del equipo cuando no tienes la información y esa es su área de especialidad. El compañero puede buscar en su Drive e internet si tampoco la tiene en su base de conocimiento. Úsala cuando necesites información que está fuera de tu área.',
    input_schema: {
      type: 'object' as const,
      properties: {
        rol: {
          type: 'string',
          description: 'Nombre o rol del compañero a consultar. Ej: "Nova", "contador", "almacén".',
        },
        tarea: {
          type: 'string',
          description: 'Qué necesitas saber o que te consiga. Sé específico.',
        },
        contexto: {
          type: 'string',
          description: 'Contexto adicional relevante para que tu compañero entienda mejor la solicitud. Opcional.',
        },
        caller_verified: {
          type: 'boolean',
          description: 'OBLIGATORIO cuando la consulta requiere info interna. TRUE solo si el interlocutor ya se verificó con passphrase o número reconocido del equipo. FALSE si es cliente externo o si dudas. Con FALSE, el compañero rechazará compartir info interna. Default false.',
        },
      },
      required: ['rol', 'tarea'],
    },
    channels: ['chat', 'email', 'delegate'],
    // NOTE: voice uses name 'consultar_agente' with voiceServerPath 'consultar-agente'.
    // That case stays inline in sync.ts. This entry is for chat/email/delegate.
  },

  // Also register the voice-side name as an alias pointing to the same schema but voice name.
  // This lets getAnthropicToolsByNames('consultar_agente') work for the voice channel.
  consultar_agente: {
    name: 'consultar_agente',
    description: 'Pregunta a otro agente del equipo algo que está fuera de tu conocimiento y necesitas su respuesta para continuar la conversación. El agente consultado responde con información o criterio experto. NO ejecuta acciones — solo responde. Úsala cuando necesites información que tiene otro especialista.',
    input_schema: {
      type: 'object' as const,
      properties: {
        rol:      { type: 'string', description: 'Nombre o rol del agente a consultar.' },
        tarea:    { type: 'string', description: 'Pregunta específica que le haces al agente.' },
        contexto: { type: 'string', description: 'Contexto relevante de la conversación (opcional).' },
        caller_verified: {
          type: 'boolean',
          description: 'OBLIGATORIO cuando la consulta requiere info interna. Pon TRUE solo si el llamante ya se verificó con passphrase o número reconocido. Pon FALSE si es cliente externo o si dudas. Con FALSE, el compañero consultado rechazará compartir info interna automáticamente. Default: false.',
        },
      },
      required: ['rol', 'tarea'],
    },
    channels: ['voice'],
    voiceServerPath: 'consultar-agente',
  },

  // 12. delegate_task — chat version won (caller_verified + success_criteria + max_iterations).
  //     Voice uses name 'delegar_tarea'; chat uses 'delegate_task'.
  delegate_task: {
    name: 'delegate_task',
    description: 'Pide a un compañero que EJECUTE una tarea concreta (crear factura, agendar cita, hacer llamada, subir archivo). Úsala cuando la acción está fuera de tu alcance. Diferente de consult_agent, que solo pide información sin ejecutar. Con success_criteria activas el loop-engineering: el compañero itera hasta cumplir el criterio.',
    input_schema: {
      type: 'object' as const,
      properties: {
        agente:          { type: 'string', description: 'Rol o nombre del compañero a quien delegar.' },
        tarea:           { type: 'string', description: 'Acción concreta a ejecutar.' },
        contexto:        { type: 'string', description: 'Contexto adicional (opcional).' },
        caller_verified: { type: 'boolean', description: 'Para acciones sensibles con info interna. En email el remitente es externo por default — usa FALSE a menos que sea compañero interno confirmado.' },
        success_criteria:{ type: 'string', description: 'Criterio de éxito verificable (opcional). Si se define, el compañero itera hasta cumplirlo o hasta max_iterations.' },
        max_iterations:  { type: 'number', description: 'Máximo intentos si success_criteria está definido (1-5, default 3).' },
      },
      required: ['agente', 'tarea'],
    },
    channels: ['chat', 'email', 'delegate'],
    // NOTE: voice uses name 'delegar_tarea' with voiceServerPath 'delegar-tarea'.
    // That case stays inline in sync.ts.
  },

  // Voice-side alias for delegar_tarea (used by sync.ts via registry)
  delegar_tarea: {
    name: 'delegar_tarea',
    description: 'Delega una tarea a otro agente del equipo para que la EJECUTE. El agente delegado toma acción real: envía correos, crea tickets, genera documentos, etc. Úsala cuando recibas una tarea que corresponde a otro especialista y que debes pasarle para que él la lleve a cabo. Espera la confirmación de lo que hizo.',
    input_schema: {
      type: 'object' as const,
      properties: {
        agente:          { type: 'string', description: 'Nombre o rol del agente que debe ejecutar la tarea.' },
        tarea:           { type: 'string', description: 'Descripción detallada de la tarea a ejecutar, incluyendo toda la información necesaria (nombres, correos, teléfonos, detalles).' },
        contexto:        { type: 'string', description: 'Contexto de la conversación o solicitud original (opcional pero recomendado).' },
        caller_verified: { type: 'boolean', description: 'OBLIGATORIO cuando la tarea requiere acceso interno (docs, contratos, plantillas, datos fiscales, clientes existentes). Pon TRUE solo si el llamante ya se verificó con passphrase o número reconocido de tu equipo. Pon FALSE si es un cliente externo o si no estás seguro. Con FALSE, el agente delegado rechazará acciones sensibles automáticamente. Default: false.' },
      },
      required: ['agente', 'tarea'],
    },
    channels: ['voice'],
    voiceServerPath: 'delegar-tarea',
  },

  // 13. buscar_correo_enviado — chat version won (richer description)
  buscar_correo_enviado: {
    name: 'buscar_correo_enviado',
    description: 'Busca correos que TÚ u otro empleado del equipo hayan enviado en el pasado desde el buzón de la empresa. Útil para: (1) ver qué se le comunicó a un cliente antes de darle seguimiento, (2) revisar histórico de conversaciones cuando el dueño pregunta por un correo previo, (3) evitar duplicar comunicaciones. Devuelve preview del cuerpo + destinatario + asunto + fecha + qué empleado lo envió.',
    input_schema: {
      type: 'object' as const,
      properties: {
        query:        { type: 'string', description: 'Texto a buscar en asunto o cuerpo (opcional). Ej: "cotización Nemak", "confirmación cita".' },
        destinatario: { type: 'string', description: 'Correo del destinatario para filtrar (opcional, match parcial). Ej: "pedro" o "@nemak.com".' },
        dias:         { type: 'number', description: 'Días hacia atrás a buscar (1-365, default 30).' },
        limit:        { type: 'number', description: 'Máximo resultados a devolver (1-20, default 10).' },
      },
      required: [],
    },
    channels: ['voice', 'chat', 'email', 'delegate'],
    // exec/ path (no voiceServerPath override needed)
  },

  // 14. buscar_cliente — chat version won (description mentions calls/leads/pedidos/citas)
  buscar_cliente: {
    name: 'buscar_cliente',
    description: 'Busca el historial de un cliente por nombre, teléfono o email. Muestra llamadas, leads, pedidos y citas anteriores. Úsala cuando el dueño quiera consultar el historial de un cliente.',
    input_schema: {
      type: 'object' as const,
      properties: {
        identificador: { type: 'string', description: 'Nombre completo, número de teléfono o email del cliente a buscar' },
      },
      required: ['identificador'],
    },
    channels: ['voice', 'chat', 'email'],
    voiceServerPath: 'buscar-cliente',
  },

  // 15. reportar_falla — chat version won (better scoped: "not for auth errors")
  reportar_falla: {
    name: 'reportar_falla',
    description: 'Reporta una falla técnica inesperada al equipo de Centinelia. Úsala cuando encuentres un error real del sistema: timeout de API, falla al escribir archivo, herramienta con comportamiento incorrecto, resultado corrupto, etc. NO la uses para errores de autenticación o sesión expirada — esos se resuelven pidiéndole al dueño que reconecte la integración. No consume ops del cliente.',
    input_schema: {
      type: 'object' as const,
      properties: {
        tipo: {
          type: 'string',
          description: 'Categoría del problema. Ej: "Error de integración", "Falla al enviar correo", "Problema con archivo", "Error en calendario", "Falla en POS", "Error de sistema".',
        },
        descripcion: {
          type: 'string',
          description: 'Descripción detallada: qué intentabas hacer, qué sucedió y qué error recibiste.',
        },
        contexto: {
          type: 'string',
          description: 'Contexto adicional: herramienta afectada, pasos realizados antes del error, datos relevantes. Opcional.',
        },
      },
      required: ['tipo', 'descripcion'],
    },
    channels: ['voice', 'chat', 'email'],
    voiceServerPath: 'reportar-falla',
  },

};

// ─── Adapter functions ────────────────────────────────────────────────────────

/** Strip registry-only metadata and return a plain Anthropic.Tool. */
export function toAnthropicTool(schema: ToolSchema): Anthropic.Tool {
  return {
    name:         schema.name,
    description:  schema.description,
    input_schema: schema.input_schema,
  };
}

/**
 * Convert a registry entry to Vapi tool definition format.
 *
 * @param schema  The ToolSchema from TOOL_SCHEMAS.
 * @param server  The ServerFn from sync.ts — given a path string returns the Vapi server object.
 */
export function toVapiToolDef(
  schema: ToolSchema,
  server: (path: string, extraQuery?: Record<string, string>) => unknown,
): Record<string, unknown> {
  const path = schema.voiceServerPath ?? `exec/${schema.name}`;
  return {
    type: 'function',
    function: {
      name:        schema.name,
      description: schema.description,
      parameters:  schema.input_schema,
    },
    server: server(path),
  };
}

/** Resolve schemas for a list of tool names. Missing names are silently skipped. */
export function getSchemasByNames(names: readonly string[]): ToolSchema[] {
  return names.map(n => TOOL_SCHEMAS[n]).filter((s): s is ToolSchema => !!s);
}

/** Return Anthropic.Tool[] for a list of tool names (registry entries only). */
export function getAnthropicToolsByNames(names: readonly string[]): Anthropic.Tool[] {
  return getSchemasByNames(names).map(toAnthropicTool);
}

/** Names of all 15 migrated tools (both canonical and voice aliases). */
export const MIGRATED_TOOL_NAMES = Object.keys(TOOL_SCHEMAS);
