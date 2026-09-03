/**
 * Nala email runner — procesa un correo entrante a hola@centinelia.mx si es
 * de tema fiscal (factura, complemento, CFDI, SPEI). Corre el LLM loop de
 * Nala con sus tools de Facturama y opcionalmente envía respuesta al remitente.
 *
 * Flujo:
 *  1. Clasifica el correo con heurística de keywords + LLM zero-shot fallback.
 *  2. Si NO es fiscal, retorna { fiscal: false, skipped: true }. Nala no toca.
 *  3. Si SÍ es fiscal, ejecuta el loop LLM con Nala's promptPersonalidad + tools.
 *  4. Con opts.sendReply=true, manda la respuesta final por correo al remitente.
 *
 * Este runner está diseñado para ser invocado desde:
 *  - UI de test en /admin/staff/nala (Nazre pega un correo y prueba)
 *  - Cron/webhook futuro que lea la bandeja de hola@centinelia.mx (Fase 2b real)
 */
import Anthropic from '@anthropic-ai/sdk';
import { createAdminClient } from '@/lib/supabase/admin';
import { executeAgentTool } from '@/lib/tools/executor';
import { MEERKAT_ROLES } from '@/lib/portal/meerkat-roles';
import { getCentineliaFiscalConfig, isFacturamaSandbox } from '@/lib/invoicing/facturama/centinelia-preset';
import { sendEmail } from '@/lib/email/send';

const NALA = MEERKAT_ROLES.find(r => r.id === 'nala')!;
const MODEL = 'claude-sonnet-4-5';
const MAX_ITERATIONS = 8;

// Keywords que gatillan clasificación fiscal. Cualquier match rápido dispara.
const FISCAL_KEYWORDS = [
  'factura', 'facturar', 'facturación', 'facturame', 'factúrame',
  'cfdi', 'complemento de pago', 'complemento', 'rep', 'timbrado', 'timbrar',
  'spei', 'transferencia', 'transferí', 'transferi', 'pagué', 'pague',
  'comprobante de pago', 'comprobante', 'uuid', 'sat', 'régimen fiscal',
  'constancia', 'csf', 'rfc', 'régimen', 'uso cfdi', 'reembolso',
  'nota de crédito', 'cancelar factura', 'cancelación',
];

const NALA_EMAIL_TOOLS: Anthropic.Tool[] = [
  {
    name: 'emitir_cfdi_centinelia',
    description: 'Emite un CFDI 4.0 tipo Ingreso a nombre de Centinelia. PPD por default, forma pago 99. Adjunta XML + PDF y los envía al receptor si se pasa receptor_email.',
    input_schema: {
      type: 'object',
      properties: {
        receptor_rfc:    { type: 'string' },
        receptor_nombre: { type: 'string', description: 'MAYÚSCULAS sin acentos.' },
        receptor_cp:     { type: 'string' },
        receptor_regimen:{ type: 'string', description: 'Default 601.' },
        receptor_email:  { type: 'string' },
        uso_cfdi:        { type: 'string', description: 'Default G03.' },
        forma_pago:      { type: 'string', description: 'Default 99.' },
        metodo_pago:     { type: 'string', enum: ['PUE', 'PPD'] },
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              descripcion:    { type: 'string' },
              valor_unitario: { type: 'number' },
              cantidad:       { type: 'number' },
              con_iva:        { type: 'boolean' },
            },
            required: ['descripcion', 'valor_unitario'],
          },
        },
      },
      required: ['receptor_rfc', 'receptor_nombre', 'receptor_cp', 'items'],
    },
  },
  {
    name: 'solicitar_complemento_pago',
    description: 'Emite REP referenciando UUID del CFDI PPD original. Se dispara cuando llega comprobante SPEI. Adjunta XML + PDF y los envía al receptor si se pasa receptor_email.',
    input_schema: {
      type: 'object',
      properties: {
        cfdi_uuid_original: { type: 'string' },
        monto_pagado:       { type: 'number' },
        fecha_pago:         { type: 'string', description: 'ISO 8601: YYYY-MM-DDTHH:MM:SS' },
        num_operacion:      { type: 'string' },
        num_parcialidad:    { type: 'number' },
        saldo_anterior:     { type: 'number' },
        saldo_insoluto:     { type: 'number' },
        iva_base:           { type: 'number' },
        iva_importe:        { type: 'number' },
        forma_pago:         { type: 'string', description: 'Default 03 (Transferencia).' },
        receptor_rfc:       { type: 'string' },
        receptor_nombre:    { type: 'string' },
        receptor_cp:        { type: 'string' },
        receptor_regimen:   { type: 'string' },
        receptor_email:     { type: 'string' },
      },
      required: ['cfdi_uuid_original', 'monto_pagado', 'fecha_pago', 'receptor_rfc', 'receptor_nombre', 'receptor_cp'],
    },
  },
];

export interface NalaEmailInput {
  from:     string;
  subject:  string;
  body:     string;
  /** Attachments ya parseados a texto (constancias PDF, comprobantes SPEI, etc.) */
  attachmentsText?: Array<{ name: string; text: string }>;
  /** Message-Id original para mantener el thread al responder */
  originalMessageId?: string;
}

/**
 * Callback para enviar la respuesta de Nala. Diferentes flows usan distintos
 * transports: UI de test usa Resend, cron IMAP usa Titan SMTP + appendToSent.
 * Retornar `true` si el envío fue exitoso.
 */
export type ReplySender = (input: {
  to: string;
  subject: string;
  html: string;
  text?: string;
  inReplyTo?: string;
}) => Promise<boolean>;

export interface NalaClassifyResult {
  fiscal:      boolean;
  confidence:  'high' | 'med' | 'low';
  reason:      string;
  matchedKeywords: string[];
}

export interface NalaProcessResult {
  fiscal:  boolean;
  skipped: boolean;
  events?: Array<
    | { kind: 'text'; text: string }
    | { kind: 'tool_call'; name: string; input: Record<string, unknown> }
    | { kind: 'tool_result'; name: string; result: unknown }
    | { kind: 'error'; error: string }
  >;
  replyText?: string;
  replySent?: boolean;
  classifyResult: NalaClassifyResult;
}

export function classifyFiscalEmail(input: NalaEmailInput): NalaClassifyResult {
  const haystack = `${input.subject} ${input.body} ${(input.attachmentsText ?? []).map(a => `${a.name} ${a.text}`).join(' ')}`.toLowerCase();
  const matched = FISCAL_KEYWORDS.filter(kw => haystack.includes(kw));

  if (matched.length >= 2) {
    return { fiscal: true, confidence: 'high', reason: `${matched.length} keywords fiscales`, matchedKeywords: matched };
  }
  if (matched.length === 1) {
    return { fiscal: true, confidence: 'med', reason: `1 keyword fiscal: "${matched[0]}"`, matchedKeywords: matched };
  }
  return { fiscal: false, confidence: 'high', reason: 'sin keywords fiscales', matchedKeywords: [] };
}

function buildSystemPrompt(input: NalaEmailInput): string {
  const cfg = getCentineliaFiscalConfig();
  const sandbox = isFacturamaSandbox();
  return `Eres ${NALA.nombre}, ${NALA.rol} interna de Centinelia. Recibes correos a hola@centinelia.mx cuando son de tema fiscal (facturas, complementos, comprobantes SPEI). Tu misión: entender qué pide el remitente, timbrar el CFDI o REP correspondiente vía Facturama, y responderle por correo con el UUID resultante + XML/PDF adjuntos (la tool lo hace por ti si le pasas receptor_email).

${NALA.promptPersonalidad}

DATOS FISCALES DE CENTINELIA (siempre usa estos como emisor):
- RFC: ${cfg.rfc}
- Régimen: ${cfg.regimenFiscal}
- Razón social: ${cfg.razonSocial}
- CP expedición: ${cfg.lugarExpedicion}

PAC actual: Facturama en modo ${sandbox ? 'SANDBOX (los UUIDs generados NO son válidos fiscalmente)' : 'PROD'}.

CORREO ENTRANTE:
- De: ${input.from}
- Asunto: ${input.subject}
- Cuerpo: ${input.body.slice(0, 2000)}${input.body.length > 2000 ? '... [truncado]' : ''}
${(input.attachmentsText ?? []).map(a => `- Adjunto "${a.name}":\n${a.text.slice(0, 1500)}`).join('\n')}

REGLAS DE ACCIÓN:
- Si el correo pide facturar (nueva factura): usa emitir_cfdi_centinelia con los datos que extraigas del correo. Si faltan datos del receptor (RFC, razón social, CP, uso CFDI), pide EXACTAMENTE los que faltan por correo respuesta, no timbres a ciegas.
- Si el correo comparte comprobante SPEI o dice "ya pagué"/"transferí": usa solicitar_complemento_pago. Necesitas el UUID del CFDI original. Si el correo no lo trae, respóndele pidiendo el UUID textual.
- Si el correo pide reenviar una factura ya timbrada: por ahora respóndele que estás construyendo esa capacidad y escalarás con Nazre.
- Siempre incluye el correo del remitente en receptor_email para que la tool le mande el XML/PDF automáticamente.

Cuando termines, tu ÚLTIMO mensaje debe ser el texto de la respuesta por correo (breve, cálido, profesional) que se le va a mandar al remitente. No incluyas encabezados de email tipo "Estimado" o firmas — solo el cuerpo del mensaje. La tool que timbra ya manda el XML+PDF adjuntos por su lado.`;
}

export async function processNalaEmail(
  input: NalaEmailInput,
  opts: { sendReply?: boolean; sender?: ReplySender } = {},
): Promise<NalaProcessResult> {
  const classifyResult = classifyFiscalEmail(input);

  if (!classifyResult.fiscal) {
    return { fiscal: false, skipped: true, classifyResult };
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { fiscal: true, skipped: false, events: [{ kind: 'error', error: 'ANTHROPIC_API_KEY missing' }], classifyResult };
  }

  const anthropic = new Anthropic({ apiKey });
  const supabase = createAdminClient();

  const systemPrompt = buildSystemPrompt(input);
  const transcript: Anthropic.MessageParam[] = [
    { role: 'user', content: 'Procesa el correo entrante. Ejecuta las tools necesarias y termina con el texto de respuesta que se le enviará al remitente.' },
  ];

  const events: NalaProcessResult['events'] = [];
  let finalReply = '';

  for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
    let resp: Anthropic.Message;
    try {
      resp = await anthropic.messages.create({
        model: MODEL,
        max_tokens: 2048,
        system: systemPrompt,
        tools: NALA_EMAIL_TOOLS,
        messages: transcript,
      });
    } catch (e) {
      events!.push({ kind: 'error', error: `Anthropic: ${(e as Error).message}` });
      break;
    }

    transcript.push({ role: 'assistant', content: resp.content });

    const toolUses: Anthropic.ToolUseBlock[] = [];
    for (const block of resp.content) {
      if (block.type === 'text') {
        events!.push({ kind: 'text', text: block.text });
        finalReply = block.text; // la última pieza de texto es la respuesta
      } else if (block.type === 'tool_use') {
        toolUses.push(block);
        events!.push({ kind: 'tool_call', name: block.name, input: block.input as Record<string, unknown> });
      }
    }

    if (resp.stop_reason !== 'tool_use' || toolUses.length === 0) break;

    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const tu of toolUses) {
      let result: unknown;
      try {
        result = await executeAgentTool(tu.name, tu.input as Record<string, unknown>, {
          agentId:      'nala-email',
          portalEmail:  'centinelia-internal',
          agentName:    'Nala',
          businessName: 'Centinelia',
          portalToken:  '',
          agent:        {},
          supabase,
          channel:      'email',
          userContext:  `${input.subject}\n\n${input.body}`,
        });
      } catch (e) {
        result = { ok: false, error: `executor exception: ${(e as Error).message}` };
      }
      events!.push({ kind: 'tool_result', name: tu.name, result });
      toolResults.push({
        type: 'tool_result',
        tool_use_id: tu.id,
        content: typeof result === 'string' ? result : JSON.stringify(result),
      });
    }
    transcript.push({ role: 'user', content: toolResults });
  }

  let replySent = false;
  if (opts.sendReply && finalReply.trim()) {
    const subject = input.subject.toLowerCase().startsWith('re:') ? input.subject : `Re: ${input.subject}`;
    const html = `<div style="font-family:system-ui,-apple-system,sans-serif;line-height:1.6;color:#1A0A3B">${finalReply.replace(/\n/g, '<br/>')}</div>`;

    if (opts.sender) {
      // Sender custom (típicamente Titan SMTP desde cron)
      replySent = await opts.sender({
        to: input.from,
        subject,
        html,
        text: finalReply,
        inReplyTo: input.originalMessageId,
      });
    } else {
      // Fallback: Resend (UI de test manual)
      const cfg = getCentineliaFiscalConfig();
      replySent = await sendEmail({
        to: input.from,
        subject,
        html,
        from: `${cfg.razonSocial} <${cfg.emailContacto}>`,
      });
    }
  }

  return {
    fiscal: true,
    skipped: false,
    events,
    replyText: finalReply,
    replySent,
    classifyResult,
  };
}
