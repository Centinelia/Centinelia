import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { rateLimit, limiters } from '@/lib/ratelimit';
import { createElement } from 'react';
import { renderToBuffer } from '@react-pdf/renderer';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';
import { notionClient } from '@/lib/notion/client';
import { consumeAiOp } from '@/lib/ai/ops-guard';
import { brandKitFromAgent } from '@/lib/brand/kit';
import { GenericDocPDF } from '@/lib/pdf/doc';
import { triggerOutboundCall } from '@/lib/vapi/outbound';
import { ProposalPDF, LetterPDF } from '@/lib/pdf/doc';
import {
  executeSendEmail,
  executeSaveToDrive,
  executeOrganizeFiles,
  executeSearchFiles,
  executeReadFile,
  executeListCalendarEvents,
  executeCreateCalendarEvent,
  executeDeleteCalendarEvent,
} from '@/lib/services/connector-tools';
import { searchWeb, searchMultiple, buildQueries, type ResearchType } from '@/lib/search/web';
import { loadTeamCallContext } from '@/lib/voice/team-context';
import { generateFolio, STATUS_LABELS } from '@/lib/civic/folio';
import { scrapeWebsite } from '@/lib/scrape/website';
import { checkPolicy, TOOL_CAPABILITIES } from '@/lib/policies/engine';
import { SUPPORT_EMAIL, SUPPORT_WA } from '@/lib/constants';
import { generateExcel, type ExcelSheet } from '@/lib/documents/excel';
import { generateWord } from '@/lib/documents/word';
import { generateSlides, type Slide } from '@/lib/documents/slides';
import { sendEmail, bugReportHtml } from '@/lib/email/send';
import { checkOfficeInitiative } from '@/lib/initiative/detector';
import { extractChatLearnings } from '@/lib/ai/chat-learning';
import {
  enhanceTextContent,
  enhanceSlidesContent,
  peerReviewText,
  peerReviewSlides,
  isCriticalDocument,
} from '@/lib/documents/quality-enhancer';

export const dynamic = 'force-dynamic';

// ── SSRF guard ────────────────────────────────────────────────────────────────

function isPrivateUrl(rawUrl: string): boolean {
  try {
    const { protocol, hostname } = new URL(rawUrl);
    if (!['http:', 'https:'].includes(protocol)) return true;
    const h = hostname.toLowerCase().replace(/^\[|\]$/g, ''); // strip IPv6 brackets
    if (h === 'localhost' || h === '0.0.0.0' || h === '::1') return true;
    if (h.endsWith('.local') || h.endsWith('.internal') || h.endsWith('.localhost')) return true;
    const ipv4 = h.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
    if (ipv4) {
      const [a, b] = [Number(ipv4[1]), Number(ipv4[2])];
      if (a === 10) return true;
      if (a === 172 && b >= 16 && b <= 31) return true;
      if (a === 192 && b === 168) return true;
      if (a === 127) return true;
      if (a === 169 && b === 254) return true;
      if (a === 0) return true;
    }
    return false;
  } catch {
    return true;
  }
}

// ── Tool definitions ──────────────────────────────────────────────────────────

const CREATE_CONTRACT_DRAFT_TOOL: Anthropic.Tool = {
  name: 'create_contract_draft',
  description: 'Crea un borrador de contrato de prestación de servicios para un cliente específico, basado en la plantilla del negocio. Úsala cuando el dueño te pida generar un contrato para un cliente, o cuando la conversación (llamada/correo) haya resultado en un acuerdo comercial.',
  input_schema: {
    type: 'object' as const,
    properties: {
      client_name:  { type: 'string', description: 'Nombre completo del cliente o razón social' },
      client_email: { type: 'string', description: 'Correo electrónico del cliente' },
      client_rfc:   { type: 'string', description: 'RFC del cliente (si se conoce)' },
      client_phone: { type: 'string', description: 'Teléfono del cliente (si se conoce)' },
      clause_overrides: {
        type: 'array',
        description: 'Ajustes a cláusulas específicas respecto a la plantilla base',
        items: {
          type: 'object',
          properties: {
            id:      { type: 'string', description: 'ID de la cláusula (ej: vigencia, monto, pago)' },
            enabled: { type: 'boolean', description: 'Si la cláusula debe incluirse' },
            body:    { type: 'string',  description: 'Texto personalizado de la cláusula' },
          },
          required: ['id'],
        },
      },
      notes:       { type: 'string', description: 'Notas internas para el dueño sobre este contrato' },
      source_type: { type: 'string', enum: ['llamada', 'correo', 'manual'], description: 'Origen del contrato' },
      source_ref:  { type: 'string', description: 'Referencia al origen (ej: ID de llamada, asunto de correo)' },
    },
    required: [],
  },
};

const SEND_EMAIL_TOOL: Anthropic.Tool = {
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
};

const CREATE_DOCUMENT_TOOL: Anthropic.Tool = {
  name: 'create_document',
  description: 'Genera un documento PDF con branding del negocio (logo y colores). Elige el template correcto según el tipo: "proposal" para propuestas de servicios/cotizaciones, "letter" para cartas formales, "general" para cualquier otro documento. Úsala cuando el dueño pida redactar o generar cualquier documento.',
  input_schema: {
    type: 'object' as const,
    properties: {
      title:         { type: 'string', description: 'Título del documento (aparece en el encabezado)' },
      content:       { type: 'string', description: 'Contenido completo. Usa # para secciones principales y ## para subsecciones.' },
      filename:      { type: 'string', description: 'Nombre del archivo sin extensión. Usa guiones, sin espacios.' },
      template_type: { type: 'string', enum: ['general', 'proposal', 'letter'], description: '"proposal" para propuestas/cotizaciones con sección de cliente y precio destacado. "letter" para cartas formales con destinatario. "general" para cualquier otro documento.' },
      client_name:   { type: 'string', description: 'Nombre del cliente (solo para template proposal)' },
      client_email:  { type: 'string', description: 'Correo del cliente (solo para template proposal)' },
      total_price:   { type: 'string', description: 'Precio total destacado. Ej: "$50,000 MXN" (solo para template proposal)' },
      validity_days: { type: 'number', description: 'Días de validez de la propuesta (solo para template proposal)' },
      recipient_name:  { type: 'string', description: 'Nombre del destinatario (solo para template letter)' },
      recipient_email: { type: 'string', description: 'Correo del destinatario (solo para template letter)' },
    },
    required: ['title', 'content'],
  },
};

const TRIGGER_CALL_TOOL: Anthropic.Tool = {
  name: 'trigger_outbound_call',
  description: 'Realiza una llamada telefónica saliente a un número específico usando el agente de voz. Úsala cuando el dueño pida llamar a alguien.',
  input_schema: {
    type: 'object' as const,
    properties: {
      phone_number: { type: 'string', description: 'Número de teléfono con código de país. Ej: +5218113333333' },
      contact_name: { type: 'string', description: 'Nombre del contacto (opcional pero recomendado)' },
      message:      { type: 'string', description: 'Motivo de la llamada o mensaje que el agente debe transmitir' },
    },
    required: ['phone_number', 'message'],
  },
};

const SEARCH_FILES_TOOL: Anthropic.Tool = {
  name: 'search_files',
  description: 'Busca archivos en Google Drive o OneDrive del dueño del negocio. Úsala cuando el dueño pida buscar un documento o archivo en su almacenamiento en la nube.',
  input_schema: {
    type: 'object' as const,
    properties: {
      query: { type: 'string', description: 'Nombre o descripción del archivo a buscar' },
    },
    required: ['query'],
  },
};

const READ_FILE_TOOL: Anthropic.Tool = {
  name: 'read_file',
  description: 'Lee el contenido de un archivo de Google Drive o OneDrive. Úsala después de search_files cuando el dueño quiera ver el contenido de un archivo específico.',
  input_schema: {
    type: 'object' as const,
    properties: {
      file_id:   { type: 'string', description: 'ID del archivo obtenido de search_files' },
      file_name: { type: 'string', description: 'Nombre del archivo para referencia' },
      mime_type: { type: 'string', description: 'Tipo MIME del archivo (de search_files)' },
    },
    required: ['file_id', 'file_name'],
  },
};

const SEARCH_LEADS_TOOL: Anthropic.Tool = {
  name: 'search_leads',
  description: 'Busca información en internet para cualquier tipo de investigación. Usa research_type para aplicar la estrategia correcta: cada tipo tiene sus propias queries especializadas. Úsala ante cualquier consulta de investigación: "busca leads de X en Y", "investiga competidores de Z", "qué regulaciones hay para abrir una clínica", "noticias sobre el sector X".',
  input_schema: {
    type: 'object' as const,
    properties: {
      topic: {
        type: 'string',
        description: 'Qué buscar. Ej: "personas que quieren vender su casa", "despachos contables", "abrir una farmacia".',
      },
      location: {
        type: 'string',
        description: 'Ciudad o zona geográfica. Ej: "Monterrey", "CDMX". Opcional.',
      },
      keywords: {
        type: 'array',
        items: { type: 'string' },
        description: 'Palabras clave adicionales. Opcional.',
      },
      research_type: {
        type: 'string',
        enum: ['leads', 'competidores', 'mercado', 'regulaciones', 'noticias', 'general'],
        description: '"leads": rastrea web + Facebook + LinkedIn + portales de clasificados e inmuebles. "competidores": empresas del nicho con precios y servicios. "mercado": tendencias, estadísticas y oportunidades del sector. "regulaciones": permisos, leyes, normas NOM, trámites COFEPRIS/SAT/IMSS. "noticias": actividad reciente. "general": búsqueda libre. Si el dueño pide leads o prospectos usa "leads". Por defecto "general".',
      },
    },
    required: ['topic'],
  },
};

const READ_URL_TOOL: Anthropic.Tool = {
  name: 'read_url',
  description: 'Lee el contenido completo de una URL específica. Úsala después de search_leads para leer los 2-3 resultados más prometedores y obtener datos reales: contacto, precios, servicios, información detallada. No la uses en redes sociales (Facebook, LinkedIn, X/Twitter, Instagram, TikTok) que bloquean el acceso — para esas, usa el título y descripción del resultado de búsqueda.',
  input_schema: {
    type: 'object' as const,
    properties: {
      url:     { type: 'string', description: 'URL completa a leer. Ej: https://empresa.com/contacto' },
      purpose: { type: 'string', description: 'Para qué necesitas leer esta URL. Ej: "obtener datos de contacto del lead", "ver precios del competidor"' },
    },
    required: ['url'],
  },
};

const SAVE_TO_DRIVE_TOOL: Anthropic.Tool = {
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
};

const CREATE_FILE_TOOL: Anthropic.Tool = {
  name: 'create_file',
  description: 'Genera un archivo Excel (.xlsx), Word (.docx) o PowerPoint (.pptx). Úsala cuando el dueño pida crear una hoja de cálculo, tabla, reporte de datos (Excel), documento editable de texto (Word), o presentación de diapositivas (PowerPoint). Para PDFs con branding usa create_document en cambio.',
  input_schema: {
    type: 'object' as const,
    properties: {
      format:   { type: 'string', enum: ['excel', 'word', 'powerpoint'], description: '"excel" para hojas de cálculo y tablas de datos. "word" para documentos de texto editables. "powerpoint" para presentaciones de diapositivas.' },
      title:    { type: 'string', description: 'Título del documento o presentación.' },
      filename: { type: 'string', description: 'Nombre del archivo sin extensión. Usa guiones, sin espacios. Ej: reporte-ventas-julio.' },
      // Word fields
      content:        { type: 'string', description: 'Contenido del documento (solo para format=word). Usa # para secciones, ## subsecciones, - para listas, **texto** para negritas.' },
      template_type:  { type: 'string', enum: ['general', 'proposal', 'letter'], description: 'Plantilla Word: "proposal" incluye campos de cliente y precio total, "letter" incluye destinatario y fecha, "general" para cualquier otro documento.' },
      client_name:     { type: 'string', description: 'Nombre del cliente (solo format=word, template=proposal).' },
      client_email:    { type: 'string', description: 'Correo del cliente (solo format=word, template=proposal).' },
      total_price:     { type: 'string', description: 'Precio total. Ej: "$50,000 MXN" (solo format=word, template=proposal).' },
      validity_days:   { type: 'number', description: 'Días de validez de la propuesta (solo format=word, template=proposal).' },
      recipient_name:  { type: 'string', description: 'Nombre del destinatario (solo format=word, template=letter).' },
      recipient_email: { type: 'string', description: 'Correo del destinatario (solo format=word, template=letter).' },
      // Excel fields
      sheets: {
        type:        'array',
        description: 'Hojas del Excel (solo format=excel). Cada hoja tiene nombre, encabezados y filas de datos.',
        items: {
          type: 'object' as const,
          properties: {
            name:    { type: 'string', description: 'Nombre de la hoja. Ej: "Ventas", "Leads".' },
            headers: { type: 'array', items: { type: 'string' }, description: 'Nombres de las columnas.' },
            rows:    { type: 'array', items: { type: 'array', items: { type: 'string' } }, description: 'Filas de datos. Cada fila es un arreglo de valores en el mismo orden que headers.' },
          },
          required: ['name', 'headers', 'rows'],
        },
      },
      // PowerPoint fields
      slides: {
        type:        'array',
        description: 'Diapositivas (solo format=powerpoint). La primera diapositiva de portada se genera automáticamente con el title.',
        items: {
          type: 'object' as const,
          properties: {
            title:   { type: 'string', description: 'Título de la diapositiva.' },
            content: { type: 'string', description: 'Contenido: usa - para bullets, ## para subtítulos, o texto libre.' },
            notes:   { type: 'string', description: 'Notas del presentador para esta diapositiva (opcional).' },
          },
          required: ['title', 'content'],
        },
      },
    },
    required: ['format', 'title'],
  },
};

const LIST_CALENDAR_EVENTS_TOOL: Anthropic.Tool = {
  name: 'list_calendar_events',
  description: 'Consulta los eventos del calendario (Google Calendar u Outlook Calendar) del dueño en un rango de fechas. Úsala cuando te pregunten qué tienes agendado, cuándo estás disponible, o qué hay en la agenda.',
  input_schema: {
    type: 'object' as const,
    properties: {
      from: { type: 'string', description: 'Fecha y hora de inicio del rango en formato ISO 8601. Ej: "2026-07-14T00:00:00"' },
      to:   { type: 'string', description: 'Fecha y hora de fin del rango en formato ISO 8601. Ej: "2026-07-20T23:59:59"' },
    },
    required: ['from', 'to'],
  },
};

const CREATE_CALENDAR_EVENT_TOOL: Anthropic.Tool = {
  name: 'create_calendar_event',
  description: 'Crea un evento en el calendario (Google Calendar u Outlook Calendar) del dueño. Úsala cuando te pidan agendar una reunión, cita, recordatorio o cualquier evento en el calendario.',
  input_schema: {
    type: 'object' as const,
    properties: {
      title:       { type: 'string', description: 'Título del evento.' },
      start:       { type: 'string', description: 'Fecha y hora de inicio en ISO 8601 con zona horaria. Ej: "2026-07-15T10:00:00"' },
      end:         { type: 'string', description: 'Fecha y hora de fin en ISO 8601. Ej: "2026-07-15T11:00:00"' },
      description: { type: 'string', description: 'Descripción o notas del evento. Opcional.' },
      location:    { type: 'string', description: 'Lugar del evento (dirección o nombre del lugar). Opcional.' },
      attendees:   { type: 'array', items: { type: 'string' }, description: 'Lista de correos de los invitados. Opcional.' },
    },
    required: ['title', 'start', 'end'],
  },
};

const DELETE_CALENDAR_EVENT_TOOL: Anthropic.Tool = {
  name: 'delete_calendar_event',
  description: 'Elimina o cancela un evento del calendario. Úsala cuando el dueño quiera cancelar o eliminar un evento. Primero usa list_calendar_events para obtener el ID del evento.',
  input_schema: {
    type: 'object' as const,
    properties: {
      event_id: { type: 'string', description: 'ID del evento a eliminar (obtenido de list_calendar_events).' },
    },
    required: ['event_id'],
  },
};

const ORGANIZE_FILES_TOOL: Anthropic.Tool = {
  name: 'organize_files',
  description: 'Organiza archivos en Google Drive o OneDrive: lista contenido de carpetas, mueve archivos a otra carpeta, renombra archivos/carpetas, crea carpetas nuevas. Úsala cuando el dueño pida reorganizar, ordenar o reacomodar sus archivos en la nube.',
  input_schema: {
    type: 'object' as const,
    properties: {
      action: {
        type: 'string',
        enum: ['list', 'move', 'rename', 'create_folder'],
        description: '"list": lista archivos de una carpeta. "move": mueve un archivo a otra carpeta (se crea si no existe). "rename": cambia el nombre de un archivo o carpeta. "create_folder": crea una carpeta nueva.',
      },
      folder_id:      { type: 'string', description: 'ID de la carpeta a listar (action=list). Omite para listar la raíz.' },
      file_id:        { type: 'string', description: 'ID del archivo/carpeta a mover o renombrar (actions: move, rename).' },
      destination:    { type: 'string', description: 'Nombre de la carpeta destino (action=move). Se crea automáticamente si no existe.' },
      new_name:       { type: 'string', description: 'Nuevo nombre del archivo o carpeta (action=rename).' },
      folder_name:    { type: 'string', description: 'Nombre de la nueva carpeta a crear (action=create_folder).' },
    },
    required: ['action'],
  },
};

const CREATE_CIVIC_REPORT_TOOL: Anthropic.Tool = {
  name: 'create_civic_report',
  description: 'Registra un nuevo reporte ciudadano (bache, luminaria, basura, agua, ruido, etc.) y genera un folio de seguimiento. Úsala cuando alguien reporte un problema en la vía pública o servicios municipales.',
  input_schema: {
    type: 'object' as const,
    properties: {
      category:      { type: 'string', enum: ['bache', 'luminaria', 'basura', 'agua', 'ruido', 'parque', 'transporte', 'otro'], description: 'Tipo de reporte' },
      description:   { type: 'string', description: 'Descripción del problema reportado' },
      location_text: { type: 'string', description: 'Dirección, colonia o intersección donde se encuentra el problema' },
      caller_name:   { type: 'string', description: 'Nombre del ciudadano (si lo proporcionó)' },
      caller_number: { type: 'string', description: 'Número telefónico del ciudadano' },
    },
    required: ['category', 'description'],
  },
};

const LOOKUP_CIVIC_REPORT_TOOL: Anthropic.Tool = {
  name: 'lookup_civic_report',
  description: 'Consulta el estatus de uno o varios reportes ciudadanos por folio o por número de teléfono del ciudadano.',
  input_schema: {
    type: 'object' as const,
    properties: {
      folio:         { type: 'string', description: 'Número de folio del reporte. Ej: REP-2026-00001' },
      caller_number: { type: 'string', description: 'Número telefónico del ciudadano para buscar todos sus reportes' },
    },
    required: [],
  },
};

const UPDATE_CIVIC_REPORT_TOOL: Anthropic.Tool = {
  name: 'update_civic_report',
  description: 'Actualiza el estatus o las notas internas de un reporte ciudadano. Úsala cuando el dueño quiera marcar un reporte como en proceso, resuelto o cerrado.',
  input_schema: {
    type: 'object' as const,
    properties: {
      folio:  { type: 'string', description: 'Folio del reporte a actualizar. Ej: REP-2026-00001' },
      status: { type: 'string', enum: ['abierto', 'en_proceso', 'resuelto', 'cerrado'], description: 'Nuevo estatus del reporte' },
      notes:  { type: 'string', description: 'Notas internas de seguimiento' },
    },
    required: ['folio'],
  },
};

const WEB_SEARCH_TOOL: Anthropic.Tool = {
  name: 'buscar_en_web',
  description: 'Busca cualquier información en internet con una query libre. Úsala para resolver dudas, verificar datos, encontrar documentación, consultar precios, buscar proveedores, revisar horarios, leer noticias o cualquier otra necesidad de información durante una tarea. Para investigaciones de mercado, leads o prospectos usa search_leads en cambio.',
  input_schema: {
    type: 'object' as const,
    properties: {
      query: {
        type: 'string',
        description: 'Lo que quieres buscar. Escríbelo como lo escribirías en Google. Ej: "formato CFDI 4.0 requisitos 2026", "horario SAT Monterrey", "webhook Zapier cómo configurar".',
      },
    },
    required: ['query'],
  },
};

const ML_ANALIZAR_PUBLICACIONES_TOOL: Anthropic.Tool = {
  name: 'analizar_publicaciones_ml',
  description: 'Obtiene las publicaciones activas del vendedor en Mercado Libre (títulos, precios, stock, estado, links). Úsala cuando el dueño quiera revisar su catálogo, comparar precios, identificar productos sin stock o analizar su presencia en el marketplace.',
  input_schema: {
    type: 'object' as const,
    properties: {},
    required: [],
  },
};

const ML_CREAR_PUBLICACION_TOOL: Anthropic.Tool = {
  name: 'crear_publicacion_ml',
  description: 'Crea una nueva publicación en Mercado Libre para el vendedor. Úsala cuando el dueño pida publicar un producto nuevo en el marketplace.',
  input_schema: {
    type: 'object' as const,
    properties: {
      title:              { type: 'string',  description: 'Título de la publicación. Máximo 60 caracteres, descriptivo y con palabras clave.' },
      price:              { type: 'number',  description: 'Precio de venta en pesos MXN.' },
      category_id:        { type: 'string',  description: 'ID de categoría de Mercado Libre México. Ej: MLM1055 (Celulares), MLM1648 (Computadoras). Si no lo sabes, omítelo y se solicitará al dueño.' },
      available_quantity: { type: 'number',  description: 'Cantidad disponible en inventario.' },
      condition:          { type: 'string',  enum: ['new', 'used'], description: '"new" para producto nuevo, "used" para usado.' },
      listing_type_id:    { type: 'string',  description: 'Tipo de publicación. "gold_special" (recomendado), "gold_pro", "gold", "silver", "bronze", "free".' },
      description:        { type: 'string',  description: 'Descripción detallada del producto.' },
    },
    required: ['title', 'price', 'category_id', 'available_quantity'],
  },
};

const ML_ACTUALIZAR_PUBLICACION_TOOL: Anthropic.Tool = {
  name: 'actualizar_publicacion_ml',
  description: 'Actualiza precio, stock o título de una publicación existente en Mercado Libre. Úsala cuando el dueño quiera modificar datos de un producto ya publicado.',
  input_schema: {
    type: 'object' as const,
    properties: {
      item_id:            { type: 'string', description: 'ID de la publicación en ML. Empieza con "MLM". Obtenlo de analizar_publicaciones_ml.' },
      price:              { type: 'number', description: 'Nuevo precio en pesos MXN (opcional).' },
      available_quantity: { type: 'number', description: 'Nuevo stock disponible (opcional).' },
      title:              { type: 'string', description: 'Nuevo título de la publicación (opcional).' },
    },
    required: ['item_id'],
  },
};

const ML_VER_METRICAS_TOOL: Anthropic.Tool = {
  name: 'ver_metricas_ml',
  description: 'Muestra métricas de ventas y visitas del vendedor en Mercado Libre: total de publicaciones activas, visitas por ítem en los últimos 30 días y órdenes recientes pagadas. Úsala cuando el dueño quiera saber cómo va su desempeño en el marketplace.',
  input_schema: {
    type: 'object' as const,
    properties: {},
    required: [],
  },
};

const REPORT_ISSUE_TOOL: Anthropic.Tool = {
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
};

const ALL_TOOLS = [
  CREATE_CONTRACT_DRAFT_TOOL,
  SEND_EMAIL_TOOL,
  CREATE_DOCUMENT_TOOL,
  CREATE_FILE_TOOL,
  SAVE_TO_DRIVE_TOOL,
  ORGANIZE_FILES_TOOL,
  TRIGGER_CALL_TOOL,
  SEARCH_FILES_TOOL,
  READ_FILE_TOOL,
  LIST_CALENDAR_EVENTS_TOOL,
  CREATE_CALENDAR_EVENT_TOOL,
  DELETE_CALENDAR_EVENT_TOOL,
  SEARCH_LEADS_TOOL,
  READ_URL_TOOL,
  CREATE_CIVIC_REPORT_TOOL,
  LOOKUP_CIVIC_REPORT_TOOL,
  UPDATE_CIVIC_REPORT_TOOL,
  WEB_SEARCH_TOOL,
  REPORT_ISSUE_TOOL,
  ML_ANALIZAR_PUBLICACIONES_TOOL,
  ML_CREAR_PUBLICACION_TOOL,
  ML_ACTUALIZAR_PUBLICACION_TOOL,
  ML_VER_METRICAS_TOOL,
];

const SOCIAL_DOMAINS = ['facebook.com', 'linkedin.com', 'twitter.com', 'x.com', 'instagram.com', 'tiktok.com'];

// ── Route ─────────────────────────────────────────────────────────────────────

interface Params { params: Promise<{ token: string }> }

export async function POST(req: NextRequest, { params }: Params) {
  const cookie = req.cookies.get(PORTAL_COOKIE)?.value ?? '';
  const auth   = await verifySession(cookie);
  if (!auth) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const { token } = await params;

  // Rate limit per portal token (10 msgs/min)
  const limited = await rateLimit(req, limiters.agentChat, token);
  if (limited) return limited;

  const { messages, agentId } = await req.json() as {
    messages: { role: string; content: string }[];
    agentId?: string;
  };

  if (!Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json({ error: 'Invalid messages' }, { status: 400 });
  }

  // Payload size guard
  if (messages.length > 50) {
    return NextResponse.json({ error: 'Too many messages' }, { status: 400 });
  }
  const totalChars = messages.reduce((sum, m) => sum + String(m.content ?? '').length, 0);
  if (totalChars > 100_000) {
    return NextResponse.json({ error: 'Payload too large' }, { status: 413 });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'API key not configured' }, { status: 500 });
  }

  const supabase = createAdminClient();

  const { data: accountAgent } = await supabase
    .from('voice_agents')
    .select('id, portal_email')
    .eq('portal_token', token)
    .single();
  if (!accountAgent) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });

  // IDOR guard: session must belong to the same account as the URL token
  if (accountAgent.portal_email && auth.portalEmail && accountAgent.portal_email !== auth.portalEmail) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const targetQuery = agentId
    ? supabase.from('voice_agents').select('*').eq('id', agentId).eq('portal_email', accountAgent.portal_email).single()
    : supabase.from('voice_agents').select('*').eq('portal_token', token).single();
  const { data: agent } = await targetQuery;
  if (!agent) return NextResponse.json({ error: 'Agent not found' }, { status: 404 });

  const agentName = (agent.agent_name as string | null)?.trim() || 'Centinelia';
  const agentRole = (agent.role as string | null)?.trim() || null;

  // Peer agents — fetched once, used during quality review of critical documents
  const { data: peerAgents } = await supabase
    .from('voice_agents')
    .select('id, agent_name, knowledge_base, role_knowledge_base')
    .eq('portal_email', accountAgent.portal_email)
    .neq('id', agent.id)
    .limit(3);
  const peerAgent = (peerAgents ?? []).find(p =>
    ((p.knowledge_base as string | null)?.trim() ?? (p.role_knowledge_base as string | null)?.trim())
  ) ?? peerAgents?.[0] ?? null;

  const sections: string[] = [];

  sections.push([
    '# Identidad',
    `Nombre: ${agentName}`,
    `Negocio: ${agent.business_name}`,
    agentRole ? `Rol: ${agentRole}` : '',
    (agent.business_description as string | null) ? `Descripción: ${agent.business_description}` : '',
  ].filter(Boolean).join('\n'));

  if ((agent.knowledge_base as string | null)?.trim()) {
    sections.push(`# Base de conocimiento del negocio\n${agent.knowledge_base}`);
  }
  if ((agent.role_knowledge_base as string | null)?.trim()) {
    sections.push(`# Instrucciones del rol${agentRole ? ` — ${agentRole}` : ''}\n${agent.role_knowledge_base}`);
  }
  if ((agent.role_learnings as string | null)?.trim()) {
    sections.push(`# Aprendizajes del agente\n${agent.role_learnings}`);
  }

  // Account-wide agent IDs for cross-agent data visibility
  const { data: acctAgentRows } = await supabase
    .from('voice_agents')
    .select('id')
    .eq('portal_email', accountAgent.portal_email)
    .eq('active', true);
  const acctAgentIds = (acctAgentRows ?? []).map(a => a.id as string);
  if (!acctAgentIds.length) acctAgentIds.push(agent.id as string);

  const { data: calls } = await supabase
    .from('voice_calls')
    .select('caller_number, duration_seconds, summary, outcome, created_at')
    .in('agent_id', acctAgentIds)
    .order('created_at', { ascending: false })
    .limit(20);

  if (calls?.length) {
    const lines = calls.map(c => {
      const date = new Date(c.created_at as string).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
      const mins = Math.round(((c.duration_seconds as number) || 0) / 60);
      return `- ${date} | ${(c.caller_number as string) || 'Desconocido'} | ${mins}min | ${(c.outcome as string) || 'otro'} | ${(c.summary as string) || 'Sin resumen'}`;
    });
    sections.push(`# Llamadas recientes (últimas 20)\n${lines.join('\n')}`);
  }

  // Team numbers — persistent memory for specific team members, account-wide
  const teamNumbers = ((agent as any).team_numbers ?? []) as { number: string; name?: string }[];
  const teamCtx = await loadTeamCallContext(acctAgentIds, teamNumbers, supabase);
  if (teamCtx) sections.push(teamCtx);

  const { data: inbox } = await supabase
    .from('ops_inbox')
    .select('id, email_from, email_subject, category, ai_summary, status, attachments, created_at')
    .eq('agent_id', agent.id)
    .order('created_at', { ascending: false })
    .limit(10);

  if (inbox?.length) {
    const lines = inbox.map(i => {
      const date = new Date(i.created_at as string).toLocaleDateString('es-MX', { day: '2-digit', month: 'short' });
      const atts = (i.attachments as { name: string; url: string }[] | null) ?? [];
      const attStr = atts.length
        ? ` | Adjuntos: ${atts.map(a => `${a.name} → ${a.url}`).join(', ')}`
        : '';
      return `- [ID:${i.id}] ${date} | ${(i.category as string) || 'general'} | De: ${i.email_from} | ${i.email_subject} | [${i.status}] ${(i.ai_summary as string) || ''}${attStr}`;
    });
    sections.push(`# Bandeja de entrada (últimos 10)\n${lines.join('\n')}\n\nCuando menciones un adjunto, incluye la URL exacta para que el dueño pueda descargarlo.`);
  }

  const { data: meetings } = await supabase
    .from('ops_meetings')
    .select('title, participants, status, scheduled_at, summary, created_at')
    .eq('agent_id', agent.id)
    .order('created_at', { ascending: false })
    .limit(10);

  if (meetings?.length) {
    const lines = meetings.map(m => {
      const dateStr = (m.scheduled_at as string) || (m.created_at as string);
      const date = new Date(dateStr).toLocaleDateString('es-MX', { day: '2-digit', month: 'short' });
      const parts = Array.isArray(m.participants) ? (m.participants as string[]).join(', ') : '';
      return `- ${date} | ${(m.title as string) || 'Sin título'} | [${m.status}] | ${parts} | ${(m as any).summary || ''}`;
    });
    sections.push(`# Juntas recientes\n${lines.join('\n')}`);
  }

  const { data: contracts } = await supabase
    .from('ops_contracts')
    .select('name, contract_type, counterparty, expiry_date, status, notes')
    .eq('agent_id', agent.id)
    .order('expiry_date', { ascending: true })
    .limit(10);

  if (contracts?.length) {
    const lines = contracts.map(c => {
      const exp = (c.expiry_date as string)
        ? new Date(c.expiry_date as string).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })
        : 'Sin vencimiento';
      return `- ${c.name} | ${(c.contract_type as string) || 'contrato'} | ${(c.counterparty as string) || ''} | vence: ${exp} | [${c.status}] | ${(c.notes as string) || ''}`;
    });
    sections.push(`# Contratos\n${lines.join('\n')}`);
  }

  if ((agent.notion_access_token as string | null) && (agent.notion_db_id as string | null)) {
    try {
      const notion = notionClient(agent.notion_access_token as string);
      const { results } = await (notion.databases as any).query({
        database_id: agent.notion_db_id as string,
        page_size:   20,
        sorts:       [{ timestamp: 'last_edited_time', direction: 'descending' }],
      });
      if (results.length) {
        const lines = (results as any[]).map(page => {
          const p       = page.properties;
          const nombre  = p['Nombre']?.title?.[0]?.plain_text  ?? 'Sin nombre';
          const tipo    = p['Tipo']?.select?.name               ?? '';
          const fecha   = p['Fecha']?.date?.start               ?? '';
          const estado  = p['Estado']?.select?.name             ?? '';
          const resumen = p['Resumen']?.rich_text?.[0]?.plain_text ?? '';
          return `- ${fecha} | ${nombre} | ${tipo} | ${estado} | ${resumen}`;
        });
        sections.push(`# CRM Notion\n${lines.join('\n')}`);
      }
    } catch { /* Notion unavailable */ }
  }

  const context = sections.join('\n\n');

  const system = `Eres ${agentName}, el agente IA de ${agent.business_name}${agentRole ? ` con el rol de ${agentRole}` : ''}.

El dueño del negocio te está consultando directamente. Tienes acceso completo a tu operación: base de conocimiento, llamadas recientes, bandeja de entrada, juntas, contratos y CRM.

Responde como un agente inteligente que conoce profundamente el negocio. Usa los datos disponibles para dar respuestas precisas y concretas. Cita fechas y nombres cuando los tengas. Si la información no está en tu contexto, dilo con claridad.

Herramientas disponibles:
- create_contract_draft: cuando el dueño pida generar un contrato para un cliente.
- send_email: cuando el dueño pida enviar un correo. Si menciona adjuntar un archivo de Drive/OneDrive, usa attachment_file_id del resultado de search_files.
- create_document: cuando el dueño pida generar un documento PDF con branding (logo y colores del negocio). Usa template_type="proposal" para propuestas/cotizaciones, "letter" para cartas formales, "general" para todo lo demás.
- create_file: cuando el dueño pida un archivo Excel, Word o PowerPoint. Usa format="excel" para tablas y hojas de cálculo con datos estructurados (pasa sheets con headers y rows), format="word" para documentos de texto editables (mismo sistema de templates que create_document), format="powerpoint" para presentaciones de diapositivas (pasa slides con title y content cada una). El archivo queda disponible en Oficina → Documentos.
- save_to_drive: después de create_document o create_file, si el dueño quiere guardar el archivo en su Google Drive o OneDrive. Puedes sugerirlo proactivamente. Usa el file_id que devolvió el tool. Si da un folder_name, la carpeta se crea automáticamente si no existe.
- organize_files: para reorganizar Drive/OneDrive del dueño. Acciones: "list" (listar carpeta), "move" (mover archivo a otra carpeta, se crea si no existe), "rename" (renombrar archivo o carpeta), "create_folder" (crear carpeta nueva). Cuando el dueño pida ordenar archivos, empieza listando la raíz para ver qué hay, luego mueve o renombra según sus instrucciones. Cada acción consume ops.
- trigger_outbound_call: cuando el dueño pida llamar a un número de teléfono.
- search_files: cuando el dueño pida buscar un archivo en Google Drive o OneDrive.
- read_file: cuando el dueño quiera ver el contenido de un archivo de Drive o OneDrive (usar después de search_files).
- list_calendar_events: cuando el dueño quiera ver su agenda o saber qué tiene agendado en un rango de fechas.
- create_calendar_event: cuando el dueño pida agendar una reunión, cita o evento en su calendario de Google o Outlook.
- delete_calendar_event: cuando el dueño quiera cancelar o eliminar un evento del calendario. Usa list_calendar_events primero para obtener el ID.
- buscar_en_web: búsqueda rápida en internet con una query libre. Úsala para cualquier información que necesites durante una tarea: documentación, datos, precios, horarios, requisitos, instrucciones, etc. Después usa read_url en los resultados más relevantes.
- search_leads: para investigaciones de mercado especializadas. Usa research_type para elegir la estrategia: "leads" (rastrea todos los canales de prospectos), "competidores", "mercado", "regulaciones", "noticias", "general". Cada tipo lanza múltiples queries optimizadas en paralelo. Usa esta cuando la tarea sea explícitamente de prospección o inteligencia de mercado.
- read_url: después de buscar_en_web o search_leads, lee el contenido de los resultados más relevantes para obtener datos reales. No la uses en redes sociales (Facebook, LinkedIn, X, Instagram) — usan el título y descripción del resultado de búsqueda en cambio.
- reportar_falla: cuando encuentres un error, falla o comportamiento inesperado en cualquier sistema o proceso durante tu operación (correo, archivos, calendario, POS, CRM, etc.). No afecta las ops del negocio.
- analizar_publicaciones_ml: obtiene el catálogo de publicaciones activas del dueño en Mercado Libre (IDs, títulos, precios, stock, estado, links). Úsala antes de actualizar o cuando pidan revisar el catálogo.
- crear_publicacion_ml: publica un producto nuevo en Mercado Libre. Requiere title, price, category_id y available_quantity mínimo.
- actualizar_publicacion_ml: modifica precio, stock o título de una publicación existente. Usa analizar_publicaciones_ml primero para obtener el item_id.
- ver_metricas_ml: muestra resumen de desempeño en Mercado Libre: publicaciones activas, visitas 30 días y ventas recientes pagadas.

Cuando necesites información para completar una tarea: usa buscar_en_web con la query más precisa posible, luego read_url en 1-3 resultados útiles, luego actúa con lo que encontraste.
Cuando el dueño pida investigación de mercado o prospectos: usa search_leads con el research_type correcto, luego read_url en 2-3 resultados, luego presenta un resumen estructurado.

Usa las herramientas de inmediato cuando el dueño te lo pida, sin pedir confirmación adicional.

## Cuando una herramienta falla

**Error de autenticación o sesión expirada** (tokens inválidos, "not authenticated", "unauthorized", "re-authentication required", "session expired", permisos revocados): NO uses reportar_falla. Informa al dueño que la integración necesita reconectarse y dile exactamente qué hacer: ir a Integraciones en el portal y volver a conectar la plataforma afectada (Google, Outlook, OneDrive, etc.). Es un paso que el dueño resuelve solo.

**Integración no disponible o no habilitada**: Informa al dueño y sugiere que contacte a Centinelia si necesita activarla:
- Correo: ${SUPPORT_EMAIL}
- WhatsApp: ${SUPPORT_WA}

No prometas que la integración se habilitará: depende de si la plataforma lo permite.

**Error inesperado del sistema** (falla técnica real: timeout de API, error de escritura, comportamiento incorrecto de una herramienta, resultado corrupto, error al procesar archivo): usa reportar_falla para notificar al equipo de Centinelia, luego informa al dueño que detectaste un problema y que ya fue reportado.

## Autonomía y toma de decisiones

Actúa ÚNICAMENTE cuando el dueño te lo pida de forma explícita en este chat, o cuando un evento directo lo active (correo entrante, llamada registrada, tarea asignada). Nunca tomes iniciativas propias aunque identifiques algo que creas que "debería hacerse".

Si notas una situación que podría requerir acción pero nadie te lo ha pedido:
1. Si hay otros agentes en el equipo del negocio, evalúa la situación con ellos usando toda la información disponible. Si llegan a un consenso claro de que se debe actuar, aun así espera la confirmación del dueño antes de ejecutar cualquier herramienta.
2. Si estás trabajando solo sin equipo, o si los agentes no llegan a un acuerdo, usa send_email para escribirle al dueño (${(agent.portal_email as string | null) ?? 'el correo del dueño'}) con un mensaje breve: qué observaste, qué opciones ves y qué necesitas que decida. No ejecutes ninguna acción hasta recibir respuesta.

Nunca envíes correos, hagas llamadas, modifiques archivos ni ejecutes cualquier herramienta de forma autónoma sin que el dueño te lo haya pedido explícitamente en esta sesión de chat.

## Estándares de calidad para documentos
Cuando generes contenido para create_document o create_file, aplica estos principios desde la primera versión:
- Propuestas: estructura Problema → Solución → Entregables → Precio → CTA. Cuantifica beneficios. Personaliza con nombre del cliente. Cero clichés corporativos.
- Cartas: apertura con nombre completo del destinatario. Máximo 3 párrafos. CTA específico al final. Sin "Por medio de la presente".
- Presentaciones: título de cada slide = afirmación concreta, no etiqueta. Máximo 5 bullets. Una idea por slide. Datos siempre contextualizados.
- Excel: headers específicos en Title Case. Datos representativos y reales. Filas de totales cuando hay números. Hojas separadas por dataset.
- Todos: tono profesional sin sonar robótico. Elimina relleno. Cada párrafo debe ganar su lugar.

Responde en español mexicano. Sé directo — 2 a 5 oraciones a menos que se pida más detalle.

## Contexto operativo

${context}`;

  // 3 ops per initial Sonnet call
  const opsResult = await consumeAiOp(agent.id as string, 3);
  if (!opsResult.ok) {
    return NextResponse.json({ error: 'ops_limit_reached', used: opsResult.used, limit: opsResult.limit }, { status: 429 });
  }

  // Append low-ops alert to system prompt when running critically low
  const opsRemain = Math.max(0, opsResult.limit - opsResult.used);
  const opsLow    = opsResult.limit > 0 && opsRemain <= Math.max(20, opsResult.limit * 0.15);
  const systemWithAlert = opsLow
    ? system + `\n\nAVISO INTERNO DE USO: Quedan solo ${opsRemain} ops disponibles este mes (de ${opsResult.limit}). AL INICIO DE ESTA RESPUESTA, antes de atender lo que pida el dueño, menciona brevemente en una sola frase que las ops están casi agotadas y que puede comprar más desde Cuenta → Minutos y uso. Luego responde normalmente.`
    : system;

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  function lastUserText(msgs: Anthropic.MessageParam[]): string {
    for (let i = msgs.length - 1; i >= 0; i--) {
      const m = msgs[i];
      if (m.role !== 'user') continue;
      if (typeof m.content === 'string') return m.content;
      if (Array.isArray(m.content)) {
        return (m.content as { type: string; text?: string }[])
          .filter(b => b.type === 'text').map(b => b.text ?? '').join(' ');
      }
    }
    return '';
  }

  type AssistantBlock =
    | { type: 'text'; text: string }
    | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> };

  const readable = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder();
      const send = (text: string) =>
        controller.enqueue(enc.encode(`data: ${JSON.stringify({ text })}\n\n`));

      try {
        let conversationMessages: Anthropic.MessageParam[] = (
          messages as { role: 'user' | 'assistant'; content: string }[]
        ).slice(-20);

        let readUrlCount = 0;
        let callCount    = 0;
        const MAX_CALLS  = 6;

        while (callCount < MAX_CALLS) {
          // Charge 2 ops for every call after the first (first was charged above)
          if (callCount > 0) {
            const midOps = await consumeAiOp(agent.id as string, 2);
            if (!midOps.ok) break;
          }
          callCount++;

          const stream = client.messages.stream({
            model:      'claude-sonnet-4-6',
            max_tokens: 2048,
            system:     callCount === 1 ? systemWithAlert : system,
            tools:      ALL_TOOLS,
            messages:   conversationMessages,
          });

          const assistantBlocks: AssistantBlock[] = [];
          let toolInputBuffer  = '';
          let pendingToolId:   string | null = null;
          let pendingToolName: string | null = null;
          let didToolUse = false;

          for await (const chunk of stream) {
            if (chunk.type === 'content_block_start') {
              if (chunk.content_block.type === 'text') {
                assistantBlocks.push({ type: 'text', text: '' });
              } else if (chunk.content_block.type === 'tool_use') {
                pendingToolId   = chunk.content_block.id;
                pendingToolName = chunk.content_block.name;
                toolInputBuffer = '';
                assistantBlocks.push({ type: 'tool_use', id: chunk.content_block.id, name: chunk.content_block.name, input: {} });
              }
            } else if (chunk.type === 'content_block_delta') {
              if (chunk.delta.type === 'text_delta') {
                send(chunk.delta.text);
                const last = assistantBlocks.at(-1);
                if (last?.type === 'text') last.text += chunk.delta.text;
              } else if (chunk.delta.type === 'input_json_delta') {
                toolInputBuffer += chunk.delta.partial_json;
              }
            } else if (chunk.type === 'content_block_stop' && pendingToolId) {
              try {
                const parsed = JSON.parse(toolInputBuffer) as Record<string, unknown>;
                const last = assistantBlocks.at(-1);
                if (last?.type === 'tool_use') last.input = parsed;
              } catch { /* malformed — keep empty input */ }
            } else if (
              chunk.type === 'message_delta' &&
              chunk.delta.stop_reason === 'tool_use' &&
              pendingToolId
            ) {
              didToolUse = true;
            }
          }

          // No tool use → text was already streamed, we're done
          if (!didToolUse) break;

          const toolInput = (() => {
            try { return JSON.parse(toolInputBuffer) as Record<string, unknown>; }
            catch { return {} as Record<string, unknown>; }
          })();
          const lastBlock = assistantBlocks.at(-1);
          if (lastBlock?.type === 'tool_use') lastBlock.input = toolInput;

          // ── Execute the requested tool ────────────────────────────────────
          let toolResult: unknown;

          // ── Policy check for capability-gated tools ───────────────────────
          const toolCapability = pendingToolName ? TOOL_CAPABILITIES[pendingToolName] : undefined;
          let policyBlocked = false;
          if (toolCapability) {
            const policy = await checkPolicy({
              agentId:    agent.id as string,
              capability: toolCapability,
              action:     `${toolCapability}.${pendingToolName}`,
              supabase,
            });
            if (!policy.allowed) {
              toolResult    = { ok: false, error: policy.message };
              policyBlocked = true;
            }
          }

          if (pendingToolName === 'read_url') {
            const url = toolInput.url as string;
            if (readUrlCount >= 3) {
              toolResult = { ok: false, error: 'Límite de 3 lecturas por investigación alcanzado.' };
            } else if (isPrivateUrl(url)) {
              toolResult = { ok: false, error: 'URL no permitida.' };
            } else if (SOCIAL_DOMAINS.some(d => url.includes(d))) {
              toolResult = { ok: false, error: 'Red social detectada — bloquean scrapers. Usa el título y descripción del resultado de búsqueda en cambio.' };
            } else {
              readUrlCount++;
              const content = await scrapeWebsite(url);
              toolResult = content
                ? { ok: true, url, content, chars: content.length }
                : { ok: false, url, error: 'No se pudo leer este sitio (timeout o acceso bloqueado).' };
            }

          } else if (pendingToolName === 'create_contract_draft') {
            const { data: tpl } = await supabase
              .from('contract_templates').select('clauses').eq('agent_id', agent.id).single();

            const DEFAULT_CLAUSE_IDS = ['partes','objeto','vigencia','contraprestacion','pago','confidencialidad','propiedad','responsabilidad','terminacion','jurisdiccion','aceptacion'];
            type Clause = { id: string; title: string; body: string; required: boolean; enabled: boolean };
            let baseClauses: Clause[] = (tpl?.clauses as Clause[] | null) ?? [];

            if (!baseClauses.length) {
              baseClauses = DEFAULT_CLAUSE_IDS.map(id => ({
                id, title: id.toUpperCase(), body: '', required: ['partes','objeto','vigencia','contraprestacion','jurisdiccion','aceptacion'].includes(id), enabled: true,
              }));
            }

            const overrides = (toolInput.clause_overrides ?? []) as { id: string; enabled?: boolean; body?: string }[];
            const finalClauses = baseClauses.map(c => {
              const ov = overrides.find(o => o.id === c.id);
              if (!ov) return c;
              return {
                ...c,
                ...(ov.enabled !== undefined && !c.required ? { enabled: ov.enabled } : {}),
                ...(ov.body !== undefined ? { body: ov.body } : {}),
              };
            });

            const { data: draft, error: draftError } = await supabase
              .from('contract_drafts')
              .insert({
                agent_id:     agent.id,
                client_name:  (toolInput.client_name  as string | null) ?? null,
                client_email: (toolInput.client_email as string | null) ?? null,
                client_rfc:   (toolInput.client_rfc   as string | null) ?? null,
                client_phone: (toolInput.client_phone as string | null) ?? null,
                clauses:      finalClauses,
                notes:        (toolInput.notes        as string | null) ?? null,
                source_type:  (toolInput.source_type  as string | null) ?? 'llamada',
                source_ref:   (toolInput.source_ref   as string | null) ?? null,
                status:       'borrador',
              })
              .select('id')
              .single();

            toolResult = draftError
              ? { ok: false, error: draftError.message }
              : { ok: true, draft_id: draft!.id, message: `Borrador creado correctamente con ID ${draft!.id}. El dueño puede verlo en la sección Contratos → Borradores de la Oficina.` };

          } else if (!policyBlocked && pendingToolName === 'send_email') {
            toolResult = await executeSendEmail({
              agentId:      agent.id as string,
              to:           toolInput.to          as string,
              subject:      toolInput.subject      as string,
              body:         toolInput.body         as string,
              businessName: agent.business_name   as string,
              cc:           toolInput.cc           as string | undefined,
              attFileId:    toolInput.attachment_file_id   as string | undefined,
              attFileName:  toolInput.attachment_file_name as string | undefined,
              attMimeType:  toolInput.attachment_mime_type as string | undefined,
            }, supabase);

          } else if (pendingToolName === 'create_document') {
            try {
              const brand        = brandKitFromAgent(agent as Record<string, unknown>);
              const title        = toolInput.title         as string;
              const templateType = (toolInput.template_type as string | undefined) ?? 'general';
              const slug         = ((toolInput.filename as string | null) ?? title)
                .toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').slice(0, 40);
              const filename = `${slug}-${Date.now()}.pdf`;
              const path     = `${agent.id}/${filename}`;

              // ── Quality pipeline ─────────────────────────────────────────────
              const userInstruction = lastUserText(conversationMessages);
              const businessCtx     = [agent.knowledge_base, agent.role_knowledge_base].filter(Boolean).join('\n').slice(0, 1200) as string;
              let content = toolInput.content as string;

              const enhanceOps = await consumeAiOp(agent.id as string, 1);
              if (enhanceOps.ok) {
                content = await enhanceTextContent({
                  format: 'pdf', templateType, content, userInstruction,
                  businessName: agent.business_name as string,
                  businessContext: businessCtx,
                });

                if (isCriticalDocument('pdf', templateType) && peerAgent) {
                  const reviewOps = await consumeAiOp(agent.id as string, 1);
                  if (reviewOps.ok) {
                    const peerKb = [peerAgent.knowledge_base, peerAgent.role_knowledge_base].filter(Boolean).join('\n') as string;
                    content = await peerReviewText({
                      content, format: 'pdf', templateType, userInstruction,
                      businessName: agent.business_name as string,
                      peerName: (peerAgent.agent_name as string | null) ?? 'Agente',
                      peerKb,
                    });
                  }
                }
              }
              // ────────────────────────────────────────────────────────────────

              let pdfElement: React.ReactElement;
              if (templateType === 'proposal') {
                pdfElement = createElement(ProposalPDF, {
                  brand, title, content,
                  clientName:   toolInput.client_name   as string | undefined,
                  clientEmail:  toolInput.client_email  as string | undefined,
                  totalPrice:   toolInput.total_price   as string | undefined,
                  validityDays: toolInput.validity_days as number | undefined,
                });
              } else if (templateType === 'letter') {
                pdfElement = createElement(LetterPDF, {
                  brand, content,
                  recipientName:  toolInput.recipient_name  as string | undefined,
                  recipientEmail: toolInput.recipient_email as string | undefined,
                });
              } else {
                pdfElement = createElement(GenericDocPDF, { brand, title, content });
              }

              const pdfBuffer = await renderToBuffer(pdfElement as any);

              const { error: uploadErr } = await supabase.storage
                .from('agent-documents')
                .upload(path, pdfBuffer, { contentType: 'application/pdf', upsert: true });

              if (uploadErr) {
                toolResult = { ok: false, error: `Error al subir el documento: ${uploadErr.message}` };
              } else {
                const { data: signed } = await supabase.storage
                  .from('agent-documents')
                  .createSignedUrl(path, 3600);

                // Persist record so document is accessible for 30 days from Oficina → Documentos
                const { error: docErr } = await supabase.from('ops_documents').insert({
                  agent_id:      agent.id,
                  title,
                  filename,
                  storage_path:  path,
                  template_type: templateType,
                  expires_at:    new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
                });
                if (docErr) console.error('[agent-chat] ops_documents insert failed:', docErr.message);

                toolResult = {
                  ok:        true,
                  url:       signed?.signedUrl ?? null,
                  file_id:   path,
                  filename:  filename,
                  mime_type: 'application/pdf',
                  message:   `Documento "${title}" generado como PDF. URL de descarga (válida 1 hora): ${signed?.signedUrl}. El documento también quedó guardado en Oficina → Documentos por 30 días.`,
                };
              }
            } catch (err) {
              toolResult = { ok: false, error: `Error al generar el documento: ${String(err)}` };
            }

          } else if (pendingToolName === 'create_file') {
            try {
              const format       = toolInput.format   as 'excel' | 'word' | 'powerpoint';
              const fileTitle    = toolInput.title     as string;
              const slug         = ((toolInput.filename as string | null) ?? fileTitle)
                .toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').slice(0, 40);

              let fileBuffer: Buffer;
              let ext: string;
              let mimeType: string;
              let label: string;

              const brand     = brandKitFromAgent(agent as Record<string, unknown>);
              const accentHex = (brand as any).primaryColor ?? '#6C3BFF';

              // Quality pipeline context
              const userInstructionF = lastUserText(conversationMessages);
              const businessCtxF     = [agent.knowledge_base, agent.role_knowledge_base].filter(Boolean).join('\n').slice(0, 1200) as string;

              if (format === 'excel') {
                const rawSheets = (toolInput.sheets as ExcelSheet[] | null) ?? [{
                  name: fileTitle.slice(0, 31),
                  headers: ['Sin datos'],
                  rows:    [['El agente no proporcionó datos para la hoja.']],
                }];
                fileBuffer = generateExcel(rawSheets);
                ext      = 'xlsx';
                mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
                label    = 'Excel';

              } else if (format === 'word') {
                const templateType = (toolInput.template_type as 'general' | 'proposal' | 'letter' | undefined) ?? 'general';
                let wordContent    = (toolInput.content as string | null) ?? '';

                // ── Quality pipeline (Word) ─────────────────────────────────
                const wordEnhOps = await consumeAiOp(agent.id as string, 1);
                if (wordEnhOps.ok) {
                  wordContent = await enhanceTextContent({
                    format: 'word', templateType, content: wordContent, userInstruction: userInstructionF,
                    businessName: agent.business_name as string,
                    businessContext: businessCtxF,
                  });

                  if (isCriticalDocument('word', templateType) && peerAgent) {
                    const wordRevOps = await consumeAiOp(agent.id as string, 1);
                    if (wordRevOps.ok) {
                      const peerKb = [peerAgent.knowledge_base, peerAgent.role_knowledge_base].filter(Boolean).join('\n') as string;
                      wordContent = await peerReviewText({
                        content: wordContent, format: 'word', templateType, userInstruction: userInstructionF,
                        businessName: agent.business_name as string,
                        peerName: (peerAgent.agent_name as string | null) ?? 'Agente',
                        peerKb,
                      });
                    }
                  }
                }
                // ────────────────────────────────────────────────────────────

                fileBuffer = await generateWord({
                  title:         fileTitle,
                  content:       wordContent,
                  templateType,
                  businessName:  agent.business_name as string | undefined,
                  accentColor:   accentHex,
                  clientName:    toolInput.client_name    as string | undefined,
                  clientEmail:   toolInput.client_email   as string | undefined,
                  totalPrice:    toolInput.total_price    as string | undefined,
                  validityDays:  toolInput.validity_days  as number | undefined,
                  recipientName:  toolInput.recipient_name  as string | undefined,
                  recipientEmail: toolInput.recipient_email as string | undefined,
                });
                ext      = 'docx';
                mimeType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
                label    = 'Word';

              } else {
                let finalSlides = (toolInput.slides as Slide[] | null) ?? [{
                  title:   'Contenido',
                  content: 'El agente no proporcionó diapositivas.',
                }];

                // ── Quality pipeline (PowerPoint) ───────────────────────────
                const pptEnhOps = await consumeAiOp(agent.id as string, 1);
                if (pptEnhOps.ok) {
                  finalSlides = await enhanceSlidesContent({
                    slides: finalSlides, userInstruction: userInstructionF,
                    businessName: agent.business_name as string,
                    businessContext: businessCtxF,
                  });

                  if (peerAgent) {
                    const pptRevOps = await consumeAiOp(agent.id as string, 1);
                    if (pptRevOps.ok) {
                      const peerKb = [peerAgent.knowledge_base, peerAgent.role_knowledge_base].filter(Boolean).join('\n') as string;
                      finalSlides = await peerReviewSlides({
                        slides: finalSlides, userInstruction: userInstructionF,
                        businessName: agent.business_name as string,
                        peerName: (peerAgent.agent_name as string | null) ?? 'Agente',
                        peerKb,
                      });
                    }
                  }
                }
                // ────────────────────────────────────────────────────────────

                fileBuffer = await generateSlides({
                  title:        fileTitle,
                  slides:       finalSlides,
                  businessName: agent.business_name as string | undefined,
                  accentColor:  accentHex,
                });
                ext      = 'pptx';
                mimeType = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
                label    = 'PowerPoint';
              }

              const filename = `${slug}-${Date.now()}.${ext}`;
              const path     = `${agent.id}/${filename}`;

              const { error: uploadErr } = await supabase.storage
                .from('agent-documents')
                .upload(path, fileBuffer, { contentType: mimeType, upsert: true });

              if (uploadErr) {
                toolResult = { ok: false, error: `Error al subir el archivo: ${uploadErr.message}` };
              } else {
                const { data: signed } = await supabase.storage
                  .from('agent-documents')
                  .createSignedUrl(path, 3600);

                await supabase.from('ops_documents').insert({
                  agent_id:      agent.id,
                  title:         fileTitle,
                  filename,
                  storage_path:  path,
                  template_type: format,
                  expires_at:    new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
                });

                toolResult = {
                  ok:        true,
                  url:       signed?.signedUrl ?? null,
                  file_id:   path,
                  filename,
                  mime_type: mimeType,
                  message:   `Archivo ${label} "${fileTitle}" generado. URL de descarga (válida 1 hora): ${signed?.signedUrl}. También disponible en Oficina → Documentos por 30 días.`,
                };
              }
            } catch (err) {
              toolResult = { ok: false, error: `Error al generar el archivo: ${String(err)}` };
            }

          } else if (!policyBlocked && pendingToolName === 'trigger_outbound_call') {
            const phone  = toolInput.phone_number as string;
            const name   = (toolInput.contact_name as string | null) ?? undefined;
            const motivo = toolInput.message as string;

            if (!(agent.features as any)?.outbound_calls) {
              toolResult = { ok: false, error: 'Las llamadas salientes no están habilitadas para este agente. Actívalas desde el portal en Llamadas → Salientes.' };
            } else if (!agent.vapi_agent_id) {
              toolResult = { ok: false, error: 'El agente no está sincronizado con Vapi. Usa el botón Resincronizar en el portal.' };
            } else {
              const callResult = await triggerOutboundCall({
                agent:          agent as any,
                customerNumber: phone,
                customerName:   name,
                motivo,
              });
              toolResult = callResult.ok
                ? { ok: true, callId: callResult.callId, message: `Llamada iniciada a ${phone}${name ? ` (${name})` : ''}. ID de llamada: ${callResult.callId}` }
                : { ok: false, error: callResult.error };
            }

          } else if (!policyBlocked && pendingToolName === 'save_to_drive') {
            toolResult = await executeSaveToDrive(
              agent.id     as string,
              toolInput.file_id    as string,
              toolInput.filename   as string,
              toolInput.folder_name as string | undefined,
              supabase,
            );

          } else if (!policyBlocked && pendingToolName === 'organize_files') {
            toolResult = await executeOrganizeFiles(
              agent.id as string,
              {
                action:      toolInput.action      as string,
                folderId:    toolInput.folder_id   as string | undefined,
                fileId:      toolInput.file_id     as string | undefined,
                destination: toolInput.destination as string | undefined,
                newName:     toolInput.new_name    as string | undefined,
                folderName:  toolInput.folder_name as string | undefined,
              },
              supabase,
            );

          } else if (!policyBlocked && pendingToolName === 'search_files') {
            toolResult = await executeSearchFiles(
              agent.id as string,
              toolInput.query as string,
              supabase,
            );

          } else if (!policyBlocked && pendingToolName === 'read_file') {
            toolResult = await executeReadFile(
              agent.id as string,
              toolInput.file_id  as string,
              toolInput.file_name as string,
              (toolInput.mime_type as string | undefined) ?? '',
              supabase,
            );

          } else if (!policyBlocked && pendingToolName === 'list_calendar_events') {
            toolResult = await executeListCalendarEvents(
              agent.id as string,
              new Date(toolInput.from as string),
              new Date(toolInput.to   as string),
              supabase,
            );

          } else if (!policyBlocked && pendingToolName === 'create_calendar_event') {
            toolResult = await executeCreateCalendarEvent(
              agent.id as string,
              {
                title:       toolInput.title       as string,
                start:       toolInput.start       as string,
                end:         toolInput.end         as string,
                description: toolInput.description as string | undefined,
                location:    toolInput.location    as string | undefined,
                attendees:   toolInput.attendees   as string[] | undefined,
              },
              supabase,
            );

          } else if (!policyBlocked && pendingToolName === 'delete_calendar_event') {
            toolResult = await executeDeleteCalendarEvent(
              agent.id as string,
              toolInput.event_id as string,
              supabase,
            );

          } else if (pendingToolName === 'buscar_en_web') {
            if (!process.env.BRAVE_SEARCH_API_KEY) {
              toolResult = { ok: false, error: 'Búsqueda web no configurada.' };
            } else {
              const query   = toolInput.query as string;
              const results = await searchWeb(query, 10);
              if (!results.length) {
                toolResult = { ok: true, results: [], message: `No encontré resultados para: "${query}". Intenta con otras palabras clave.` };
              } else {
                const list = results.slice(0, 10).map((r, i) =>
                  `${i + 1}. **${r.title}**\n   ${r.url}\n   ${r.description}`
                ).join('\n\n');
                toolResult = { ok: true, count: results.length, results: results.slice(0, 10), message: `${results.length} resultado(s) para "${query}":\n\n${list}` };
              }
            }

          } else if (pendingToolName === 'search_leads') {
            if (!process.env.BRAVE_SEARCH_API_KEY) {
              toolResult = { ok: false, error: 'Búsqueda web no configurada. Agrega BRAVE_SEARCH_API_KEY al entorno.' };
            } else {
              const topic        = toolInput.topic         as string;
              const location     = (toolInput.location     as string | undefined) ?? '';
              const keywords     = (toolInput.keywords     as string[] | undefined) ?? [];
              const researchType = ((toolInput.research_type as string | undefined) ?? 'general') as ResearchType;

              const queries = buildQueries(topic, location, researchType, keywords, {
                name:        agent.business_name as string,
                description: (agent.business_description as string | null) ?? undefined,
              });
              const results = await searchMultiple(queries, 8);

              if (!results.length) {
                toolResult = { ok: true, leads: [], message: `No encontré resultados para "${topic}"${location ? ` en ${location}` : ''}. Intenta con palabras clave diferentes o amplía la zona.` };
              } else {
                const leadsText = results.slice(0, 20).map((r, i) =>
                  `${i + 1}. **${r.title}**\n   ${r.url}\n   ${r.description}`
                ).join('\n\n');
                toolResult = {
                  ok:    true,
                  count: results.length,
                  leads: results.slice(0, 20),
                  message: `Encontré ${results.length} resultado(s) para "${topic}"${location ? ` en ${location}` : ''}. Ahora lee los 2-3 más prometedores con read_url para obtener información detallada.\n\n${leadsText}`,
                };
              }
            }

          } else if (pendingToolName === 'create_civic_report') {
            const { category, description, location_text, caller_name, caller_number } = toolInput as {
              category?: string; description?: string; location_text?: string; caller_name?: string; caller_number?: string;
            };
            const folio = await generateFolio(agent.id as string, supabase);
            const { error: crErr } = await supabase.from('civic_reports').insert({
              agent_id:      agent.id,
              folio,
              category:      category      ?? 'otro',
              description:   description   ?? null,
              location_text: location_text ?? null,
              caller_name:   caller_name   ?? null,
              caller_number: caller_number ?? null,
              status:        'abierto',
            });
            toolResult = crErr
              ? { ok: false, error: 'No se pudo registrar el reporte.' }
              : { ok: true, folio, message: `Reporte registrado con folio ${folio}.` };

          } else if (pendingToolName === 'lookup_civic_report') {
            const { folio: qFolio, caller_number: qPhone } = toolInput as { folio?: string; caller_number?: string };
            if (!qFolio && !qPhone) {
              toolResult = { ok: false, error: 'Proporciona folio o número de teléfono.' };
            } else {
              let q = supabase.from('civic_reports').select('folio,category,description,location_text,status,notes,created_at').eq('agent_id', agent.id as string);
              if (qFolio)  q = q.eq('folio', qFolio.toUpperCase());
              else         q = (q as any).eq('caller_number', qPhone).order('created_at', { ascending: false }).limit(5);
              const { data: rpts } = await q;
              const list = rpts ?? [];
              if (!list.length) {
                toolResult = { ok: true, reports: [], message: 'No se encontraron reportes.' };
              } else {
                const lines = (list as any[]).map(r => `${r.folio} | ${r.category} | ${STATUS_LABELS[r.status as keyof typeof STATUS_LABELS] ?? r.status} | ${r.description ?? ''}`);
                toolResult = { ok: true, reports: list, message: `${list.length} reporte(s) encontrado(s):\n${lines.join('\n')}` };
              }
            }

          } else if (pendingToolName === 'update_civic_report') {
            const { folio: uFolio, status: uStatus, notes: uNotes } = toolInput as { folio: string; status?: string; notes?: string };
            const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
            if (uStatus) { updates.status = uStatus; if (uStatus === 'resuelto' || uStatus === 'cerrado') updates.resolved_at = new Date().toISOString(); }
            if (uNotes !== undefined) updates.notes = uNotes;
            const { error: upErr } = await supabase.from('civic_reports').update(updates).eq('agent_id', agent.id as string).eq('folio', uFolio.toUpperCase());
            toolResult = upErr
              ? { ok: false, error: 'No se pudo actualizar el reporte.' }
              : { ok: true, message: `Reporte ${uFolio} actualizado correctamente.` };

          } else if (pendingToolName === 'reportar_falla') {
            const tipo        = (toolInput.tipo        as string | null) ?? 'Detectado por agente';
            const descripcion = (toolInput.descripcion as string | null) ?? '';
            const contexto    = (toolInput.contexto    as string | null) ?? null;

            if (descripcion.trim()) {
              const fullDescription = contexto
                ? `${descripcion.trim()}\n\nContexto:\n${contexto.trim()}`
                : descripcion.trim();
              const to = process.env.NEXT_PUBLIC_SUPPORT_EMAIL ?? 'hola@centinelia.mx';
              await sendEmail({
                to,
                subject: `Reporte de falla (ops): ${agentName} — ${agent.business_name}`,
                html: bugReportHtml({
                  businessName:  agent.business_name  as string,
                  reporterName:  agentName,
                  reporterEmail: (agent.client_email  as string | null) ?? '',
                  category:      tipo,
                  description:   fullDescription,
                }),
              });
            }
            toolResult = { ok: true, message: 'Reporte de falla enviado al equipo de Centinelia.' };

          } else if (pendingToolName === 'analizar_publicaciones_ml') {
            const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.centinelia.mx';
            const res = await fetch(`${appUrl}/api/portal/${token}/integrations/ml/listings`, {
              headers: { Cookie: `${PORTAL_COOKIE}=${req.cookies.get(PORTAL_COOKIE)?.value ?? ''}` },
            });
            if (!res.ok) {
              toolResult = { ok: false, error: 'Mercado Libre no conectado. El dueño debe conectarlo desde Integraciones en el portal.' };
            } else {
              const data = await res.json() as { items: unknown[] };
              const items = data.items ?? [];
              if (!items.length) {
                toolResult = { ok: true, items: [], message: 'No hay publicaciones activas en Mercado Libre.' };
              } else {
                const lines = (items as Array<Record<string, unknown>>).map(i =>
                  `- [${i.id}] ${i.title} | Precio: $${i.price} MXN | Stock: ${i.available_quantity} | Estado: ${i.status} | ${i.permalink}`
                ).join('\n');
                toolResult = { ok: true, items, message: `${items.length} publicación(es) encontrada(s):\n${lines}` };
              }
            }

          } else if (pendingToolName === 'crear_publicacion_ml') {
            const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.centinelia.mx';
            const res = await fetch(`${appUrl}/api/portal/${token}/integrations/ml/items`, {
              method:  'POST',
              headers: {
                'Content-Type': 'application/json',
                Cookie: `${PORTAL_COOKIE}=${req.cookies.get(PORTAL_COOKIE)?.value ?? ''}`,
              },
              body: JSON.stringify(toolInput),
            });
            if (!res.ok) {
              const errData = await res.json().catch(() => ({})) as { error?: string };
              toolResult = { ok: false, error: errData.error ?? 'No se pudo crear la publicación en Mercado Libre.' };
            } else {
              const data = await res.json() as { item: Record<string, unknown> };
              toolResult = {
                ok: true,
                item: data.item,
                message: `Publicación creada correctamente en Mercado Libre. ID: ${data.item?.id}. Ver: ${data.item?.permalink}`,
              };
            }

          } else if (pendingToolName === 'actualizar_publicacion_ml') {
            const itemId = toolInput.item_id as string;
            if (!itemId) {
              toolResult = { ok: false, error: 'Se requiere item_id para actualizar la publicación.' };
            } else {
              const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.centinelia.mx';
              const payload: Record<string, unknown> = {};
              if (toolInput.price              !== undefined) payload.price              = toolInput.price;
              if (toolInput.available_quantity !== undefined) payload.available_quantity = toolInput.available_quantity;
              if (toolInput.title              !== undefined) payload.title              = toolInput.title;
              const res = await fetch(`${appUrl}/api/portal/${token}/integrations/ml/items/${itemId}`, {
                method:  'PUT',
                headers: {
                  'Content-Type': 'application/json',
                  Cookie: `${PORTAL_COOKIE}=${req.cookies.get(PORTAL_COOKIE)?.value ?? ''}`,
                },
                body: JSON.stringify(payload),
              });
              if (!res.ok) {
                const errData = await res.json().catch(() => ({})) as { error?: string };
                toolResult = { ok: false, error: errData.error ?? 'No se pudo actualizar la publicación.' };
              } else {
                toolResult = { ok: true, message: `Publicación ${itemId} actualizada correctamente en Mercado Libre.` };
              }
            }

          } else if (pendingToolName === 'ver_metricas_ml') {
            const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.centinelia.mx';
            const res = await fetch(`${appUrl}/api/portal/${token}/integrations/ml/metrics`, {
              headers: { Cookie: `${PORTAL_COOKIE}=${req.cookies.get(PORTAL_COOKIE)?.value ?? ''}` },
            });
            if (!res.ok) {
              toolResult = { ok: false, error: 'Mercado Libre no conectado. El dueño debe conectarlo desde Integraciones en el portal.' };
            } else {
              const data = await res.json() as {
                item_count: number;
                visits: unknown;
                recent_orders: Array<Record<string, unknown>>;
                period: { from: string; to: string };
              };
              const orders     = data.recent_orders ?? [];
              const totalSales = orders.reduce((sum, o) => sum + ((o.total_amount as number) ?? 0), 0);
              const orderLines = orders.slice(0, 5).map(o =>
                `- Orden #${o.id} | $${o.total_amount} MXN | ${o.status} | ${o.date_created}`
              ).join('\n');
              toolResult = {
                ok: true,
                data,
                message: [
                  `Métricas de Mercado Libre (${data.period?.from} al ${data.period?.to}):`,
                  `- Publicaciones activas: ${data.item_count}`,
                  `- Ventas recientes pagadas: ${orders.length} pedidos | Total: $${totalSales.toFixed(2)} MXN`,
                  orders.length ? `\nÚltimos pedidos:\n${orderLines}` : '',
                  data.visits ? `\nDatos de visitas disponibles para ${data.item_count} publicación(es).` : '',
                ].filter(Boolean).join('\n'),
              };
            }

          } else {
            toolResult = { ok: false, error: `Herramienta desconocida: ${pendingToolName}` };
          }

          // Extend conversation with this tool turn
          conversationMessages = [
            ...conversationMessages,
            { role: 'assistant' as const, content: assistantBlocks as Anthropic.ContentBlock[] },
            { role: 'user' as const, content: [{ type: 'tool_result' as const, tool_use_id: pendingToolId!, content: JSON.stringify(toolResult) }] },
          ];
        }

        controller.enqueue(enc.encode('data: [DONE]\n\n'));
      } catch {
        controller.enqueue(
          enc.encode(`data: ${JSON.stringify({ error: 'Error generando respuesta' })}\n\n`)
        );
      } finally {
        controller.close();
        // Fire office initiative check + chat learning after session ends (fire-and-forget)
        const _agentId    = agent.id as string;
        const _agentName  = (agent.agent_name as string | null)?.trim() || (agent.business_name as string) || 'tu empleado';
        const _agentRole  = (agent.role as string | null)?.trim() || '';
        const _transferWa = (agent.transfer_whatsapp as string | null) ?? null;
        const _portalEmail = (agent.portal_email as string | null) ?? null;
        if (_transferWa) {
          checkOfficeInitiative(_agentId, _agentName, _transferWa).catch(
            err => console.error('[agent-chat] initiative check failed:', err),
          );
        }
        extractChatLearnings({
          agentId:     _agentId,
          portalEmail: _portalEmail,
          agentName:   _agentName,
          agentRole:   _agentRole,
          messages:    (messages as Array<{ role: 'user' | 'assistant'; content: string | unknown }>),
        }).catch(err => console.error('[agent-chat] chat-learning failed:', err));
      }
    },
  });

  return new Response(readable, {
    headers: {
      'Content-Type':  'text/event-stream',
      'Cache-Control': 'no-cache',
    },
  });
}
