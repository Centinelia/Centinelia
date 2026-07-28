import Anthropic from '@anthropic-ai/sdk';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendEmail } from '@/lib/email/send';
import { approvalEmailHtml, escalationEmailHtml } from '@/lib/ops/approval-email';
import { consumeAiOp } from '@/lib/ai/ops-guard';
import { EMAIL_BODY_TRUNCATE_CHARS } from '@/lib/constants';
import { executeAgentTool, type ReadUrlCounter } from '@/lib/tools/executor';
import { getQBClient } from '@/lib/qb/client';

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
  escalateToApprover: boolean;
  infoNeeded:         string | null;
  requestToSender:    string | null;
}

const VALID_CATEGORIES = ['proveedor', 'cliente', 'urgente', 'factura', 'spam', 'otro'] as const;

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
    escalateToApprover: isBool(r.escalate_to_approver) ? r.escalate_to_approver : false,
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
  autoReply?:        boolean;
  approvalEmail?:    string | null;
  existingInboxId?:  string;         // set when this is a reply to an info_requested thread
  originalEmailBody?: string;        // original email body from the info_requested record
  sendReplyFn?:      (body: string) => Promise<void>;
}): Promise<void> {
  const {
    agentId, source, rawMessageId, threadId, emailFrom, emailSubject,
    emailBody, attachments, agentName, businessName,
    knowledgeBase, roleKB, agentRole, ownerEmail, portalToken, portalEmail,
    autoReply, approvalEmail, existingInboxId, originalEmailBody, sendReplyFn,
  } = params;

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

  const contextBlocks: string[] = [];
  if (knowledgeBase?.trim()) contextBlocks.push(`NEGOCIO:\n${knowledgeBase.trim()}`);
  if (agentRole?.trim() && roleKB?.trim()) contextBlocks.push(`ROL DEL AGENTE: ${agentRole}\n${roleKB.trim()}`);
  const contextSection = contextBlocks.length ? `\n\n${contextBlocks.join('\n\n')}` : '';

  const systemPrompt = `Eres ${agentName}, empleado de oficina de ${businessName}. Analizas emails entrantes y produces JSON con la categoría, resumen y borrador de respuesta.${contextSection}

Categorías: proveedor, cliente, urgente, factura, spam, otro.
- "urgente": emergencias, quejas graves, solicitudes de alta prioridad.
- "factura": cualquier email con factura, cargo o solicitud de pago de un proveedor.
- "spam": publicidad, marketing no solicitado.

Tienes herramientas para consultar datos reales del negocio (Drive, internet, QuickBooks, calendario, reportes ciudadanos, compañeros, etc.). Úsalas proactivamente si el email pide información específica para que el borrador de respuesta sea preciso y con datos reales.

Si después de usar todas las herramientas disponibles no puedes encontrar la información necesaria para responder correctamente:
- Pon "needs_info": true en el JSON.
- Si tu aprobador podría tener esa información (datos internos, precios, decisiones comerciales, contactos del negocio), pon "escalate_to_approver": true y describe en "info_needed" qué información exacta necesitas.
- Si solo el remitente puede proporcionar esa información (datos de su empresa, detalles de su pedido, especificaciones que solo él conoce), pon "escalate_to_approver": false y redacta en "request_to_sender" el email solicitando esa información de forma clara y profesional.
- Si puedes responder con la información disponible, pon "needs_info": false, "escalate_to_approver": false.

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
  "escalate_to_approver": false,
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
    escalateToApprover: false,
    infoNeeded:         null,
    requestToSender:    null,
  };

  const supabase  = createAdminClient();
  const opsResult = await consumeAiOp(agentId, 1);

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

    const execCtx = {
      agentId,
      portalEmail,
      agentName,
      businessName,
      portalToken,
      agent:        (agentRow ?? { id: agentId, agent_name: agentName, business_name: businessName }) as Record<string, unknown>,
      supabase,
      userContext:  effectiveBody.slice(0, 500),
      readUrlCount: { value: 0 } as ReadUrlCounter,
    };

    const messages: Anthropic.MessageParam[] = [{ role: 'user', content: userPrompt }];

    try {
      let lastText = '{}';
      const MAX_ITER = 6;

      for (let i = 0; i < MAX_ITER; i++) {
        const isLastIter = i === MAX_ITER - 1;

        // Charge 1 op per iteration after the first (first was charged above)
        if (i > 0) {
          const midOps = await consumeAiOp(agentId, 1);
          if (!midOps.ok) break;
        }

        const response = await anthropic.messages.create({
          model:      'claude-haiku-4-5-20251001',
          max_tokens: 2048,
          system: [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }],
          messages,
          ...(tools.length && !isLastIter ? { tools } : {}),
        });

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
          toolResults.push({ type: 'tool_result', tool_use_id: b.id, content: JSON.stringify(output) });
        }

        messages.push({ role: 'assistant', content: response.content });
        messages.push({ role: 'user',      content: toolResults });
      }

      const parsed = JSON.parse(lastText);
      result = validateProcessedEmail(parsed);
    } catch (err) {
      console.error('[ops/inbox-processor] AI error:', err);
    }
  } else if (opsResult.ok) {
    // No portalEmail — run a simple single-shot analysis without tools
    try {
      const response = await anthropic.messages.create({
        model:      'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        system: [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }],
        messages:   [{ role: 'user', content: userPrompt }],
      });
      const textBlock = response.content.find(b => b.type === 'text');
      const parsed    = textBlock?.type === 'text' ? JSON.parse(textBlock.text.trim()) : {};
      result = validateProcessedEmail(parsed);
    } catch (err) {
      console.error('[ops/inbox-processor] AI error (no portalEmail):', err);
    }
  }

  // Determine final status and what to store in ai_draft
  let finalStatus: string;
  let finalDraft: string | null;

  if (result.category === 'spam') {
    finalStatus = 'skipped';
    finalDraft  = null;
  } else if (result.needsInfo && result.escalateToApprover) {
    finalStatus = 'escalated';
    finalDraft  = result.infoNeeded;
  } else if (result.needsInfo && !result.escalateToApprover) {
    finalStatus = 'info_requested';
    finalDraft  = result.requestToSender;
  } else if (result.draft && autoReply && sendReplyFn) {
    finalStatus = 'auto_replied';
    finalDraft  = result.draft;
  } else {
    finalStatus = 'pending';
    finalDraft  = result.draft;
  }

  type InboxItem = { id: string; approval_token: string };
  let item: InboxItem | null = null;

  if (existingInboxId) {
    // Thread reply: update the existing info_requested record
    const { data } = await supabase
      .from('ops_inbox')
      .update({
        email_body:          effectiveBody.slice(0, EMAIL_BODY_TRUNCATE_CHARS),
        ai_summary:          result.summary,
        ai_draft:            finalDraft,
        status:              finalStatus === 'info_requested' ? 'pending' : finalStatus,
        invoice_data:        result.invoiceData,
        invoice_valid:       result.invoiceValid,
        invoice_discrepancy: result.invoiceDiscrepancy,
      })
      .eq('id', existingInboxId)
      .select('id, approval_token')
      .single();
    item = data as unknown as InboxItem | null;
  } else {
    const { data } = await supabase
      .from('ops_inbox')
      .insert({
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
      })
      .select('id, approval_token')
      .single();
    item = data as unknown as InboxItem | null;
  }

  if (!item || finalStatus === 'skipped') return;

  const baseUrl   = process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.centinelia.mx';
  const portalUrl = `${baseUrl}/portal/${portalToken}/oficina/bandeja`;
  const notifyTo  = approvalEmail || ownerEmail;

  if (finalStatus === 'escalated') {
    const html = escalationEmailHtml({
      agentName,
      businessName,
      emailFrom,
      emailSubject,
      summary:    result.summary,
      infoNeeded: result.infoNeeded ?? '',
      portalUrl,
    });
    await sendEmail({
      to:      notifyTo,
      subject: `[Consulta de ${agentName}] ${emailSubject || '(sin asunto)'}`,
      html,
    });

  } else if (finalStatus === 'info_requested' && result.requestToSender && sendReplyFn) {
    await sendReplyFn(result.requestToSender).catch(err =>
      console.error('[ops/inbox-processor] info_requested send failed:', err)
    );

  } else if (finalStatus === 'auto_replied' && result.draft && sendReplyFn) {
    await sendReplyFn(result.draft).catch(err =>
      console.error('[ops/inbox-processor] auto_reply send failed:', err)
    );

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
