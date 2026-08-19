import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { logLlmCall } from '@/lib/observability/llm-log';
import { TOOL_SCHEMAS, toAnthropicTool } from '@/lib/tools/schemas';
import { executeAgentTool, type ReadUrlCounter } from '@/lib/tools/executor';
import { rateLimit, limiters } from '@/lib/ratelimit';
import { createElement } from 'react';
import { renderToBuffer } from '@react-pdf/renderer';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';
import { getPrimaryAgentFromToken } from '@/lib/portal/org-token';
import { notionClient } from '@/lib/notion/client';
import { consumeAiOp, refundOps } from '@/lib/ai/ops-guard';
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
import { VOICE_TO_CHAT, UNIVERSAL_TOOLS } from '@/lib/tools/channel-mapping';
import { getOrgIndustry, INDUSTRIES_WITH_DAILY_AVAILABILITY } from '@/lib/industry';
import { formatDailyAvailabilityForPrompt } from '@/lib/daily-availability';
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

// ── Message-history integrity guard ───────────────────────────────────────────
// Anthropic 400: cada bloque tool_use debe tener un tool_result con el mismo
// tool_use_id en el MENSAJE inmediatamente siguiente. Si algún día la
// construcción del historial se corrompe, preferimos abortar con un error
// controlado a lanzar el 400 crudo al cliente (que además desperdicia una call).
function assertToolUsePairing(msgs: Anthropic.MessageParam[]): void {
  for (let i = 0; i < msgs.length; i++) {
    const m = msgs[i];
    if (m.role !== 'assistant' || !Array.isArray(m.content)) continue;
    const toolUseIds = (m.content as Array<{ type: string; id?: string }>)
      .filter(b => b.type === 'tool_use')
      .map(b => b.id!)
      .filter(Boolean);
    if (toolUseIds.length === 0) continue;
    const next = msgs[i + 1];
    if (!next || next.role !== 'user' || !Array.isArray(next.content)) {
      throw new Error(`tool_use en msg[${i}] sin user/tool_result adyacente (ids: ${toolUseIds.join(',')})`);
    }
    const resultIds = new Set(
      (next.content as Array<{ type: string; tool_use_id?: string }>)
        .filter(b => b.type === 'tool_result')
        .map(b => b.tool_use_id!)
        .filter(Boolean)
    );
    const orphaned = toolUseIds.filter(id => !resultIds.has(id));
    if (orphaned.length > 0) {
      throw new Error(`tool_use huérfano en msg[${i}] sin tool_result en msg[${i + 1}] (ids: ${orphaned.join(',')})`);
    }
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

// Migrated to registry: src/lib/tools/schemas.ts
const SEND_EMAIL_TOOL: Anthropic.Tool = toAnthropicTool(TOOL_SCHEMAS['send_email']);

const ACTUALIZAR_DISPONIBILIDAD_DIARIA_TOOL: Anthropic.Tool = {
  name: 'actualizar_disponibilidad_diaria',
  description:
    'Actualiza la disponibilidad diaria del negocio (items agotados, con existencia limitada, especial del dia). Cambio compartido con todos los empleados.',
  input_schema: {
    type: 'object' as const,
    properties: {
      unavailable: { type: 'array', items: { type: 'string' } },
      limited:     { type: 'array', items: { type: 'string' } },
      special:     { type: ['string', 'null'] },
      notes:       { type: ['string', 'null'] },
    },
    required: ['unavailable', 'limited'],
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

const EVALUAR_LIMITE_GASTO_TOOL: Anthropic.Tool = {
  name: 'evaluar_limite_gasto',
  description: 'Verifica si un gasto propuesto cabe en el presupuesto mensual de la organización. Devuelve presupuesto configurado, gastado este mes y si excede. INVÓCALA antes de aprobar_gasto para decidir con datos.',
  input_schema: {
    type: 'object' as const,
    properties: {
      monto: { type: 'number', description: 'Monto en MXN del gasto que se está evaluando.' },
    },
    required: ['monto'],
  },
};

const VERIFICAR_GASTO_RECURRENTE_TOOL: Anthropic.Tool = {
  name: 'verificar_gasto_recurrente',
  description: 'Consulta el historial de facturas recibidas de un proveedor. Devuelve si es recurrente (≥2 aprobadas antes), monto del último pago y variación con el actual. Úsala al procesar facturas: si recomendación=auto_approve, puedes marcar pagada sin escalar.',
  input_schema: {
    type: 'object' as const,
    properties: {
      proveedor: { type: 'string', description: 'Nombre del proveedor (o email si no tienes nombre).' },
      monto:     { type: 'number', description: 'Monto de la factura actual en MXN (opcional, para detectar variación anómala).' },
    },
    required: ['proveedor'],
  },
};

// ── Google Sheets tools — gated por feature google_sheets ─────────────────
// Purposes soportados por sheets_mappings: clientes, leads, bitacoras, oc,
// cajas_chicas, custom. Si no hay mapping para el purpose, devuelven
// {ok:false, reason:'sheet_no_configurado'} y el agente informa al usuario.

const SHEETS_PURPOSE_ENUM = ['clientes', 'leads', 'bitacoras', 'oc', 'cajas_chicas', 'custom'];

const SHEETS_AGREGAR_FILA_TOOL: Anthropic.Tool = {
  name: 'sheets_agregar_fila',
  description: 'Agrega una fila al Google Sheet configurado (clientes, leads, bitácoras, órdenes de compra, cajas chicas). Úsala cuando el usuario pida registrar un nuevo cliente/lead/OC/etc. en su Sheet.',
  input_schema: {
    type: 'object' as const,
    required: ['purpose', 'data'],
    properties: {
      purpose:              { type: 'string', enum: SHEETS_PURPOSE_ENUM, description: 'Tipo de Sheet destino.' },
      custom_purpose_label: { type: 'string', description: 'Etiqueta del Sheet cuando purpose=custom.' },
      data:                 { type: 'object', additionalProperties: true, description: 'Objeto {columna: valor} donde las claves son encabezados del Sheet.' },
    },
  },
};

const SHEETS_ACTUALIZAR_FILA_TOOL: Anthropic.Tool = {
  name: 'sheets_actualizar_fila',
  description: 'Actualiza una fila existente buscando por columna y valor. Úsala cuando el usuario pida cambiar datos de un registro específico en el Sheet.',
  input_schema: {
    type: 'object' as const,
    required: ['purpose', 'match_by', 'match_value', 'data'],
    properties: {
      purpose:              { type: 'string', enum: SHEETS_PURPOSE_ENUM },
      custom_purpose_label: { type: 'string' },
      match_by:             { type: 'string', description: 'Nombre de la columna por la que buscar.' },
      match_value:          { type: 'string', description: 'Valor a encontrar en esa columna.' },
      data:                 { type: 'object', additionalProperties: true, description: 'Campos a actualizar.' },
    },
  },
};

const SHEETS_LEER_TOOL: Anthropic.Tool = {
  name: 'sheets_leer',
  description: 'Lee el contenido completo del Sheet configurado. Úsala cuando el usuario pida "muéstrame los clientes/leads/OCs" o quiera un resumen del Sheet.',
  input_schema: {
    type: 'object' as const,
    required: ['purpose'],
    properties: {
      purpose:              { type: 'string', enum: SHEETS_PURPOSE_ENUM },
      custom_purpose_label: { type: 'string' },
      range:                { type: 'string', description: 'Rango A1 opcional (ej. A1:D50).' },
    },
  },
};

const SHEETS_BUSCAR_TOOL: Anthropic.Tool = {
  name: 'sheets_buscar',
  description: 'Busca filas que contengan un texto (case-insensitive). Úsala cuando el usuario pida "busca el cliente X" o "encuentra la OC del proveedor Y" en el Sheet.',
  input_schema: {
    type: 'object' as const,
    required: ['purpose', 'query'],
    properties: {
      purpose:              { type: 'string', enum: SHEETS_PURPOSE_ENUM },
      custom_purpose_label: { type: 'string' },
      query:                { type: 'string', description: 'Texto a buscar en cualquier celda de la fila.' },
    },
  },
};

// Migrated to registry: src/lib/tools/schemas.ts
const BUSCAR_DOCUMENTO_OFICINA_TOOL: Anthropic.Tool = toAnthropicTool(TOOL_SCHEMAS['buscar_documento_oficina']);

// Migrated to registry: src/lib/tools/schemas.ts
const ENVIAR_DOCUMENTO_OFICINA_TOOL: Anthropic.Tool = toAnthropicTool(TOOL_SCHEMAS['enviar_documento_oficina']);

const AGREGAR_TAG_CONTACTO_TOOL: Anthropic.Tool = {
  name: 'agregar_tag_contacto',
  description: 'Agrega una etiqueta (tag) a un contacto de outbound_contacts según lo aprendido en la interacción (llamada, correo, chat). Los tags alimentan la segmentación de campañas futuras. Sugeridos: compró, cotizó, interesado, no interesado, seguimiento, vencido, nuevo, vip. Puedes crear tags nuevos si aplican al negocio. Match del contacto por sufijo de 10 dígitos del teléfono.',
  input_schema: {
    type: 'object' as const,
    properties: {
      telefono: { type: 'string', description: 'Teléfono del contacto (con o sin lada). Se normaliza por sufijo de 10 dígitos.' },
      tag:      { type: 'string', description: 'Tag a agregar. Guardado en lowercase, max 40 chars.' },
      motivo:   { type: 'string', description: 'Motivo breve por el que agregas este tag (opcional).' },
    },
    required: ['telefono', 'tag'],
  },
};

const SOLICITAR_CANCELACION_FACTURA_TOOL: Anthropic.Tool = {
  name: 'solicitar_cancelacion_factura',
  description: 'Registra una solicitud de cancelación de un CFDI ya emitido. El equipo la confirma después.',
  input_schema: {
    type: 'object' as const,
    properties: {
      uuid_o_folio_corto: { type: 'string', description: 'UUID completo o últimos 8 caracteres del folio.' },
      motivo:             { type: 'string', enum: ['01','02','03','04'], description: '01=error datos (requiere sustituto). 02=no realizada. 03=no llevó a cabo. 04=nominativa relacionada con global.' },
      uuid_sustituto:     { type: 'string', description: 'Requerido si motivo=01. UUID del CFDI que sustituye a éste.' },
      razon_cliente:      { type: 'string' },
    },
    required: ['uuid_o_folio_corto', 'motivo'],
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

// Migrated to registry: src/lib/tools/schemas.ts
const SAVE_TO_DRIVE_TOOL: Anthropic.Tool = toAnthropicTool(TOOL_SCHEMAS['save_to_drive']);

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

// Migrated to registry: src/lib/tools/schemas.ts
const LIST_CALENDAR_EVENTS_TOOL: Anthropic.Tool = toAnthropicTool(TOOL_SCHEMAS['list_calendar_events']);

// Migrated to registry: src/lib/tools/schemas.ts
const CREATE_CALENDAR_EVENT_TOOL: Anthropic.Tool = toAnthropicTool(TOOL_SCHEMAS['create_calendar_event']);

// Migrated to registry: src/lib/tools/schemas.ts
const DELETE_CALENDAR_EVENT_TOOL: Anthropic.Tool = toAnthropicTool(TOOL_SCHEMAS['delete_calendar_event']);

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

const REVISAR_INCIDENTES_PLATAFORMA_TOOL: Anthropic.Tool = {
  name: 'revisar_incidentes_plataforma',
  description: 'Uso exclusivo de Nash (Centinelia interno). Lee las 5 fuentes de incidentes de la plataforma en una sola llamada: bug reports enviados vía reportar_falla, errores del LLM (llm_call_log), bandejas escaladas estancadas más de 24h, handoff replies fallidos, y agent_tasks con status="failed". Deduplica contra platform_incidents (abiertos y cerrados) por source_id, y filtra reopens ya procesados (incident_reply cuyo incidente referenciado fue actualizado después del reply). Úsala como primera acción de cada ciclo de monitoreo antes de decidir qué escalar a Claude Code, qué contestar al cliente afectado, o qué marcar como incidente manual.',
  input_schema: {
    type: 'object' as const,
    properties: {
      days:             { type: 'number', description: 'Ventana hacia atrás en días. Default 7. Máximo 30.' },
      limit_per_source: { type: 'number', description: 'Máximo de filas por fuente. Default 25. Máximo 100.' },
    },
    required: [],
  },
};

const CREAR_INCIDENTE_TOOL: Anthropic.Tool = {
  name: 'crear_incidente',
  description: 'Uso exclusivo de Nash. Crea una fila en platform_incidents. Si (source, source_id) ya existe abierto, devuelve el id existente sin duplicar. Úsala cuando decidas trackear una señal encontrada por revisar_incidentes_plataforma o al descubrir un bug propio en admin (source="nash_self_discovery").',
  input_schema: {
    type: 'object' as const,
    properties: {
      title:                 { type: 'string', description: 'Título corto y accionable.' },
      description:           { type: 'string', description: 'Descripción con contexto, evidencia y pasos para reproducir si aplica.' },
      priority:              { type: 'string', enum: ['low', 'med', 'high', 'critical'] },
      source:                { type: 'string', enum: ['bug_report', 'error_log', 'escalated_inbox', 'failed_handoff', 'agent_task', 'nash_self_discovery', 'manual'], description: 'Fuente del incidente. Default nash_self_discovery.' },
      source_id:             { type: 'string', description: 'ID de la fila origen (para dedupe). Ej: id de agent_tasks o ops_inbox.' },
      affected_agent_id:     { type: 'string', description: 'UUID del voice_agent afectado (si aplica).' },
      affected_portal_email: { type: 'string', description: 'Email del portal cliente afectado (si aplica).' },
    },
    required: ['title', 'description', 'priority'],
  },
};

const RESPONDER_CLIENTE_AFECTADO_TOOL: Anthropic.Tool = {
  name: 'responder_cliente_afectado',
  description: 'Uso exclusivo de Nash. Envía un mensaje al cliente cuyo voice_agent está afectado por un incidente. Canal email (default) usa client_email; canal whatsapp usa transfer_whatsapp. Úsala cuando quieras darle visibilidad al cliente sobre un problema que Nash está atacando (ej: "detectamos que tu bandeja no procesó correos desde ayer, ya lo estoy arreglando").',
  input_schema: {
    type: 'object' as const,
    properties: {
      agent_id: { type: 'string', description: 'UUID del voice_agent del cliente afectado.' },
      mensaje:  { type: 'string', description: 'Texto claro dirigido al dueño del negocio. Firma se agrega automáticamente.' },
      canal:    { type: 'string', enum: ['email', 'whatsapp'], description: 'Canal de entrega. Default email.' },
    },
    required: ['agent_id', 'mensaje'],
  },
};

const ENVIAR_A_CLAUDE_CODE_TOOL: Anthropic.Tool = {
  name: 'enviar_a_claude_code',
  description: 'Uso exclusivo de Nash. Escala un incidente a Claude Code creando un GitHub issue con el prompt de trabajo. Si NASH_GITHUB_TOKEN no está seteado, cae a email con el prompt para que el owner lo pegue manual en Claude Code. Actualiza status=sent_to_claude_code y guarda github_issue_url. Úsala solo cuando el incidente requiera cambio de código (no para bugs de datos que puedes arreglar tú mismo con otras tools).',
  input_schema: {
    type: 'object' as const,
    properties: {
      incidente_id: { type: 'string', description: 'UUID del platform_incidents row.' },
      prompt:       { type: 'string', description: 'Prompt completo para Claude Code: contexto + evidencia + hipótesis + pasos sugeridos. Se prepende [Nash] al título del issue.' },
      labels:       { type: 'array', items: { type: 'string' }, description: 'Labels adicionales (bug, from-nash, priority-<x> se agregan automáticamente).' },
    },
    required: ['incidente_id', 'prompt'],
  },
};

const ESCALAR_AL_OWNER_TOOL: Anthropic.Tool = {
  name: 'escalar_al_owner',
  description: 'Uso exclusivo de Nash. Notifica al owner (Nazre) por WhatsApp (env OWNER_WHATSAPP) con fallback a email hola@centinelia.mx. Marca el incidente como assigned_to=owner. Úsala SOLO para lo crítico donde Nash no puede decidir solo: acciones destructivas sin precedente, cobro mal aplicado, datos de cliente en riesgo, o cuando el mismo incidente ha regresado 3+ veces.',
  input_schema: {
    type: 'object' as const,
    properties: {
      razon:        { type: 'string', description: 'Razón clara y accionable. El owner debe poder decidir sin abrir el portal.' },
      urgencia:     { type: 'string', enum: ['low', 'med', 'high', 'critical'], description: 'Nivel de urgencia. Default high.' },
      incidente_id: { type: 'string', description: 'UUID del incidente relacionado (opcional pero recomendado).' },
    },
    required: ['razon'],
  },
};

const VERIFICAR_FIX_TOOL: Anthropic.Tool = {
  name: 'verificar_fix',
  description: 'Uso exclusivo de Nash. Re-lee la señal fuente del incidente (agent_task, ops_inbox, handoff, error_log) y decide si el problema ya desapareció. Si desapareció → status=resolved con nota. Si sigue → status=awaiting_verification para que el owner lo revise manual. Úsala después de que Claude Code haya cerrado un issue para confirmar que el fix realmente funcionó en la data.',
  input_schema: {
    type: 'object' as const,
    properties: {
      incidente_id: { type: 'string', description: 'UUID del platform_incidents row.' },
    },
    required: ['incidente_id'],
  },
};

const CONSULTAR_BILLING_ORG_TOOL: Anthropic.Tool = {
  name: 'consultar_billing_org',
  description: 'Uso exclusivo de Nash. Devuelve estado billing REAL de una org: minutos y tareas usados/disponibles del pool, ciclo de reset, modelo de facturación (stripe / annual_prepaid), flag ledger, y lista de empleados con su jornada. Úsala SIEMPRE que el owner pregunte por cifras de una cuenta ("¿cuánto llevan?", "¿ya se les están acabando los minutos a X?", "estado del cliente Y") — es la única forma de responder sin inventar números. Nunca reportes cifras al owner sin haber invocado esta tool primero.',
  input_schema: {
    type: 'object' as const,
    properties: {
      portal_email: { type: 'string', description: 'portal_email de la organización a consultar (el email del portal cliente, NO el negocio).' },
    },
    required: ['portal_email'],
  },
};

// pedir_a_humano — universal, todos los empleados pueden escalar al humano.
// Voice ya lo tenía (sync.ts:406), email también (inbox-processor). En chat
// portal estaba AUSENTE — Niva/Nox halucinaban "listo, escalado" sin crear
// row en human_requests, bypasseando el anti-abuse counter. CRITICAL fix.
// Ver [[handoff-audits-pending-scopes]] Scope B Agent 1 gap #5 + silent-failure #1.
const PEDIR_A_HUMANO_TOOL: Anthropic.Tool = {
  name: 'pedir_a_humano',
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
};

// Migrated to registry: src/lib/tools/schemas.ts
const REPORT_ISSUE_TOOL: Anthropic.Tool = toAnthropicTool(TOOL_SCHEMAS['reportar_falla']);

// Migrated to registry: src/lib/tools/schemas.ts
const DELEGATE_TASK_TOOL: Anthropic.Tool = toAnthropicTool(TOOL_SCHEMAS['delegate_task']);

// Migrated to registry: src/lib/tools/schemas.ts
const CONSULT_AGENT_TOOL: Anthropic.Tool = toAnthropicTool(TOOL_SCHEMAS['consult_agent']);

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
  // ── pack ciclo_oc_cfdi (Nala + Nox) ───────────────────────────────────────
  {
    name: 'qb_crear_orden_compra',
    description: 'Crea una Orden de Compra en QuickBooks para un proveedor y abre un expediente para dar seguimiento al ciclo completo (firma → pago → CFDI). Confirma proveedor + conceptos con el dueño antes de ejecutar. Consume 1 tarea.',
    input_schema: {
      type: 'object' as const,
      properties: {
        proveedor_nombre: { type: 'string', description: 'Nombre del proveedor (se busca en QB por LIKE, se crea si no existe).' },
        proveedor_rfc:    { type: 'string', description: 'RFC del proveedor (opcional pero recomendado para autofirma).' },
        proveedor_email:  { type: 'string', description: 'Correo del proveedor para enviarle la OC firmada.' },
        conceptos: {
          type: 'array',
          description: 'Lista de conceptos/partidas de la OC.',
          items: {
            type: 'object',
            properties: {
              descripcion:     { type: 'string' },
              cantidad:        { type: 'number' },
              precio_unitario: { type: 'number' },
            },
            required: ['descripcion', 'cantidad', 'precio_unitario'],
          },
        },
        folio_interno: { type: 'string', description: 'Folio interno de proyecto/expediente del cliente (opcional).' },
        descripcion:   { type: 'string', description: 'Descripción corta del expediente (opcional).' },
      },
      required: ['proveedor_nombre', 'conceptos'],
    },
  },
  {
    name: 'qb_consultar_orden_compra',
    description: 'Lee los datos de una OC de QuickBooks + estado del expediente. Solo lectura, no consume tareas.',
    input_schema: {
      type: 'object' as const,
      properties: {
        expediente_id: { type: 'string', description: 'UUID del expediente (preferido).' },
        qb_po_id:      { type: 'string', description: 'ID de la OC en QuickBooks (alternativa).' },
      },
      required: [],
    },
  },
  {
    name: 'qb_descargar_oc_pdf',
    description: 'Descarga el PDF de la OC desde QuickBooks y lo archiva en Storage para poder firmarlo. Consume 1 tarea.',
    input_schema: {
      type: 'object' as const,
      properties: {
        expediente_id: { type: 'string', description: 'UUID del expediente.' },
      },
      required: ['expediente_id'],
    },
  },
  {
    name: 'firmar_oc',
    description: 'Evalúa reglas de autofirma (monto ≤ tope + datos completos + no duplicados) y si pasan, aplica la firma digitalizada al PDF de la OC. Si no pasan, escala al humano. Consume 1 tarea.',
    input_schema: {
      type: 'object' as const,
      properties: {
        expediente_id: { type: 'string', description: 'UUID del expediente.' },
      },
      required: ['expediente_id'],
    },
  },
  {
    name: 'sf_timbrar_desde_oc',
    description: 'Timbra CFDI en Solución Factible copiando los conceptos del expediente OC (mismo precio, sin markup). Requiere datos fiscales del cliente. Confirma con el dueño antes de ejecutar. Consume 1 tarea.',
    input_schema: {
      type: 'object' as const,
      properties: {
        expediente_id:  { type: 'string', description: 'UUID del expediente OC.' },
        cliente_nombre: { type: 'string', description: 'Razón social del cliente receptor.' },
        cliente_rfc:    { type: 'string', description: 'RFC del cliente receptor.' },
        cliente_email:  { type: 'string', description: 'Correo del cliente para enviar el CFDI.' },
        uso_cfdi:       { type: 'string', description: 'Clave del uso CFDI (ej. G03 gastos en general).' },
        forma_pago:     { type: 'string', description: 'Clave de forma de pago (ej. 03 transferencia, 01 efectivo).' },
        metodo_pago:    { type: 'string', description: 'Clave de método de pago (PUE = pago único, PPD = parcialidades).' },
      },
      required: ['expediente_id', 'cliente_nombre', 'cliente_rfc', 'cliente_email', 'uso_cfdi', 'forma_pago', 'metodo_pago'],
    },
  },
  // ── pack ciclo_oc_cfdi bloque A ────────────────────────────────────────────
  {
    name: 'enviar_oc_a_firma_humana',
    description: 'Nox: escala OC al autorizador humano por correo cuando la autofirma no procede. El autorizador se lee del directorio (is_oc_autorizador). Adjunta PDF y explicación de por qué no se autofirmó. Consume 1 tarea.',
    input_schema: {
      type: 'object' as const,
      properties: {
        expediente_id: { type: 'string', description: 'UUID del expediente.' },
        razon:         { type: 'string', description: 'Razón de la escalación (default: la razón guardada en el expediente).' },
      },
      required: ['expediente_id'],
    },
  },
  {
    name: 'enviar_oc_a_pagos',
    description: 'Nala: envía la OC firmada por correo al depto de pagos (is_oc_pagos en el directorio) para que hagan la transferencia bancaria. Consume 1 tarea.',
    input_schema: {
      type: 'object' as const,
      properties: {
        expediente_id:    { type: 'string', description: 'UUID del expediente.' },
        datos_bancarios:  { type: 'string', description: 'CLABE, cuenta, banco del proveedor (opcional pero recomendado).' },
        nota:             { type: 'string', description: 'Nota interna opcional para el depto de pagos.' },
      },
      required: ['expediente_id'],
    },
  },
  {
    name: 'registrar_comprobante_pago',
    description: 'Nala: registra el comprobante de pago que regresa el depto de pagos y transiciona el expediente a `oc_pagada`. Acepta base64 o path si ya está en Storage. Consume 1 tarea.',
    input_schema: {
      type: 'object' as const,
      properties: {
        expediente_id:            { type: 'string', description: 'UUID del expediente.' },
        comprobante_base64:       { type: 'string', description: 'Contenido del archivo del comprobante en base64 (PDF o imagen, max 5MB).' },
        extension:                { type: 'string', description: 'Extensión del archivo (pdf, png, jpg). Default: pdf.' },
        comprobante_storage_path: { type: 'string', description: 'Alternativa a base64: path del archivo en bucket cfdi si ya está subido.' },
        nota:                     { type: 'string', description: 'Nota opcional (fecha real de pago, referencia bancaria, etc.).' },
      },
      required: ['expediente_id'],
    },
  },
  {
    name: 'enviar_oc_a_proveedor',
    description: 'Nala: envía OC firmada + comprobante de pago por correo al proveedor para que libere la mercancía. Requiere expediente en `oc_pagada`. Verifier obligatorio (destructivo). Consume 1 tarea.',
    input_schema: {
      type: 'object' as const,
      properties: {
        expediente_id: { type: 'string', description: 'UUID del expediente.' },
        mensaje:       { type: 'string', description: 'Mensaje custom al proveedor (opcional, hay uno por default).' },
      },
      required: ['expediente_id'],
    },
  },
  {
    name: 'archivar_expediente',
    description: 'Nala: archiva XML+PDF+acuse del CFDI (y OC firmada) en el destino configurado por el dueño (Dropbox / SMB local / Windows agent) con la nomenclatura definida en el portal. Requiere expediente con CFDI timbrado. Consume 1 tarea.',
    input_schema: {
      type: 'object' as const,
      properties: {
        expediente_id: { type: 'string', description: 'UUID del expediente.' },
      },
      required: ['expediente_id'],
    },
  },
  {
    name: 'qb_crear_orden_compra_desde_cotizacion',
    description: 'Nala: parsea una cotización de proveedor (PDF o imagen) con Vision AI y crea la Orden de Compra en QuickBooks automáticamente. Extrae proveedor + items + precios. Delega en qb_crear_orden_compra internamente. Verifier obligatorio (destructivo, 1 op).',
    input_schema: {
      type: 'object' as const,
      properties: {
        cotizacion_base64:       { type: 'string', description: 'Contenido del archivo de cotización en base64 (PDF o imagen, max 15MB). Alternativa a cotizacion_storage_path.' },
        cotizacion_storage_path: { type: 'string', description: 'Path del archivo en bucket cfdi si ya está subido. Alternativa a cotizacion_base64.' },
        mime_type:               { type: 'string', description: 'MIME type del archivo (application/pdf, image/jpeg, image/png). Si viene de Storage se infiere de la extensión.' },
        folio_interno:           { type: 'string', description: 'Folio de proyecto/expediente del cliente (opcional).' },
        descripcion:             { type: 'string', description: 'Descripción corta del expediente (opcional, hay un default).' },
      },
      required: [],
    },
  },
  {
    name: 'qb_crear_cotizacion',
    description: 'Nox: crea una cotización (Estimate) en QuickBooks para un cliente. Verifier obligatorio (destructivo). Consume 1 tarea.',
    input_schema: {
      type: 'object' as const,
      properties: {
        cliente_nombre: { type: 'string', description: 'Nombre exacto del cliente en QuickBooks.' },
        conceptos: {
          type: 'array',
          description: 'Partidas de la cotización.',
          items: {
            type: 'object',
            properties: {
              descripcion:     { type: 'string' },
              cantidad:        { type: 'number' },
              precio_unitario: { type: 'number' },
            },
            required: ['descripcion', 'cantidad', 'precio_unitario'],
          },
        },
        vigencia_dias: { type: 'number', description: 'Días de vigencia de la cotización (opcional).' },
        notas:         { type: 'string', description: 'Nota para el cliente (opcional, aparece en el PDF).' },
      },
      required: ['cliente_nombre', 'conceptos'],
    },
  },
  {
    name: 'qb_registrar_gasto',
    description: 'Nox: registra un gasto en QuickBooks (Purchase) contra una cuenta bancaria o tarjeta. Verifier obligatorio (destructivo). Consume 1 tarea.',
    input_schema: {
      type: 'object' as const,
      properties: {
        concepto:         { type: 'string', description: 'Descripción del gasto.' },
        monto:            { type: 'number', description: 'Monto en MXN.' },
        proveedor_nombre: { type: 'string', description: 'Nombre del proveedor si aplica (opcional).' },
        cuenta_gasto:     { type: 'string', description: 'Nombre de la cuenta de gasto en QB (default: primera cuenta Expense).' },
        forma_pago:       { type: 'string', enum: ['efectivo', 'transferencia', 'tarjeta', 'cheque'], description: 'Forma de pago (opcional).' },
        fecha:            { type: 'string', description: 'Fecha YYYY-MM-DD (default: hoy).' },
      },
      required: ['concepto', 'monto'],
    },
  },
  {
    name: 'qb_registrar_caja_chica',
    description: 'Nox: registra un gasto pequeño contra la cuenta de Caja Chica en QuickBooks. Requiere que exista una cuenta "Caja Chica" o "Petty Cash" tipo Bank. Verifier obligatorio (destructivo). Consume 1 tarea.',
    input_schema: {
      type: 'object' as const,
      properties: {
        concepto:     { type: 'string', description: 'Descripción del gasto.' },
        monto:        { type: 'number', description: 'Monto en MXN.' },
        cuenta_gasto: { type: 'string', description: 'Cuenta contable de gasto (default: primera Expense).' },
        fecha:        { type: 'string', description: 'Fecha YYYY-MM-DD (default: hoy).' },
      },
      required: ['concepto', 'monto'],
    },
  },
  {
    name: 'sf_cancelar_cfdi',
    description: 'Nala: solicita cancelación de CFDI ante el SAT via Solución Factible. Requiere que el dueño haya activado "Permitir cancelación por empleado" en el portal. Motivo 01 requiere uuid_sustituto. Verifier obligatorio (destructivo IRREVERSIBLE). Consume 1 tarea.',
    input_schema: {
      type: 'object' as const,
      properties: {
        expediente_id:  { type: 'string', description: 'UUID del expediente (alternativa: uuid directo del CFDI).' },
        uuid:           { type: 'string', description: 'UUID del CFDI a cancelar (alternativa: expediente_id).' },
        motivo:         { type: 'string', enum: ['01', '02', '03', '04'], description: '01=sustitución, 02=error sin relación, 03=no se llevó a cabo, 04=nominativa relacionada.' },
        uuid_sustituto: { type: 'string', description: 'UUID del CFDI que sustituye al cancelado (obligatorio si motivo=01).' },
        razon_cliente:  { type: 'string', description: 'Razón que dio el cliente (opcional, se guarda en audit).' },
      },
      required: ['motivo'],
    },
  },
  {
    name: 'sf_consultar_estado_sat',
    description: 'Nala: consulta el estado real de una cancelación de CFDI ante el SAT via Solución Factible. Read-only, no consume tareas.',
    input_schema: {
      type: 'object' as const,
      properties: {
        expediente_id: { type: 'string', description: 'UUID del expediente (alternativa: uuid).' },
        uuid:          { type: 'string', description: 'UUID del CFDI (alternativa: expediente_id).' },
      },
      required: [],
    },
  },
];

// Migrated to registry: src/lib/tools/schemas.ts
const CREAR_LEAD_TOOL: Anthropic.Tool = toAnthropicTool(TOOL_SCHEMAS['crear_lead']);

// Migrated to registry: src/lib/tools/schemas.ts
const BUSCAR_CORREO_ENVIADO_TOOL: Anthropic.Tool = toAnthropicTool(TOOL_SCHEMAS['buscar_correo_enviado']);

// Migrated to registry: src/lib/tools/schemas.ts
const CREAR_CONTACTO_SALIENTE_TOOL: Anthropic.Tool = toAnthropicTool(TOOL_SCHEMAS['crear_contacto_saliente']);

// Migrated to registry: src/lib/tools/schemas.ts
const AGENDAR_CITA_TOOL: Anthropic.Tool = toAnthropicTool(TOOL_SCHEMAS['agendar_cita']);

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

// Migrated to registry: src/lib/tools/schemas.ts
const BUSCAR_CLIENTE_TOOL: Anthropic.Tool = toAnthropicTool(TOOL_SCHEMAS['buscar_cliente']);

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

const CATALOGO_BUSCAR_CODIGO_TOOL: Anthropic.Tool = {
  name: 'catalogo_buscar_codigo',
  description: 'Busca un código de pieza o producto en el catálogo Excel/CSV que el cliente mantiene en su almacenamiento en la nube (Dropbox, Google Drive u OneDrive según su config). Úsala ANTES de llenar una OC, cotización o factura cuando necesites el SKU correcto. Devuelve hasta 20 coincidencias con SKU, descripción y precio (si aplica). Si pasas exact:true busca match exacto sólo contra SKU. NO inventes códigos si no encuentras — dile al usuario y ofrece delegar a humano.',
  input_schema: {
    type: 'object' as const,
    properties: {
      query: { type: 'string', description: 'Término a buscar (parte del SKU o descripción). Case-insensitive.' },
      exact: { type: 'boolean', description: 'True para match exacto contra SKU. Default false (fuzzy).' },
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
  CREAR_CONTACTO_SALIENTE_TOOL,
  BUSCAR_CORREO_ENVIADO_TOOL,
  AGENDAR_CITA_TOOL,
  REGISTRAR_PEDIDO_TOOL,
  BUSCAR_CLIENTE_TOOL,
  CREAR_TICKET_TOOL,
  CONSULTAR_INCIDENTES_TOOL,
  BUSCAR_DIRECTORIO_TOOL,
  INICIAR_ONBOARDING_TOOL,
  PEDIR_A_HUMANO_TOOL,
];

// VOICE_TO_CHAT y UNIVERSAL_TOOLS viven en src/lib/tools/channel-mapping.ts
// (compartidos con inbox-processor para filtrar tools por meerkat en email).

// Chat tool name → Anthropic.Tool object
const CHAT_TOOL_BY_NAME: Record<string, Anthropic.Tool> = {
  delegate_task:             DELEGATE_TASK_TOOL,
  consult_agent:             CONSULT_AGENT_TOOL,
  create_contract_draft:     CREATE_CONTRACT_DRAFT_TOOL,
  send_email:                SEND_EMAIL_TOOL,
  create_document:           CREATE_DOCUMENT_TOOL,
  buscar_documento_oficina:  BUSCAR_DOCUMENTO_OFICINA_TOOL,
  enviar_documento_oficina:  ENVIAR_DOCUMENTO_OFICINA_TOOL,
  solicitar_factura:              SOLICITAR_FACTURA_TOOL,
  consultar_factura:              CONSULTAR_FACTURA_TOOL,
  solicitar_cancelacion_factura:  SOLICITAR_CANCELACION_FACTURA_TOOL,
  revisar_desempeno_equipo:   REVISAR_DESEMPENO_EQUIPO_TOOL,
  aprobar_gasto:              APROBAR_GASTO_TOOL,
  evaluar_limite_gasto:       EVALUAR_LIMITE_GASTO_TOOL,
  verificar_gasto_recurrente: VERIFICAR_GASTO_RECURRENTE_TOOL,
  sheets_agregar_fila:        SHEETS_AGREGAR_FILA_TOOL,
  sheets_actualizar_fila:     SHEETS_ACTUALIZAR_FILA_TOOL,
  sheets_leer:                SHEETS_LEER_TOOL,
  sheets_buscar:              SHEETS_BUSCAR_TOOL,
  agregar_tag_contacto:      AGREGAR_TAG_CONTACTO_TOOL,
  pedir_a_humano:            PEDIR_A_HUMANO_TOOL,
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
  crear_contacto_saliente:   CREAR_CONTACTO_SALIENTE_TOOL,
  buscar_correo_enviado:     BUSCAR_CORREO_ENVIADO_TOOL,
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
  catalogo_buscar_codigo: CATALOGO_BUSCAR_CODIGO_TOOL,
  revisar_incidentes_plataforma: REVISAR_INCIDENTES_PLATAFORMA_TOOL,
  crear_incidente:               CREAR_INCIDENTE_TOOL,
  responder_cliente_afectado:    RESPONDER_CLIENTE_AFECTADO_TOOL,
  enviar_a_claude_code:          ENVIAR_A_CLAUDE_CODE_TOOL,
  escalar_al_owner:              ESCALAR_AL_OWNER_TOOL,
  verificar_fix:                 VERIFICAR_FIX_TOOL,
  consultar_billing_org:         CONSULTAR_BILLING_ORG_TOOL,
};

// Nash-only tools — nunca en ALL_TOOLS, se agregan condicionalmente cuando
// getToolsForRole detecta meerkat_role_id === 'nash'.
const NASH_TOOLS: Anthropic.Tool[] = [
  REVISAR_INCIDENTES_PLATAFORMA_TOOL,
  CREAR_INCIDENTE_TOOL,
  RESPONDER_CLIENTE_AFECTADO_TOOL,
  ENVIAR_A_CLAUDE_CODE_TOOL,
  ESCALAR_AL_OWNER_TOOL,
  VERIFICAR_FIX_TOOL,
  CONSULTAR_BILLING_ORG_TOOL,
];

function getToolsForRole(meerkatId: string | null, qbConnected: boolean, notionProductsConnected: boolean): Anthropic.Tool[] {
  const voiceNames = meerkatId && meerkatId !== 'custom'
    ? MEERKAT_VOICE_DISTRIBUTION[meerkatId] ?? null
    : null;

  const extras = [
    ...(qbConnected              ? QB_TOOLS              : []),
    ...(notionProductsConnected  ? [BUSCAR_PRODUCTO_TOOL] : []),
  ];

  // Custom agents or unknown role → previous behavior (all tools).
  // Nash (meerkat interno) además recibe sus tools exclusivas.
  if (!voiceNames) {
    const base = [...ALL_TOOLS, ...extras];
    return meerkatId === 'nash' ? [...base, ...NASH_TOOLS] : base;
  }

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
  // Base universal — ver src/lib/tools/channel-mapping.ts (UNIVERSAL_TOOLS).
  // Se agregan después del loop para no duplicar si el preset ya las listó.
  for (const name of UNIVERSAL_TOOLS) {
    if (seen.has(name)) continue;
    const t = CHAT_TOOL_BY_NAME[name];
    if (t) { tools.push(t); seen.add(name); }
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

  // Guard vs mensajes vacíos/whitespace — evita cobrar 3 ops por LLM call
  // que no va a producir nada útil. Fix 2026-08-10.
  const lastMsg = messages[messages.length - 1];
  if (lastMsg?.role === 'user' && !String(lastMsg.content ?? '').trim()) {
    return NextResponse.json({ error: 'Mensaje vacío. No se consumieron tareas.' }, { status: 400 });
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

  const accountAgent = await getPrimaryAgentFromToken<{ id: string; portal_email: string }>(token, 'id, portal_email', supabase);
  if (!accountAgent) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });

  // IDOR guard: session must belong to the same account as the URL token
  if (accountAgent.portal_email && auth.portalEmail && accountAgent.portal_email !== auth.portalEmail) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const targetQuery: Promise<{ data: any }> = agentId
    ? accountAgent.portal_email
      ? supabase.from('voice_agents').select('*').eq('id', agentId).eq('portal_email', accountAgent.portal_email).single() as any
      : supabase.from('voice_agents').select('*').eq('id', agentId).eq('id', accountAgent.id).single() as any
    : getPrimaryAgentFromToken<any>(token, '*', supabase).then(data => ({ data }));
  // Notion es org-level desde 2026-08-09 (vive en organizations, no en
  // voice_agents). Se lee en paralelo con agent y qbRow.
  const [{ data: agent }, { data: qbRow }, { data: orgNotion }, { data: orgContact }] = await Promise.all([
    targetQuery,
    supabase.from('qb_integrations').select('realm_id').eq('portal_email', accountAgent.portal_email).maybeSingle(),
    accountAgent.portal_email
      ? supabase.from('organizations').select('notion_access_token, notion_db_id, notion_products_db_id, invoicing_allow_agent_cancellation').eq('portal_email', accountAgent.portal_email).maybeSingle()
      : Promise.resolve({ data: null }),
    accountAgent.portal_email
      ? supabase.from('organizations').select('business_email, brand_phone, business_website, brand_website, brand_address, email_footer_text, daily_availability, industry').eq('portal_email', accountAgent.portal_email).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  if (!agent) return NextResponse.json({ error: 'Agent not found' }, { status: 404 });

  const qbConnected             = !!qbRow?.realm_id;
  const agentFeatures           = (agent.features as Record<string, unknown>) ?? {};
  const meerkatId               = (agentFeatures.meerkat_role_id  as string | null) ?? null;
  const notionProductsConnected = !!(orgNotion?.notion_access_token && orgNotion?.notion_products_db_id);
  const sessionTools            = getToolsForRole(meerkatId, qbConnected, notionProductsConnected);

  // solicitar_cancelacion_factura — org-level toggle (condicional).
  if ((orgNotion as { invoicing_allow_agent_cancellation?: boolean } | null)?.invoicing_allow_agent_cancellation === true) {
    sessionTools.push(SOLICITAR_CANCELACION_FACTURA_TOOL);
  }

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

  // actualizar_disponibilidad_diaria — industry-gated (restaurante, retail, clinica, hotel)
  {
    const industry = getOrgIndustry(orgContact as { industry?: string | null } | null);
    if (industry && INDUSTRIES_WITH_DAILY_AVAILABILITY.includes(industry)) {
      sessionTools.push(ACTUALIZAR_DISPONIBILIDAD_DIARIA_TOOL);
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

  // Team numbers — persistent memory for specific team members (directorio unificado en organizations.directory)
  const { loadOrgDirectory, toTeamNumbers, renderOrgTeamRoster } = await import('@/lib/portal/directory');
  const directory   = await loadOrgDirectory((agent as any).portal_email, supabase);
  const teamNumbers = toTeamNumbers(directory);

  // Roster completo (fuente única). Va antes del historial de llamadas para
  // que el agente sepa quiénes existen antes de leer qué han hecho.
  const rosterBlock = renderOrgTeamRoster(directory);
  if (rosterBlock) sections.push(`# Equipo humano\n${rosterBlock}`);

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

  if (orgNotion?.notion_access_token && orgNotion?.notion_db_id) {
    try {
      const notion = notionClient(orgNotion.notion_access_token as string);
      const { results } = await (notion.databases as any).query({
        database_id: orgNotion.notion_db_id as string,
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

  // Fecha actual + datos de contacto de la org — sin esto el modelo alucina
  // años viejos (bug 2026-08-10: Niva puso "11 de agosto de 2025") y omite
  // datos reales de contacto al redactar correos ("contáctenos" sin teléfono).
  const nowForPrompt = new Date();
  const todayIso     = nowForPrompt.toISOString().slice(0, 10);
  const todayEs      = nowForPrompt.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const dateBlock    = `## Fecha actual\nHoy es ${todayEs} (${todayIso}). USA este año en cualquier fecha que redactes — no repitas años pasados.`;

  const orgC = orgContact as { business_email?: string | null; brand_phone?: string | null; business_website?: string | null; brand_website?: string | null; brand_address?: string | null; email_footer_text?: string | null; daily_availability?: unknown } | null;
  const contactLines: string[] = [];
  const contactEmail = orgC?.business_email || accountAgent.portal_email;
  const contactSite  = orgC?.business_website || orgC?.brand_website;
  if (contactEmail)         contactLines.push(`- Correo: ${contactEmail}`);
  if (orgC?.brand_phone)    contactLines.push(`- Teléfono: ${orgC.brand_phone}`);
  if (contactSite)          contactLines.push(`- Sitio web: ${contactSite}`);
  if (orgC?.brand_address)  contactLines.push(`- Dirección: ${orgC.brand_address}`);
  const contactBlock = contactLines.length > 0
    ? `## Datos de contacto de tu empresa\nSIEMPRE que redactes un correo, cotización, contrato o firma para un cliente, incluye estos datos al final para que puedan contactarnos:\n${contactLines.join('\n')}`
    : '';
  const footerBlock = orgC?.email_footer_text?.trim()
    ? `## Firma de correos por default\n${orgC.email_footer_text.trim()}`
    : '';

  // ── Daily availability (industry-gated) ─────────────────────────────────────
  const chatIndustry   = getOrgIndustry(orgC as { industry?: string | null } | null);
  const chatDailyBlock = chatIndustry
    ? formatDailyAvailabilityForPrompt((orgC?.daily_availability ?? null) as import('@/lib/daily-availability').DailyAvailability | null, chatIndustry)
    : '';

  const system = `Eres ${agentName}, empleado de ${agent.business_name}${agentRole ? ` con el rol de ${agentRole}` : ''}.

El dueño del negocio te está consultando directamente. Tienes acceso completo a tu operación: manual de la empresa, llamadas recientes, bandeja de entrada, juntas, contratos y CRM.

Responde como el empleado que conoce profundamente el negocio. Usa los datos disponibles para dar respuestas precisas y concretas. Cita fechas y nombres cuando los tengas. Si la información no está en tu contexto, dilo con claridad.

${toolsListText}

Cuando necesites información para completar una tarea: usa buscar_en_web con la query más precisa posible, luego read_url en 1-3 resultados útiles, luego actúa con lo que encontraste.
Cuando el dueño pida investigación de mercado o prospectos: usa search_leads con el research_type correcto, luego read_url en 2-3 resultados, luego presenta un resumen estructurado.

Usa las herramientas de inmediato cuando el dueño te lo pida, sin pedir confirmación adicional.

## REGLA DURA: PROHIBIDO INVENTAR URLs

Nunca inventes ni "adivines" URLs de Google Meet, Zoom, Drive, sitios web, redes sociales, o cualquier otro link. Los links que pongas en correos, docs o mensajes DEBEN venir de:
1. Una tool que te devolvió el link (ej: create_calendar_event con generate_meet_link=true → devuelve el meet_link real en el message; save_to_drive → devuelve URL).
2. Un dato que el dueño te dio explícitamente en la conversación.
3. Los datos de contacto de la empresa (business_website).

Si necesitas incluir un link de reunión en un correo y NO tienes uno, PRIMERO invoca create_calendar_event con generate_meet_link=true para generar uno real, LUEGO usa ese link. NO escribas correos con links inventados tipo "meet.google.com/abc-defg-hij" — Google rechaza códigos inventados y el cliente ve error al abrir. Si de plano no puedes obtener el link real, escribe "te enviaré el link por separado" en vez de inventar uno.

## REGLA CRÍTICA: Ejecutar tools, no narrarlos

Cuando decidas usar una herramienta, INVÓCALA. No digas "voy a revisar", "voy a generar", "déjame ver" sin haber invocado la tool en ese mismo turno. Si escribes solo texto describiendo la acción sin invocar la tool, tu turno queda incompleto y el dueño se queda esperando. El texto narrativo sin tool_use es una FALLA.

Ejemplo INCORRECTO (nunca hagas esto):
Usuario: "Genera propuesta para ACME sobre CRM 50k"
Tú: "Entendido, voy a revisar si hay propuestas previas y genero la nueva." [FIN DE TURNO — falla]

Ejemplo CORRECTO:
Usuario: "Genera propuesta para ACME sobre CRM 50k"
Tú: [invoca buscar_documento_oficina({query: 'ACME'})] → [ve resultados] → "Encontré 2 propuestas previas de ACME (16:22 y 15:55 de hoy). ¿Reutilizamos alguna o genero una nueva versión?"

Cuando el dueño te pida generar propuesta/cotización/one_pager/correo, tu PRIMER paso obligatorio es invocar buscar_documento_oficina antes de generar. La query depende del contexto:
- Si mencionó un CLIENTE (ej "para ACME"): query = nombre del cliente.
- Si mencionó un TEMA/SERVICIO (ej "sobre CRM", "sobre reactivación de clientes"): query = palabra clave del tema.
- Si no dio ni cliente ni tema: query = tipo de documento (ej "propuesta", "one-pager").
Sin excepciones. Narrar "reviso si hay algo previo" o "déjame checar" o "primero busco" SIN invocar la tool en el mismo turno es una FALLA — el tool_use debe ir ANTES o INMEDIATAMENTE al lado del texto narrativo, nunca solo el texto.

## Feedback sobre bugs de la plataforma

Si el dueño te reporta un bug visual, de layout o de comportamiento del portal ("el PDF sale con página en blanco", "el UI no muestra X", "el botón no funciona"), USA reportar_falla para que el equipo de Centinelia lo sepa. Después CONTINÚA de inmediato con la tarea que el dueño te haya pedido — no te detengas después de reportar, tu turno no termina ahí. Ejemplo: si el dueño dice "el PDF salió con página en blanco, genera otra propuesta para ACME", debes en el mismo turno: (1) invocar reportar_falla con la descripción del bug, (2) invocar buscar_documento_oficina con query 'ACME', (3) mostrar los resultados y proponer siguiente acción.

## Cuando una herramienta falla

**Error de autenticación o sesión expirada** (tokens inválidos, "not authenticated", "unauthorized", "re-authentication required", "session expired", permisos revocados): NO uses reportar_falla. Informa al dueño que la integración necesita reconectarse y dile exactamente qué hacer: ir a Integraciones en el portal y volver a conectar la plataforma afectada (Google, Outlook, OneDrive, etc.). Es un paso que el dueño resuelve solo.

**Integración no disponible o no habilitada**: Informa al dueño y sugiere que contacte a Centinelia si necesita activarla:
- Correo: ${SUPPORT_EMAIL}
- WhatsApp: ${SUPPORT_WA}

No prometas que la integración se habilitará: depende de si la plataforma lo permite.

**Error inesperado del sistema** (falla técnica real: timeout de API, error de escritura, comportamiento incorrecto de una herramienta, resultado corrupto, error al procesar archivo): usa reportar_falla para notificar al equipo de Centinelia, luego informa al dueño que detectaste un problema y que ya fue reportado.

## Cuando otro compañero del equipo ya se encargó

Si una tool responde con \`deduped: true\` (mensaje tipo "<compañero> ya se encargó de este reporte…"), NO es un error tuyo — el equipo se coordina por debajo para no duplicar reportes ni gastar dos veces las tareas del cliente. Acepta el resultado y avísale al dueño con naturalidad: "Ya lo mandó <compañero>, no volví a enviarlo para no consumir otra tarea." Después continúa con lo que sigue.

Cosas que NO debes hacer al ver \`deduped: true\`:
- Reintentar la misma tool con args similares.
- Cambiar de canal para el mismo mensaje (ej: send_email deduped → intentar WhatsApp del mismo contenido).
- Escalar con reportar_falla, pedir_a_humano o enviar_a_claude_code "para asegurar".
- Delegar a otro compañero pidiendo que reintente.

Aplica a: send_email, enviar_documento_oficina, responder_cliente_afectado, escalar_al_owner, pedir_a_humano (con target=owner), delegar_tarea. La deduplicación tiene ventana de horas — si el mismo asunto reaparece días después, la tool volverá a funcionar normalmente.

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

Responde en español mexicano. Sé directo: 2 a 5 oraciones a menos que se pida más detalle.

## Formato de respuestas

El portal renderiza tu respuesta con markdown, así que úsalo naturalmente para hacerla legible:

- **Párrafos separados** (doble salto de línea) cuando la respuesta tenga varias ideas. No pegues todo en un solo bloque corrido.
- **Bullets** con \`- item\` cuando enumeres 3+ cosas.
- **Negrita** con \`**texto**\` para resaltar nombres, decisiones o cantidades importantes.
- **Nunca** uses headings grandes (# o ##). Si necesitas separar secciones dentro de una respuesta larga, usa una línea con **texto en negrita** como mini-título.
- Si listas números o pasos ordenados, usa \`1. 2. 3.\`

Respuestas cortas: 1 oración. Respuestas de detalle: 2-3 párrafos + bullets si aplica. Cero em-dashes (— o –).
${kbPortal ? `\n## Guía de marca y terminología\n${kbPortal}` : ''}

${dateBlock}

${contactBlock}

${footerBlock}
${chatDailyBlock ? `\n${chatDailyBlock}` : ''}

## Contexto operativo

${context}`;

  // 3 ops per initial Sonnet call
  const opsResult = await consumeAiOp(agent.id as string, 3, { source: 'agent_chat', label: 'Consulta con empleado desde chat' });
  if (!opsResult.ok) {
    return NextResponse.json({ error: 'ops_limit_reached', used: opsResult.used, limit: opsResult.limit }, { status: 429 });
  }

  // Append low-ops alert to system prompt when running critically low
  const opsRemain = Math.max(0, opsResult.limit - opsResult.used);
  const opsLow    = opsResult.limit > 0 && opsRemain <= Math.max(20, opsResult.limit * 0.15);
  const systemWithAlert = opsLow
    ? system + `\n\nAVISO INTERNO DE USO: Quedan solo ${opsRemain} tareas disponibles este mes (de ${opsResult.limit}). AL INICIO DE ESTA RESPUESTA, antes de atender lo que pida el dueño, menciona brevemente en una sola frase que las tareas están casi agotadas y que puede comprar más desde Cuenta → Minutos y uso. Luego responde normalmente.`
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
      // Post-filter determinístico contra em/en-dashes que Sonnet emite pese al
      // prompt. Cubre — – ‒ ― − ⸺ ⸻. Reemplazo por ", " para preservar pausa.
      const stripEmDashes = (t: string): string => t.replace(/[‒–—―−⸺⸻]/g, ', ');
      const send = (text: string) =>
        controller.enqueue(enc.encode(`data: ${JSON.stringify({ text: stripEmDashes(text) })}\n\n`));

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
        // Flag persistente entre iteraciones del loop agéntico. assistantBlocks se
        // resetea por iteración, así que necesitamos rastrear a nivel turno-completo
        // si ya emitimos texto para saber cuándo insertar separadores visuales.
        let hasEmittedText = false;

        // Anti-hallucination: si el usuario claramente pide "generar X",
        // forzamos tool_choice=buscar_documento_oficina en la primera llamada
        // al LLM para que NO pueda saltarse la búsqueda de documentos previos.
        // Instrucciones del prompt no bastan — Sonnet las ignora regularmente.
        const lastUserMsg = [...conversationMessages].reverse().find(m => m.role === 'user');
        const lastUserTextForIntent = typeof lastUserMsg?.content === 'string'
          ? lastUserMsg.content
          : Array.isArray(lastUserMsg?.content)
            ? (lastUserMsg.content as Array<{ type: string; text?: string }>)
                .filter(b => b.type === 'text').map(b => b.text ?? '').join(' ')
            : '';
        // Regex más amplia — captura verbos comunes + tipos de doc + variantes
        const GENERATE_INTENT_RE = /\b(?:genera(?:r|me)?|crear?|creame|hac(?:er|eme|elo|elo)|has|hazme|hazlo|redacta|prepara|necesito|quiero|dame|arma|manda|env[íi]a)[a-z\s]{0,30}?(?:propuesta|cotizaci[óo]n|one[\s-]?pager|onepager|correo|carta|pitch|deck|slide|reporte|documento|pdf|excel|powerpoint)/i;
        const wantsGenerate  = GENERATE_INTENT_RE.test(lastUserTextForIntent);
        const hasSearchTool  = sessionTools.some((t: { name?: string }) => t.name === 'buscar_documento_oficina');
        const forceSearchTool = wantsGenerate && hasSearchTool;
        // Debug: emitir el estado al frontend para inspección en DevTools Console
        // (Vercel Request Logs no muestra console.log — solo Warnings/Errors).
        controller.enqueue(enc.encode(`data: ${JSON.stringify({
          debug: {
            source:       'agent-chat/force-search',
            lastUserText: lastUserTextForIntent.slice(0, 200),
            wantsGenerate,
            hasSearchTool,
            forceSearchTool,
            toolCount:    sessionTools.length,
            regexTested:  GENERATE_INTENT_RE.source,
          },
        })}\n\n`));
        console.warn('[agent-chat/force-search]', { wantsGenerate, hasSearchTool, forceSearchTool });

        while (callCount < MAX_CALLS) {
          // Charge 2 ops for every call after the first (first was charged above)
          if (callCount > 0) {
            const midOps = await consumeAiOp(agent.id as string, 2, { source: 'agent_chat_loop', label: 'Iteración de chat (continuación)' });
            if (!midOps.ok) break;
          }
          callCount++;
          llmCalls = callCount;

          const __acT = Date.now();
          const __acM = 'claude-sonnet-4-6';
          // Prompt caching: el system prompt es enorme (~10-15k tokens) y
          // estable dentro de una sesión de chat. Cache breakpoint al final
          // del system + al final de tools → primer call escribe (1.25x input),
          // resto lee a 0.1x. TTL 5 min cubre casi toda conversación.
          const systemText = callCount === 1 ? systemWithAlert : system;
          const cachedTools = sessionTools.length
            ? sessionTools.map((t, i) => i === sessionTools.length - 1
                ? { ...t, cache_control: { type: 'ephemeral' as const } }
                : t)
            : sessionTools;
          const stream = client.messages.stream({
            model:      __acM,
            max_tokens: 2048,
            system:     [{ type: 'text', text: systemText, cache_control: { type: 'ephemeral' } }],
            tools:      cachedTools,
            // Fuerza buscar_documento_oficina en la primera call cuando detectamos
            // intent de "generar X". Elimina la posibilidad de que el LLM narre
            // "reviso si hay previo" sin invocar la tool.
            ...(callCount === 1 && forceSearchTool
              ? { tool_choice: { type: 'tool' as const, name: 'buscar_documento_oficina' } }
              : {}),
            messages:   conversationMessages,
          });
          stream.finalMessage().then(finalMsg => {
            void logLlmCall({ source: 'agent_chat', model: __acM, usage: finalMsg.usage, agentId: agent.id as string, portalEmail: (agent.portal_email as string | null) ?? null, latencyMs: Date.now() - __acT, meta: { callCount } });
          }).catch(err => {
            void logLlmCall({ source: 'agent_chat', model: __acM, usage: { input_tokens: 0, output_tokens: 0 }, agentId: agent.id as string, portalEmail: (agent.portal_email as string | null) ?? null, latencyMs: Date.now() - __acT, error: err instanceof Error ? err.message : String(err), meta: { callCount } });
          });

          const assistantBlocks: AssistantBlock[] = [];
          // Buffer per-block: cuando Sonnet emite múltiples tool_use en un solo
          // turno (parallel tool calls, default), cada bloque llega en orden
          // (start → deltas → stop) antes del siguiente. Rastreamos el índice
          // del content_block actual para bufferizar el JSON en el slot correcto
          // y NO perder tool_use anteriores. Bug histórico: se sobreescribía
          // pendingToolId y el orphan tool_use disparaba 400 de Anthropic.
          const toolInputBuffers = new Map<number, string>();
          let currentBlockIdx: number | null = null;
          let didToolUse = false;

          for await (const chunk of stream) {
            if (chunk.type === 'content_block_start') {
              currentBlockIdx = chunk.index;
              if (chunk.content_block.type === 'text') {
                // Si ya emitimos texto en ESTA sesión (esta iteración o previa),
                // separar visualmente el nuevo párrafo con doble salto de línea.
                // Sin esto: "…ahora.Lista la propuesta…" se pega directo cuando
                // el LLM escribe, invoca tool, y vuelve a escribir.
                if (hasEmittedText) {
                  send('\n\n');
                }
                assistantBlocks.push({ type: 'text', text: '' });
              } else if (chunk.content_block.type === 'tool_use') {
                toolInputBuffers.set(chunk.index, '');
                assistantBlocks.push({ type: 'tool_use', id: chunk.content_block.id, name: chunk.content_block.name, input: {} });
                // Emit tool marker to UI so el usuario ve qué está haciendo el agente
                controller.enqueue(enc.encode(`data: ${JSON.stringify({ tool: chunk.content_block.name })}\n\n`));
              }
            } else if (chunk.type === 'content_block_delta') {
              if (chunk.delta.type === 'text_delta') {
                send(chunk.delta.text);
                if (chunk.delta.text.trim()) hasEmittedText = true;
                const last = assistantBlocks.at(-1);
                if (last?.type === 'text') last.text += chunk.delta.text;
              } else if (chunk.delta.type === 'input_json_delta' && currentBlockIdx !== null) {
                const prev = toolInputBuffers.get(currentBlockIdx) ?? '';
                toolInputBuffers.set(currentBlockIdx, prev + chunk.delta.partial_json);
              }
            } else if (chunk.type === 'content_block_stop' && toolInputBuffers.has(chunk.index)) {
              try {
                const parsed = JSON.parse(toolInputBuffers.get(chunk.index) ?? '') as Record<string, unknown>;
                const block  = assistantBlocks[chunk.index];
                if (block?.type === 'tool_use') block.input = parsed;
              } catch { /* malformed — keep empty input */ }
            } else if (
              chunk.type === 'message_delta' &&
              chunk.delta.stop_reason === 'tool_use'
            ) {
              didToolUse = true;
            }
          }

          // No tool use → text was already streamed, we're done
          if (!didToolUse) break;

          // Colecta TODOS los tool_use del turno (Sonnet puede pedir varios en
          // paralelo). Ejecutamos cada uno y devolvemos N tool_result en un
          // único user message. Anthropic exige que cada tool_use tenga su
          // tool_result correspondiente en el mensaje inmediatamente siguiente.
          const pendingToolCalls = assistantBlocks
            .map((b, idx) => (b.type === 'tool_use' ? { id: b.id, name: b.name, input: b.input, idx } : null))
            .filter((b): b is { id: string; name: string; input: Record<string, unknown>; idx: number } => b !== null);

          const toolResults: Array<{ type: 'tool_result'; tool_use_id: string; content: string }> = [];

          // Refund policy multi-tool: el cobro de ops es POR ITERACIÓN
          // (iterCharge se cobra 1 vez cuando arranca el turno del LLM,
          // no por cada tool call). Si N tools corren en paralelo y M fallan,
          // refundeamos proporcional (M/N * iterCharge) — sin esto un turno
          // con 3 tools donde 2 fallan refundaba 2*iterCharge = double-refund.
          const failedNamesInTurn: string[] = [];
          const totalToolsInTurn = pendingToolCalls.length;

          for (const call of pendingToolCalls) {
            // El chat del portal viene del owner con sesión verificada por cookie.
            // Auto-inyectamos caller_verified=true para consult_agent / delegate_task
            // — si no lo hacemos, el peer agent trata al owner como externo y
            // rechaza acceso a Drive/data interna (bug 2026-08-10: Niva delegada
            // por Sofia no accedió al Drive porque caller_verified quedó en false).
            if ((call.name === 'consult_agent' || call.name === 'delegate_task') && call.input.caller_verified === undefined) {
              call.input.caller_verified = true;
            }
            const toolResult = await executeAgentTool(
              call.name,
              call.input,
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
                channel:      'chat',
                // Propagar identity para gates dentro de tools money-critical
                // (aprobar_gasto, qb_crear_factura, trigger_outbound_call, etc.).
                requesterIsSubUser: auth.isSubUser,
                requesterUserId:    auth.userId,
                requesterModules:   auth.modules,
              }
            );

            toolsCalled.push({
              name: call.name,
              ok:   (toolResult as { ok?: boolean })?.ok !== false,
              ...((toolResult as { ok?: boolean; error?: string })?.ok === false
                ? { error: String((toolResult as { error?: unknown })?.error ?? '') }
                : {}),
            });

            // Solo acumular — el refund proporcional se emite después del loop
            // para no double-refund cuando corren N tools en paralelo.
            if ((toolResult as { ok?: boolean })?.ok === false) {
              failedNamesInTurn.push(call.name);
            }

            // Debug SSE: qué le regresamos al LLM. Útil para diagnosticar cuando
            // el agente dice "no encontré" pero la tool sí devolvió filas.
            try {
              const dbgResult = toolResult as { ok?: boolean; count?: number; message?: string; error?: string };
              const preview   = typeof dbgResult?.message === 'string' ? dbgResult.message.slice(0, 200) : null;
              controller.enqueue(enc.encode(`data: ${JSON.stringify({
                debug: {
                  source:     'agent-chat/tool-result',
                  tool:       call.name,
                  input:      call.input,
                  ok:         dbgResult?.ok !== false,
                  count:      dbgResult?.count ?? null,
                  messagePreview: preview,
                  error:      dbgResult?.error ?? null,
                },
              })}\n\n`));
            } catch { /* debug best-effort */ }

            toolResults.push({ type: 'tool_result', tool_use_id: call.id, content: JSON.stringify(toolResult) });
          }

          // Extend conversation con el turno completo: assistant con todos los
          // tool_use + user con todos los tool_result correspondientes.
          // Refund proporcional post-loop. iterCharge se cobra 1 vez por turno
          // (3 el primero, 2 los siguientes). Si de N tools fallaron M, devolvemos
          // Math.round(iterCharge * M/N). Solo refund si todos fallaron (M==N)
          // recibe iterCharge completo — de lo contrario partial credit.
          if (failedNamesInTurn.length > 0 && totalToolsInTurn > 0) {
            const iterCharge = callCount === 1 ? 3 : 2;
            const refund = Math.max(1, Math.round(iterCharge * failedNamesInTurn.length / totalToolsInTurn));
            void refundOps(agent.id as string, refund, {
              source: 'agent_chat_refund',
              label:  failedNamesInTurn.length === totalToolsInTurn
                ? `Turno completo fallo: ${failedNamesInTurn.join(', ')}`
                : `${failedNamesInTurn.length}/${totalToolsInTurn} tools fallaron: ${failedNamesInTurn.join(', ')}`,
            });
          }

          conversationMessages = [
            ...conversationMessages,
            { role: 'assistant' as const, content: assistantBlocks as Anthropic.ContentBlock[] },
            { role: 'user' as const, content: toolResults },
          ];

          // Guard defensivo: valida el pairing antes de la siguiente iteración.
          // Si algo se corrompe (bug futuro), preferimos abortar la sesión con
          // un error controlado que dispare un 400 de Anthropic con toda la
          // conversación en logs.
          assertToolUsePairing(conversationMessages);
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
