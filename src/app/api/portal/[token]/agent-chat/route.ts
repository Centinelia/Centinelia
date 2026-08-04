import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { executeAgentTool, type ReadUrlCounter } from '@/lib/tools/executor';
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
import { FacturaPdf } from '@/lib/pdf/factura';
import { OrdenCompraPdf } from '@/lib/pdf/orden-compra';
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
import { getQBClient } from '@/lib/qb/client';
import { SUPPORT_EMAIL, SUPPORT_WA } from '@/lib/constants';
import { generateExcel, type ExcelSheet } from '@/lib/documents/excel';
import { generateWord } from '@/lib/documents/word';
import { generateSlides, type Slide } from '@/lib/documents/slides';
import { sendEmail, bugReportHtml } from '@/lib/email/send';
import { checkOfficeInitiative } from '@/lib/initiative/detector';
import { extractChatLearnings } from '@/lib/ai/chat-learning';
import { getKnowledgeBase } from '@/lib/knowledge-base';
import { MEERKAT_VOICE_DISTRIBUTION } from '@/lib/vapi/sync';
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
  description: 'Genera un documento PDF con branding del negocio (logo y colores). Elige el template correcto según el tipo: "proposal" para propuestas de servicios/cotizaciones, "letter" para cartas formales, "factura" para facturas con conceptos e IVA (usa items[]), "orden_compra" para órdenes de compra a proveedores (usa items[]), "general" para cualquier otro documento.',
  input_schema: {
    type: 'object' as const,
    properties: {
      title:         { type: 'string', description: 'Título del documento (aparece en el encabezado)' },
      content:       { type: 'string', description: 'Contenido completo. Usa # para secciones y ## para subsecciones. Para factura/orden_compra: notas adicionales (puede quedar vacío).' },
      filename:      { type: 'string', description: 'Nombre del archivo sin extensión. Usa guiones, sin espacios.' },
      template_type: { type: 'string', enum: ['general', 'proposal', 'letter', 'factura', 'orden_compra', 'cotizacion', 'nota_venta'], description: '"cotizacion" para cotizaciones al cliente (pre-venta). "nota_venta" para recibo simple (post-venta, NO es factura fiscal). "factura" para facturas fiscales (con IVA). "orden_compra" para órdenes de compra a proveedores. "proposal" para propuestas comerciales largas. "letter" para cartas formales. "general" para todo lo demás.' },
      client_name:   { type: 'string', description: 'Nombre del cliente o receptor (para proposal y factura)' },
      client_email:  { type: 'string', description: 'Correo del cliente (para proposal y factura)' },
      client_rfc:    { type: 'string', description: 'RFC del receptor (solo para factura)' },
      total_price:   { type: 'string', description: 'Precio total destacado. Ej: "$50,000 MXN" (solo para template proposal)' },
      validity_days: { type: 'number', description: 'Días de validez de la propuesta (solo para template proposal)' },
      recipient_name:  { type: 'string', description: 'Nombre del destinatario (solo para template letter)' },
      recipient_email: { type: 'string', description: 'Correo del destinatario (solo para template letter)' },
      vendor_name:   { type: 'string', description: 'Nombre del proveedor (solo para orden_compra)' },
      vendor_rfc:    { type: 'string', description: 'RFC del proveedor (solo para orden_compra)' },
      vendor_email:  { type: 'string', description: 'Correo del proveedor (solo para orden_compra)' },
      delivery_terms:{ type: 'string', description: 'Términos de entrega. Ej: "Entrega en 5 días hábiles" (solo para orden_compra)' },
      items: {
        type: 'array',
        description: 'Conceptos del documento (para factura y orden_compra). Cada concepto incluye descripcion, cantidad y precio_unitario en MXN.',
        items: {
          type: 'object',
          properties: {
            descripcion:     { type: 'string' },
            cantidad:        { type: 'number' },
            precio_unitario: { type: 'number' },
            unidad:          { type: 'string', description: 'Unidad de medida. Ej: pza, kg, hrs (opcional)' },
          },
          required: ['descripcion', 'cantidad', 'precio_unitario'],
        },
      },
      payment_terms: { type: 'string', description: 'Condiciones de pago. Ej: "Pago en una sola exhibición", "Crédito 30 días", "Pago en parcialidades" (para factura y orden_compra)' },
      folio_num:     { type: 'string', description: 'Número de folio a usar en la factura. Si no se pasa, se obtiene automáticamente de QuickBooks (si está conectado) o se genera uno con el prefijo configurado.' },
      include_iva:   { type: 'boolean', description: 'Si se incluye IVA 16%. Para factura: true por defecto. Para orden_compra: false por defecto.' },
    },
    required: ['title', 'content'],
  },
};

const REVISAR_DESEMPENO_EQUIPO_TOOL: Anthropic.Tool = {
  name: 'revisar_desempeno_equipo',
  description: 'Devuelve un resumen del desempeño del equipo: llamadas, tareas completadas/fallidas, documentos, correos, ops usadas, desglosado por cada empleado. Exclusiva de directores (Niva). Úsala cuando el dueño pregunte "¿cómo va el equipo?", "resumen del mes", "quién está haciendo qué", etc.',
  input_schema: {
    type: 'object' as const,
    properties: {
      periodo: { type: 'string', enum: ['hoy', 'esta_semana', 'este_mes', 'ultima_semana', 'ultimo_mes', 'ultimos_30_dias'], description: 'Ventana temporal. Default esta_semana.' },
    },
    required: [],
  },
};

const APROBAR_GASTO_TOOL: Anthropic.Tool = {
  name: 'aprobar_gasto',
  description: 'Registra la aprobación (o rechazo) de un gasto operativo. Deja audit trail. Exclusiva de directores (Niva). Úsala cuando el dueño diga "aprueba X gasto de $Y" o similar.',
  input_schema: {
    type: 'object' as const,
    properties: {
      concepto:      { type: 'string', description: 'Concepto del gasto.' },
      monto:         { type: 'number', description: 'Monto en MXN.' },
      justificacion: { type: 'string', description: 'Razón de la aprobación o rechazo (opcional).' },
      status:        { type: 'string', enum: ['approved', 'rejected'], description: 'approved (default) o rejected.' },
    },
    required: ['concepto', 'monto'],
  },
};

const BUSCAR_DOCUMENTO_OFICINA_TOOL: Anthropic.Tool = {
  name: 'buscar_documento_oficina',
  description: 'Busca documentos ya generados y guardados en la Oficina del negocio (facturas, cotizaciones, cartas, propuestas, órdenes de compra). Úsala cuando el usuario pida "el documento que le mandé la semana pasada" o cuando quieras reutilizar algo antes de generar uno nuevo. Devuelve una lista con id, título, tipo, cliente y fecha. Luego usa enviar_documento_oficina con el id para adjuntarlo a un correo.',
  input_schema: {
    type: 'object' as const,
    properties: {
      query:   { type: 'string', description: 'Texto para buscar en título, filename o nombre del cliente. Opcional.' },
      kind:    { type: 'string', description: 'Filtro por tipo exacto: factura, cotizacion, orden_compra, proposal, letter, general, nota_venta, excel, word, powerpoint.' },
      cliente: { type: 'string', description: 'Filtro por nombre del cliente (fuzzy).' },
      limit:   { type: 'number', description: 'Máximo de resultados. Default 10, máximo 50.' },
    },
    required: [],
  },
};

const ENVIAR_DOCUMENTO_OFICINA_TOOL: Anthropic.Tool = {
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
};

const SOLICITAR_FACTURA_TOOL: Anthropic.Tool = {
  name: 'solicitar_factura',
  description: 'Regístra una solicitud de factura CFDI cuando el cliente pide su comprobante fiscal. Recolecta primero TODOS los datos por voz/chat, confirma con el cliente, y luego invoca esta herramienta. El equipo de facturación humano emitirá el CFDI en el sistema fiscal del negocio (Solución Factible, CONTPAQ, Aspel, etc.) — NO lo timbramos aquí. NO uses create_document con template_type=factura para esto: eso genera un PDF sin validez fiscal.',
  input_schema: {
    type: 'object' as const,
    properties: {
      cliente_nombre:    { type: 'string', description: 'Razón social o nombre completo tal como aparece en la constancia de situación fiscal.' },
      cliente_rfc:       { type: 'string', description: 'RFC del receptor. Formato: 12 chars persona moral (ej. ABC010101ABC) o 13 chars persona física.' },
      cliente_email:     { type: 'string', description: 'Correo donde el cliente quiere recibir el CFDI. CRÍTICO: confirma con el cliente antes de guardar.' },
      cliente_telefono:  { type: 'string', description: 'Teléfono del cliente para seguimiento (opcional).' },
      cliente_direccion: { type: 'string', description: 'Domicilio fiscal (opcional, algunos PACs lo piden).' },
      uso_cfdi:          { type: 'string', description: 'Uso CFDI del receptor. Ejemplos: G03 Gastos en general, G01 Adquisición de mercancías, D01 Honorarios médicos, P01 Por definir, S01 Sin efectos fiscales. PREGUNTA al cliente cuál usar — no adivines.' },
      forma_pago:        { type: 'string', description: 'Forma de pago SAT. Códigos comunes: 01 Efectivo, 02 Cheque, 03 Transferencia, 04 Tarjeta crédito, 28 Tarjeta débito, 99 Por definir. PREGUNTA al cliente cómo pagó.' },
      metodo_pago:       { type: 'string', enum: ['PUE', 'PPD'], description: 'PUE = pago en una sola exhibición (contado). PPD = pago en parcialidades o diferido (crédito). PREGUNTA al cliente cuál aplica.' },
      condiciones_pago:  { type: 'string', description: 'Condiciones textuales opcionales. Ej: "Crédito 30 días".' },
      items: {
        type: 'array',
        description: 'Conceptos a facturar. Cada uno con descripcion, cantidad y precio_unitario en MXN (sin IVA).',
        items: {
          type: 'object',
          properties: {
            descripcion:     { type: 'string' },
            cantidad:        { type: 'number' },
            precio_unitario: { type: 'number' },
            unidad:          { type: 'string', description: 'Unidad de medida (pieza, servicio, hora). Opcional.' },
          },
          required: ['descripcion', 'cantidad', 'precio_unitario'],
        },
      },
      incluir_iva: { type: 'boolean', description: 'Incluir IVA 16%. Default true.' },
      notes:       { type: 'string', description: 'Notas internas para el equipo de facturación (contexto de la venta, etc.). No aparecen en el CFDI.' },
    },
    required: ['cliente_nombre', 'cliente_rfc', 'cliente_email', 'uso_cfdi', 'forma_pago', 'metodo_pago', 'items'],
  },
};

const CONSULTAR_FACTURA_TOOL: Anthropic.Tool = {
  name: 'consultar_factura',
  description: 'Consulta el estado de una solicitud de factura. Úsala cuando un cliente pregunta "¿ya me emitieron mi factura?" o cuando quieres verificar si una solicitud está pendiente / emitida. Devuelve las últimas solicitudes que coincidan con el RFC o nombre del cliente.',
  input_schema: {
    type: 'object' as const,
    properties: {
      cliente_rfc:    { type: 'string', description: 'RFC exacto del cliente (recomendado).' },
      cliente_nombre: { type: 'string', description: 'Nombre parcial del cliente si no tienes RFC.' },
      request_id:     { type: 'string', description: 'ID exacto de la solicitud si lo tienes.' },
    },
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

const EXTRAER_TONO_TOOL: Anthropic.Tool = {
  name: 'extraer_tono_de_marca',
  description: 'Analiza muestras reales del negocio (correos previos, copy del sitio, pitch) y extrae una guía de tono que se inyecta en el system prompt de todos los empleados. Después de esto los empleados hablan como esta marca en vez de con tono genérico. Úsala cuando el dueño te comparta muestras de cómo escribe o cuando le pidas explícitamente que te las mande.',
  input_schema: {
    type: 'object' as const,
    properties: {
      muestras: {
        type: 'array',
        items: { type: 'string' },
        description: 'Lista de 2 a 6 textos reales del negocio: correos previos, párrafos de landing, pitch escrito, etc. Cada uno mínimo 40 caracteres.',
      },
    },
    required: ['muestras'],
  },
};

const EXTRAER_VOZ_TOOL: Anthropic.Tool = {
  name: 'extraer_voz_del_cliente',
  description: 'Analiza conversaciones reales de esta organización (llamadas, correos o tickets) y extrae el lenguaje literal del cliente, sus objeciones más frecuentes y candidatos de titular. Úsala cuando el dueño pida entender qué dicen sus clientes, preparar copy o revisar patrones. Requiere mínimo de muestras para producir análisis confiable.',
  input_schema: {
    type: 'object' as const,
    properties: {
      fuente:       { type: 'string', enum: ['calls','emails','tickets','all'], description: 'Canal a analizar. Default "all".' },
      dias:         { type: 'number', description: 'Días hacia atrás. Default 30.' },
      min_muestras: { type: 'number', description: 'Mínimo de muestras. Default 20.' },
    },
    required: [],
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

const DELEGATE_TASK_TOOL: Anthropic.Tool = {
  name: 'delegate_task',
  description: 'Delega una tarea a un compañero del equipo digital para que la ejecute ahora mismo. El compañero usa sus propias herramientas (correo, documentos, búsqueda web, Drive) y reporta el resultado. Úsala cuando algo esté fuera de tu área o requiera capacidades de otro empleado.',
  input_schema: {
    type: 'object' as const,
    properties: {
      agente:            { type: 'string', description: 'Nombre o rol del compañero. Ej: "Nox", "Nova", "contabilidad".' },
      tarea:             { type: 'string', description: 'Descripción clara de lo que debe ejecutar el compañero.' },
      contexto:          { type: 'string', description: 'Contexto adicional que ayude al compañero a entender la solicitud. Opcional.' },
      success_criteria:  { type: 'string', description: 'Criterio de éxito: descripción de qué debe haber pasado para que la tarea se considere completada. Si se define, el agente evaluará su resultado y reintentará si no lo cumple.' },
      max_iterations:    { type: 'number', description: 'Número máximo de intentos para cumplir el criterio de éxito (1-5, default 3). Solo aplica cuando success_criteria está definido.' },
    },
    required: ['agente', 'tarea'],
  },
};

const CONSULT_AGENT_TOOL: Anthropic.Tool = {
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
    },
    required: ['rol', 'tarea'],
  },
};

const QB_TOOLS: Anthropic.Tool[] = [
  {
    name: 'qb_consultar_facturas',
    description: 'Consulta facturas en QuickBooks Online. Úsala cuando el dueño pregunte por facturas pendientes, saldo de clientes o cuentas por cobrar.',
    input_schema: {
      type: 'object' as const,
      properties: {
        cliente:         { type: 'string',  description: 'Nombre del cliente (opcional). Sin este campo trae todas las facturas pendientes.' },
        solo_pendientes: { type: 'boolean', description: 'true para solo facturas con saldo (default), false para todas.' },
      },
      required: [],
    },
  },
  {
    name: 'qb_buscar_cliente',
    description: 'Busca un cliente en QuickBooks y muestra su saldo total y facturas abiertas.',
    input_schema: {
      type: 'object' as const,
      properties: {
        nombre: { type: 'string', description: 'Nombre o razón social del cliente en QuickBooks.' },
      },
      required: ['nombre'],
    },
  },
  {
    name: 'qb_crear_factura',
    description: 'Crea una factura en QuickBooks. Confirma siempre los datos con el dueño antes de ejecutar. Consume 1 tarea.',
    input_schema: {
      type: 'object' as const,
      properties: {
        cliente_nombre:    { type: 'string', description: 'Nombre exacto del cliente en QuickBooks.' },
        descripcion:       { type: 'string', description: 'Descripción del servicio o producto.' },
        monto:             { type: 'number', description: 'Monto total de la factura.' },
        fecha_vencimiento: { type: 'string', description: 'Fecha de vencimiento YYYY-MM-DD (opcional).' },
      },
      required: ['cliente_nombre', 'descripcion', 'monto'],
    },
  },
  {
    name: 'qb_registrar_pago',
    description: 'Registra un pago recibido en QuickBooks y lo aplica a la factura correspondiente. Confirma con el dueño antes de ejecutar. Consume 1 tarea.',
    input_schema: {
      type: 'object' as const,
      properties: {
        cliente_nombre:  { type: 'string', description: 'Nombre del cliente que pagó.' },
        monto:           { type: 'number', description: 'Monto recibido.' },
        factura_numero:  { type: 'string', description: 'Número de factura a aplicar (opcional, se aplica a la más antigua pendiente si no se indica).' },
      },
      required: ['cliente_nombre', 'monto'],
    },
  },
  {
    name: 'qb_reporte_ingresos',
    description: 'Genera un reporte de ingresos, gastos y utilidad desde QuickBooks para un período específico.',
    input_schema: {
      type: 'object' as const,
      properties: {
        periodo: {
          type: 'string',
          enum: ['este_mes', 'mes_pasado', 'este_año', 'año_pasado', 'este_trimestre', 'trimestre_pasado'],
          description: 'Período del reporte (default: este_mes).',
        },
      },
      required: [],
    },
  },
];

const CREAR_LEAD_TOOL: Anthropic.Tool = {
  name: 'crear_lead',
  description: 'Registra un prospecto interesado en los servicios del negocio. Úsala cuando el dueño mencione un cliente nuevo que quiere darle seguimiento o que llamó pidiendo información.',
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
};

const AGENDAR_CITA_TOOL: Anthropic.Tool = {
  name: 'agendar_cita',
  description: 'Agenda, modifica o cancela una cita de un cliente. Úsala cuando el dueño quiera registrar una cita nueva, cambiar una existente o cancelarla.',
  input_schema: {
    type: 'object' as const,
    properties: {
      accion:   { type: 'string', enum: ['agendar', 'modificar', 'cancelar'], description: 'Acción a realizar' },
      nombre:   { type: 'string', description: 'Nombre del cliente' },
      servicio: { type: 'string', description: 'Servicio para la cita' },
      fecha:    { type: 'string', description: 'Fecha de la cita. Ej: "lunes 28 de julio"' },
      hora:     { type: 'string', description: 'Hora de la cita. Ej: "10:00 AM"' },
      telefono: { type: 'string', description: 'Teléfono del cliente (necesario para cancelar o modificar)' },
    },
    required: ['accion', 'nombre'],
  },
};

const REGISTRAR_PEDIDO_TOOL: Anthropic.Tool = {
  name: 'registrar_pedido',
  description: 'Registra un pedido de un cliente. Úsala cuando el dueño quiera guardar un pedido nuevo.',
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
};

const BUSCAR_CLIENTE_TOOL: Anthropic.Tool = {
  name: 'buscar_cliente',
  description: 'Busca el historial de un cliente por nombre, teléfono o email. Muestra llamadas, leads, pedidos y citas anteriores. Úsala cuando el dueño quiera consultar el historial de un cliente.',
  input_schema: {
    type: 'object' as const,
    properties: {
      identificador: { type: 'string', description: 'Nombre completo, número de teléfono o email del cliente a buscar' },
    },
    required: ['identificador'],
  },
};

const CREAR_TICKET_TOOL: Anthropic.Tool = {
  name: 'crear_ticket',
  description: 'Crea un ticket de soporte IT en la mesa de ayuda. Úsala cuando el dueño reporte un problema técnico que quiera registrar para seguimiento.',
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
};

const CONSULTAR_INCIDENTES_TOOL: Anthropic.Tool = {
  name: 'consultar_incidentes',
  description: 'Consulta si hay incidentes activos en el sistema de soporte IT. Úsala para verificar problemas conocidos antes de crear un ticket.',
  input_schema: {
    type: 'object' as const,
    properties: {
      tema: { type: 'string', description: 'Tema o sistema sobre el que preguntas (ej: internet, correo, SAP). Opcional.' },
    },
    required: [],
  },
};

const BUSCAR_DIRECTORIO_TOOL: Anthropic.Tool = {
  name: 'buscar_directorio',
  description: 'Busca en el directorio interno quién atiende un tipo de problema o área específica. Úsala para saber con quién escalar un problema de soporte IT.',
  input_schema: {
    type: 'object' as const,
    properties: {
      tipo_problema: { type: 'string', description: 'Tipo de problema o área (ej: red, VPN, impresoras, SAP)' },
    },
    required: ['tipo_problema'],
  },
};

const INICIAR_ONBOARDING_TOOL: Anthropic.Tool = {
  name: 'iniciar_onboarding',
  description: 'Inicia el proceso de onboarding para un nuevo empleado, cliente o proveedor. Envía automáticamente el correo de bienvenida con los pasos a seguir.',
  input_schema: {
    type: 'object' as const,
    properties: {
      contact_name:  { type: 'string', description: 'Nombre completo del contacto' },
      contact_email: { type: 'string', description: 'Correo electrónico del contacto' },
      template_name: { type: 'string', description: 'Nombre de la plantilla a usar (opcional)' },
    },
    required: ['contact_name', 'contact_email'],
  },
};

const BUSCAR_PRODUCTO_TOOL: Anthropic.Tool = {
  name: 'buscar_producto',
  description: 'Busca un producto o servicio en el catálogo de Notion por SKU o nombre. Úsala ANTES de crear_documento con template factura cuando el usuario mencione un SKU o nombre de producto, para obtener el precio, descripción e IVA exactos del catálogo.',
  input_schema: {
    type: 'object' as const,
    properties: {
      query: { type: 'string', description: 'SKU exacto (ej. PRD-001) o nombre parcial del producto o servicio' },
    },
    required: ['query'],
  },
};

const ALL_TOOLS = [
  DELEGATE_TASK_TOOL,
  CONSULT_AGENT_TOOL,
  CREATE_CONTRACT_DRAFT_TOOL,
  SEND_EMAIL_TOOL,
  CREATE_DOCUMENT_TOOL,
  SOLICITAR_FACTURA_TOOL,
  CONSULTAR_FACTURA_TOOL,
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
  EXTRAER_VOZ_TOOL,
  EXTRAER_TONO_TOOL,
  REPORT_ISSUE_TOOL,
  ML_ANALIZAR_PUBLICACIONES_TOOL,
  ML_CREAR_PUBLICACION_TOOL,
  ML_ACTUALIZAR_PUBLICACION_TOOL,
  ML_VER_METRICAS_TOOL,
  CREAR_LEAD_TOOL,
  AGENDAR_CITA_TOOL,
  REGISTRAR_PEDIDO_TOOL,
  BUSCAR_CLIENTE_TOOL,
  CREAR_TICKET_TOOL,
  CONSULTAR_INCIDENTES_TOOL,
  BUSCAR_DIRECTORIO_TOOL,
  INICIAR_ONBOARDING_TOOL,
];

// Maps voice tool names → chat tool names (null = no chat implementation yet)
const VOICE_TO_CHAT: Record<string, string | null> = {
  enviar_correo:             'send_email',
  crear_documento:           'create_document',
  buscar_documento_oficina:  'buscar_documento_oficina',
  enviar_documento_oficina:  'enviar_documento_oficina',
  llamar_a:                  'trigger_outbound_call',
  buscar_archivo:            'search_files',
  leer_archivo:              'read_file',
  consultar_agente:          'consult_agent',
  delegar_tarea:             'delegate_task',
  // Voice-only (no chat equivalent)
  notificar_transferencia:   null,
  transferir_llamada:        null,
  registrar_encuesta:        null,
  // Chat implementations
  crear_lead:                'crear_lead',
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
  solicitar_factura:         'solicitar_factura',
  consultar_factura:         'consultar_factura',
  revisar_desempeno_equipo:  'revisar_desempeno_equipo',
  aprobar_gasto:             'aprobar_gasto',
  marcar_no_llamar:          null,  // voice-only (no aplica a chat)
};

// Chat tool name → Anthropic.Tool object
const CHAT_TOOL_BY_NAME: Record<string, Anthropic.Tool> = {
  delegate_task:             DELEGATE_TASK_TOOL,
  consult_agent:             CONSULT_AGENT_TOOL,
  create_contract_draft:     CREATE_CONTRACT_DRAFT_TOOL,
  send_email:                SEND_EMAIL_TOOL,
  create_document:           CREATE_DOCUMENT_TOOL,
  buscar_documento_oficina:  BUSCAR_DOCUMENTO_OFICINA_TOOL,
  enviar_documento_oficina:  ENVIAR_DOCUMENTO_OFICINA_TOOL,
  solicitar_factura:         SOLICITAR_FACTURA_TOOL,
  consultar_factura:         CONSULTAR_FACTURA_TOOL,
  revisar_desempeno_equipo:  REVISAR_DESEMPENO_EQUIPO_TOOL,
  aprobar_gasto:             APROBAR_GASTO_TOOL,
  create_file:               CREATE_FILE_TOOL,
  save_to_drive:             SAVE_TO_DRIVE_TOOL,
  organize_files:            ORGANIZE_FILES_TOOL,
  trigger_outbound_call:     TRIGGER_CALL_TOOL,
  search_files:              SEARCH_FILES_TOOL,
  read_file:                 READ_FILE_TOOL,
  list_calendar_events:      LIST_CALENDAR_EVENTS_TOOL,
  create_calendar_event:     CREATE_CALENDAR_EVENT_TOOL,
  delete_calendar_event:     DELETE_CALENDAR_EVENT_TOOL,
  search_leads:              SEARCH_LEADS_TOOL,
  read_url:                  READ_URL_TOOL,
  create_civic_report:       CREATE_CIVIC_REPORT_TOOL,
  lookup_civic_report:       LOOKUP_CIVIC_REPORT_TOOL,
  update_civic_report:       UPDATE_CIVIC_REPORT_TOOL,
  buscar_en_web:             WEB_SEARCH_TOOL,
  extraer_voz_del_cliente:   EXTRAER_VOZ_TOOL,
  extraer_tono_de_marca:     EXTRAER_TONO_TOOL,
  reportar_falla:            REPORT_ISSUE_TOOL,
  crear_lead:                CREAR_LEAD_TOOL,
  agendar_cita:              AGENDAR_CITA_TOOL,
  registrar_pedido:          REGISTRAR_PEDIDO_TOOL,
  buscar_cliente:            BUSCAR_CLIENTE_TOOL,
  crear_ticket:              CREAR_TICKET_TOOL,
  consultar_incidentes:      CONSULTAR_INCIDENTES_TOOL,
  buscar_directorio:         BUSCAR_DIRECTORIO_TOOL,
  iniciar_onboarding:        INICIAR_ONBOARDING_TOOL,
  analizar_publicaciones_ml: ML_ANALIZAR_PUBLICACIONES_TOOL,
  crear_publicacion_ml:      ML_CREAR_PUBLICACION_TOOL,
  actualizar_publicacion_ml: ML_ACTUALIZAR_PUBLICACION_TOOL,
  ver_metricas_ml:           ML_VER_METRICAS_TOOL,
  ...Object.fromEntries(QB_TOOLS.map(t => [t.name, t])),
  buscar_producto: BUSCAR_PRODUCTO_TOOL,
};

function getToolsForRole(meerkatId: string | null, qbConnected: boolean, notionProductsConnected: boolean): Anthropic.Tool[] {
  const voiceNames = meerkatId && meerkatId !== 'custom'
    ? MEERKAT_VOICE_DISTRIBUTION[meerkatId] ?? null
    : null;

  const extras = [
    ...(qbConnected              ? QB_TOOLS              : []),
    ...(notionProductsConnected  ? [BUSCAR_PRODUCTO_TOOL] : []),
  ];

  // Custom agents or unknown role → previous behavior (all tools)
  if (!voiceNames) return [...ALL_TOOLS, ...extras];

  const tools: Anthropic.Tool[] = [];
  const seen = new Set<string>();
  for (const voiceName of voiceNames) {
    const chatName = VOICE_TO_CHAT[voiceName];
    if (!chatName || seen.has(chatName)) continue;
    if (!qbConnected && chatName.startsWith('qb_')) continue;
    if (!notionProductsConnected && chatName === 'buscar_producto') continue;
    const tool = CHAT_TOOL_BY_NAME[chatName];
    if (tool) { tools.push(tool); seen.add(chatName); }
  }
  return tools;
}

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
    ? accountAgent.portal_email
      ? supabase.from('voice_agents').select('*').eq('id', agentId).eq('portal_email', accountAgent.portal_email).single()
      : supabase.from('voice_agents').select('*').eq('id', agentId).eq('id', accountAgent.id).single()
    : supabase.from('voice_agents').select('*').eq('portal_token', token).single();
  const [{ data: agent }, { data: qbRow }] = await Promise.all([
    targetQuery,
    supabase.from('qb_integrations').select('realm_id').eq('portal_email', accountAgent.portal_email).maybeSingle(),
  ]);
  if (!agent) return NextResponse.json({ error: 'Agent not found' }, { status: 404 });

  const qbConnected             = !!qbRow?.realm_id;
  const agentFeatures           = (agent.features as Record<string, unknown>) ?? {};
  const meerkatId               = (agentFeatures.meerkat_role_id  as string | null) ?? null;
  const notionProductsConnected = !!(agent.notion_access_token && agentFeatures.notion_products_db_id);
  const sessionTools            = getToolsForRole(meerkatId, qbConnected, notionProductsConnected);

  // preparar_brief_del_dia — Nox exclusivo. Canal voz ausente de forma intencional
  // (Nox nunca tiene vapi_agent_id; ver NON_VOICE_ROLES en sync.ts).
  if (meerkatId === 'nox') {
    sessionTools.push({
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

  // Pilar 2 Creatividad — tools condicionales por meerkat_role_id
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
      if (meerkatId && (allowed as string[]).includes(meerkatId) && CREATIVITY_DECLARATIONS[toolName]) {
        sessionTools.push(CREATIVITY_DECLARATIONS[toolName]);
      }
    }
  }

  const toolsListText = sessionTools.length
    ? 'Herramientas disponibles:\n' + sessionTools.map(t => `- ${t.name}: ${t.description}`).join('\n')
    : '';

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
    sections.push(`# Aprendizajes del agente — instrucciones del puesto\n${agent.role_learnings}`);
  }
  if ((agent as any).guardrails_learnings?.trim()) {
    sections.push(`# Aprendizajes del agente — límites de autoridad\n${(agent as any).guardrails_learnings}`);
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

  const context  = sections.join('\n\n');
  const kbPortal = await getKnowledgeBase('kb_portal');

  const system = `Eres ${agentName}, empleado de ${agent.business_name}${agentRole ? ` con el rol de ${agentRole}` : ''}.

El dueño del negocio te está consultando directamente. Tienes acceso completo a tu operación: manual de la empresa, llamadas recientes, bandeja de entrada, juntas, contratos y CRM.

Responde como el empleado que conoce profundamente el negocio. Usa los datos disponibles para dar respuestas precisas y concretas. Cita fechas y nombres cuando los tengas. Si la información no está en tu contexto, dilo con claridad.

${toolsListText}

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
${kbPortal ? `\n## Guía de marca y terminología\n${kbPortal}` : ''}

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

      const runStart    = Date.now();
      const toolsCalled: { name: string; ok: boolean; error?: string }[] = [];
      let   llmCalls    = 0;

      try {
        let conversationMessages: Anthropic.MessageParam[] = (
          messages as { role: 'user' | 'assistant'; content: string }[]
        ).slice(-20);

        const readUrlCountRef: ReadUrlCounter = { value: 0 };
        let callCount    = 0;
        const MAX_CALLS  = 6;

        while (callCount < MAX_CALLS) {
          // Charge 2 ops for every call after the first (first was charged above)
          if (callCount > 0) {
            const midOps = await consumeAiOp(agent.id as string, 2);
            if (!midOps.ok) break;
          }
          callCount++;
          llmCalls = callCount;

          const stream = client.messages.stream({
            model:      'claude-sonnet-4-6',
            max_tokens: 2048,
            system:     callCount === 1 ? systemWithAlert : system,
            tools:      sessionTools,
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

          // ── Execute the requested tool via shared executor ────────────────
          let toolResult: unknown;
          toolResult = await executeAgentTool(
            pendingToolName!,
            toolInput,
            {
              agentId:      agent.id as string,
              portalEmail:  accountAgent.portal_email,
              agentName,
              businessName: agent.business_name as string,
              portalToken:  token,
              agent:        agent as Record<string, unknown>,
              supabase,
              userContext:  lastUserText(conversationMessages),
              cookieHeader: req.cookies.get(PORTAL_COOKIE)?.value,
              readUrlCount: readUrlCountRef,
            }
          );

          // Track tool call for run log
          toolsCalled.push({
            name: pendingToolName ?? 'unknown',
            ok:   (toolResult as { ok?: boolean })?.ok !== false,
            ...((toolResult as { ok?: boolean; error?: string })?.ok === false
              ? { error: String((toolResult as { error?: unknown })?.error ?? '') }
              : {}),
          });

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

        // Harness run log — fire-and-forget, never blocks the stream
        void (async () => {
          const { error } = await supabase.from('agent_runs').insert({
            agent_id:     _agentId,
            portal_email: _portalEmail,
            started_at:   new Date(runStart).toISOString(),
            ended_at:     new Date().toISOString(),
            duration_ms:  Date.now() - runStart,
            tools_called: toolsCalled,
            llm_calls:    llmCalls,
          });
          if (error) console.error('[agent-chat] run log failed:', error.message);
        })();
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
