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

// Keywords que gatillan clasificación fiscal. Se aplican con word boundaries
// (\b) para evitar falsos positivos tipo "sat" dentro de "satisfacción" o
// "rep" dentro de "report". Cada keyword es un patrón regex.
//
// STRONG: palabras específicamente fiscales — 1 sola basta para clasificar fiscal.
// WEAK:   palabras genéricas que también aparecen en fiscales — requieren
//         corroborar con otro WEAK o un STRONG para clasificar.
const FISCAL_STRONG: RegExp[] = [
  /\bfactura(r|me|ción|s)?\b/i,
  /\bfact[uú]rame\b/i,
  /\bcfdi\b/i,
  /\bcomplemento de pago\b/i,
  /\btimbrad[oa]\b/i, /\btimbrar\b/i, /\btimbre\b/i,
  /\bspei\b/i,
  /\bcomprobante de pago\b/i,
  /\brégimen fiscal\b/i, /\bregimen fiscal\b/i,
  /\bconstancia (de )?situación fiscal\b/i,
  /\buso (de )?cfdi\b/i,
  /\bnota de crédito\b/i, /\bnota de credito\b/i,
  /\bcancelar factura\b/i, /\bcancelación de (la )?factura\b/i,
  /\brfc\s*[:=]?\s*[a-z&ñ]{3,4}\d{6}[a-z\d]{3}\b/i,  // RFC pattern
  /\buuid\s*[:=]?\s*[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\b/i, // UUID pattern
];

const FISCAL_WEAK: RegExp[] = [
  /\bcomprobante(s)?\b/i,   // solo, sin "de pago", débil
  /\btransferencia\b/i, /\btransfer[ií]\b/i,
  /\bpagué\b/i, /\bpague\b/i,
  /\breembolso\b/i,
  /\bcancelación\b/i, /\bcancelacion\b/i,
  /\bcsf\b/i,
];

// Blocklist de remitentes/dominios que NUNCA deben procesarse como fiscales.
// Fuentes conocidas de bulk/marketing/notificaciones.
const NEVER_FISCAL_SENDERS: RegExp[] = [
  // Notificaciones / marketing conocidos
  /@clientship\.com$/i,
  /@payclip\.com$/i, /@emkt\.clip\.mx$/i,
  /@e\.g2digitalmarkets\.com$/i, /@g2\.com$/i, /@g2crowd\.com$/i,
  /@eposnow\.com$/i,
  /@titan\.email$/i,          // calendar / system notifications de Titan
  // Patterns catch-all para bulk/no-reply
  /noreply|no-reply|donotreply|do-not-reply|nobody@|null@/i,
  /notifications?@|alerts?@|updates?@/i,
  /marketing@|newsletter|mailer|mailing|hello@|hi@|team@|info@/i,
  /support@|help@|contact@|admin@|adminhelp@/i,
  /survey|encuesta|campaign|campaña|promo|deal|offer/i,
];

// Palabras/señales típicas de correos marketing HTML/bulk. Si aparecen 2+ de
// estas, el correo es marketing y NUNCA se procesa (aunque tenga keywords
// fiscales por casualidad).
const MARKETING_SIGNALS: RegExp[] = [
  /\bunsubscribe\b/i, /\bcancelar (mi )?suscripción\b/i, /\bdarme de baja\b/i,
  /\bview (in|this email in) (a |your )?browser\b/i,
  /\bhaz click aquí\b/i, /\bclick here\b/i,
  /\bAI Summary\b/i,
  /\bpolítica de privacidad\b/i, /\bprivacy policy\b/i,
  /\bderechos reservados\b/i, /\ball rights reserved\b/i,
  /\bemail preferences\b/i, /\bpreferencias de correo\b/i,
];

/** Cuenta ocurrencias de URLs con tracking params (utm_, click, redirect). */
function countTrackingLinks(body: string): number {
  const matches = body.match(/https?:\/\/[^\s"<>)]{20,}/gi) ?? [];
  return matches.filter(url =>
    /\butm_|\/click|\/track|redirect=|emailId=|contactId=|campId=|elqTrackId=|s=\d{6}/i.test(url),
  ).length;
}

const NALA_EMAIL_TOOLS: Anthropic.Tool[] = [
  {
    name: 'pedir_datos_faltantes',
    description: 'Llámala cuando el correo pide claramente una factura o REP PERO faltan datos que solo el cliente puede darte (RFC, razón social, CP, UUID original, monto, fecha SPEI, etc). Después de llamarla, tu último mensaje será la petición de datos al cliente en tono humano.',
    input_schema: {
      type: 'object',
      properties: {
        campos_faltantes: {
          type: 'array',
          items: { type: 'string' },
          description: 'Lista concreta de qué datos faltan (ej: ["RFC del receptor", "código postal", "UUID de la factura original"])',
        },
        razon: { type: 'string', description: 'Opcional. Contexto breve de por qué no se puede timbrar sin esos datos.' },
      },
      required: ['campos_faltantes'],
    },
  },
  {
    name: 'reportar_bug_a_nash',
    description: 'Reporta a Nash (empleado interno de Centinelia que monitorea la plataforma) un bug o limitación del código que te impide accionar. Úsala cuando el problema NO es del cliente (datos correctos) sino del sistema Centinelia. Nash lo procesa en su próxima corrida y decide si escalar a Nazre o mandarlo a desarrollo. NO envías respuesta al cliente cuando reportas un bug — el correo queda unread y Nazre lo verá.',
    input_schema: {
      type: 'object',
      properties: {
        title:       { type: 'string', description: 'Título breve del bug (ej: "Facturama rechaza XAXX010101000 individual — falta InformacionGlobal")' },
        description: { type: 'string', description: 'Descripción detallada del error: qué intentaste, qué devolvió el sistema, qué se necesita para resolver.' },
        priority:    { type: 'string', enum: ['low', 'med', 'high', 'critical'], description: 'Default med. High solo si bloquea a un cliente real esperando su factura.' },
        source_id:   { type: 'string', description: 'Identificador único para deduplicar (ej: el UUID del correo o hash del error). Opcional pero recomendado.' },
      },
      required: ['title', 'description'],
    },
  },
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
    name: 'registrar_pago_pendiente_verificacion',
    description: 'Cuando el cliente adjunta o menciona un comprobante SPEI de pago, usa ESTA tool en vez de solicitar_complemento_pago directo. Sistema evalúa reglas de auto-aprobación (UUID del CFDI válido + cliente activo + monto exacto + no dedupe). Si todas pasan → timbra REP inmediato al cliente. Si algo no cuadra → guarda pending + notifica a Nazre para aprobación manual. En cualquier caso, tú respondes al cliente con el resultado.',
    input_schema: {
      type: 'object',
      properties: {
        cfdi_uuid_original: { type: 'string', description: 'UUID del CFDI PPD original que el cliente está pagando.' },
        monto_pagado:       { type: 'number', description: 'Monto exacto reportado en el comprobante SPEI.' },
        fecha_pago:         { type: 'string', description: 'ISO 8601: YYYY-MM-DDTHH:MM:SS' },
        num_operacion:      { type: 'string', description: 'Número de operación bancaria del SPEI. Opcional pero recomendado.' },
        forma_pago:         { type: 'string', description: 'Default 03 (Transferencia). Solo cambia si el cliente dice explícitamente otro método.' },
        receptor_email:     { type: 'string', description: 'Correo del cliente para enviar el REP si se auto-aprueba. Si se omite, usa el correo guardado en centinelia_clientes.' },
      },
      required: ['cfdi_uuid_original', 'monto_pagado', 'fecha_pago'],
    },
  },
  {
    name: 'solicitar_complemento_pago',
    description: 'NO uses esta tool en el flujo de correos entrantes — usa registrar_pago_pendiente_verificacion. Esta queda para casos legacy o cuando Nazre te lo pida explícitamente desde el chat interno.',
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
  // Blocklist primero — si el remitente es de marketing/no-reply, skip sin analizar
  const senderBlocked = NEVER_FISCAL_SENDERS.some(re => re.test(input.from));
  if (senderBlocked) {
    return { fiscal: false, confidence: 'high', reason: `remitente en blocklist (marketing/no-reply/genérico)`, matchedKeywords: [] };
  }

  // Detectar bulk marketing por señales en el cuerpo: unsubscribe, view in browser,
  // "AI Summary", tracking URLs. 2+ señales → skip.
  const marketingSignals = MARKETING_SIGNALS.filter(re => re.test(input.body)).length;
  const trackingLinks = countTrackingLinks(input.body);
  const looksBulk = marketingSignals >= 2 || trackingLinks >= 3;
  if (looksBulk) {
    return {
      fiscal: false, confidence: 'high',
      reason: `parece bulk/marketing (${marketingSignals} señales, ${trackingLinks} tracking URLs)`,
      matchedKeywords: [],
    };
  }

  const haystack = `${input.subject} ${input.body} ${(input.attachmentsText ?? []).map(a => `${a.name} ${a.text}`).join(' ')}`;

  const strongMatches: string[] = [];
  for (const re of FISCAL_STRONG) {
    const m = haystack.match(re);
    if (m) strongMatches.push(m[0].toLowerCase());
  }

  const weakMatches: string[] = [];
  for (const re of FISCAL_WEAK) {
    const m = haystack.match(re);
    if (m) weakMatches.push(m[0].toLowerCase());
  }

  const allMatched = [...strongMatches, ...weakMatches];

  // Reglas:
  // - 1+ STRONG → fiscal high
  // - 2+ WEAK sin STRONG → fiscal med (corroboración cruzada)
  // - 1 WEAK sin STRONG → NO fiscal (muy poca señal)
  // - 0 matches → NO fiscal

  if (strongMatches.length >= 1) {
    return {
      fiscal: true,
      confidence: strongMatches.length >= 2 ? 'high' : 'med',
      reason: `${strongMatches.length} keyword(s) fiscal(es) fuerte(s): ${strongMatches.slice(0, 4).join(', ')}`,
      matchedKeywords: allMatched,
    };
  }
  if (weakMatches.length >= 2) {
    return {
      fiscal: true,
      confidence: 'low',
      reason: `${weakMatches.length} keywords débiles (sin señal fuerte): ${weakMatches.slice(0, 4).join(', ')}`,
      matchedKeywords: allMatched,
    };
  }
  return { fiscal: false, confidence: 'high', reason: allMatched.length === 0 ? 'sin keywords fiscales' : `solo 1 keyword débil (${weakMatches[0]}) — insuficiente`, matchedKeywords: allMatched };
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

TUS 4 TOOLS Y CUÁNDO USAR CADA UNA:

1. **emitir_cfdi_centinelia** — cuando el cliente pide una factura Y tienes todos los datos del receptor completos + montos. Timbra y en tu reply confirmas al cliente.

2. **registrar_pago_pendiente_verificacion** — cuando el cliente comparte comprobante SPEI Y te dio el UUID del CFDI original + monto + fecha. Esta tool decide sola si auto-aprobar (todas las reglas cumplen: UUID válido, cliente activo, monto exacto, no dedupe) o guardar pending para que Nazre apruebe manual. Tu respuesta al cliente cambia según el resultado:
   - Si auto_aprobado=true → confirmas al cliente que recibiste el pago y ya le mandaste el complemento de pago (REP) por correo.
   - Si auto_aprobado=false → responde al cliente: "Recibí tu comprobante, en cuanto lo verifique en el banco te mando el complemento de pago." NO menciones que fue automático ni que hay motivos técnicos. Solo que estás verificando.

3. **pedir_datos_faltantes** — cuando el correo es solicitud clara de factura o REP PERO le faltan datos que solo el cliente puede darte (RFC, CP, UUID original, monto, etc). En tu reply pides EXACTAMENTE lo que falta, en lista, con tono humano. Ejemplo bueno: "Para poder facturarte necesito: tu RFC, razón social exacta y código postal fiscal". Sistema envía tu reply al cliente automáticamente.

4. **reportar_bug_a_nash** — cuando el problema NO es del cliente sino del sistema Centinelia (el código no soporta algo, Facturama devuelve error interno, etc). Nash es un empleado interno que monitorea la plataforma; recibe tu reporte por sistema y decide qué hacer (escalar a Nazre, mandar a desarrollo). Cuando llamas esta tool, el sistema NO envía respuesta al cliente — el correo queda unread para que Nazre lo maneje directamente. Ejemplo: si Facturama rechaza XAXX010101000 con "falta GlobalInformation" y sabes que el código no lo soporta, reportas bug a Nash y NO le mandas nada técnico al cliente.

CUÁNDO NO EJECUTAR NADA (termina el turno sin tool y sin reply):
- Marketing, notificaciones, encuestas, invitaciones — aunque hayan pasado el filtro. Termina en silencio.
- Consultas generales sobre Centinelia (precios, horarios, info comercial) — no es tu scope. Termina en silencio.
- Correos fuera de scope fiscal: cancelación de CFDI, reenvío de facturas históricas, cambio de datos post-timbre, reembolsos. Termina en silencio.
- Si dudas → NO acciones. El correo unread es la señal correcta a Nazre.

REGLA CRUZADA — solo cliente vs solo Nash:
- Problema del cliente (datos faltantes, malos, ambiguos) → pedir_datos_faltantes (responde al cliente pidiendo).
- Problema del sistema (código no soporta X, PAC roto, config faltante) → reportar_bug_a_nash (NO respondes al cliente, Nazre lo ve unread).
- NUNCA mandes al cliente un mensaje técnico sobre bugs del sistema Centinelia. Eso es para Nash/Nazre internamente.

REGLA DURA DE NEGOCIO — QUÉ SE FACTURA A CLIENTES RECURRENTES:
Las facturas mensuales subsecuentes SOLO cobran las jornadas mensuales del cliente (conceptos guardados en su plan). NUNCA incluyas contrataciones iniciales, setup fees, one-time charges u otros conceptos adicionales, aunque el cliente lo pida por correo. Si el cliente sugiere agregar algo distinto a su plan mensual normal:
- Responde: "Voy a revisar con Nazre esa adición al plan; en cuanto me confirme te aviso por este medio."
- NO ejecutes emitir_cfdi_centinelia con conceptos que no correspondan a su plan recurrente.
- Este límite solo se levanta si Nazre te lo pide EXPLÍCITAMENTE por el chat interno de admin.

CONOCIMIENTO FISCAL SAT CFDI 4.0 — reglas que DEBES aplicar sin escalar:
- **XAXX010101000 (Público en General)**: este RFC SOLO aplica para facturas globales agrupadas (venta al mostrador agrupada por día/semana/mes) — requiere un complemento InformacionGlobal que la tool actual NO soporta. Centinelia NO agrupa ventas, siempre factura operaciones individuales. Por lo tanto: si un cliente te pide facturar con XAXX010101000 para una operación individual, NO timbres, respóndele pidiendo su RFC personal o de su empresa. La razón que le das es simple: "para poder deducir tu factura necesito tu RFC personal, XAXX010101000 solo aplica a ventas al público al mostrador".
- **XEXX010101000 (extranjero)**: receptor_cp = lugar_expedicion del emisor (${cfg.lugarExpedicion}). Régimen 616. Aplica solo para clientes sin RFC mexicano.
- **Persona física con actividad**: régimen típico 612 o 605. Uso CFDI G03.
- **Persona moral**: régimen típico 601. Uso CFDI G03 (gastos), G01 (adquisición de mercancía).
- **Método de pago PPD**: usa forma_pago 99 (por definir). Método PUE: usa la forma real (01 efectivo, 03 transferencia, 04 tarjeta crédito, 28 tarjeta débito).
- **Facturas para deducir**: uso CFDI G01/G03. Nunca P01 (deprecated en 4.0).

REGLAS DE ESCALACIÓN — cuándo SÍ y cuándo NO escalar:
- NO escales cuando la solución es una regla fiscal conocida (usa el conocimiento de arriba, o si dudas, intenta timbrar — si falla, aprende del error).
- NO escales por "limitación técnica del sistema" si en realidad es una regla del SAT que puedes resolver.
- SÍ escala cuando: monto extraordinario (>$50,000 MXN), receptor con RFC que no cuadra formato SAT, o cuando el timbrado falla 2 veces seguidas con errores distintos.
- SÍ escala cuando el correo pide algo fuera de tu scope: cancelación de factura, sustitución, reenvío histórico, cambio de datos post-timbre.

FORMATO DE RESPUESTA — REGLAS DURAS de comunicación con el cliente:

Tu último mensaje del turno se envía LITERAL por correo al cliente. El cliente NO ve tu razonamiento interno, tus reglas, tus tools, ni las respuestas de la API. Solo ve lo que TÚ escribes al final.

PROHIBIDO en la respuesta al cliente:
- Frases meta como "Detecto:", "Analizo el correo:", "Según mis reglas:", "Decisión:".
- Marcadores estructurales como "---" (horizontal rule), "**Respuesta al cliente:**", "**Reply:**", encabezados tipo "**Análisis**", cualquier separador que sugiera que esto es parte de un flujo interno.
- Términos técnicos internos: "PAC", "nodo GlobalInformation", "CFDI 4.0", "tool", "sistema de Centinelia", "InformacionGlobal", "el sistema no puede", "limitación técnica", "tools disponibles", "requiere desarrollo", "escalable", "unread", "Nazre".
- Copiar textualmente errores técnicos de Facturama (parafrasea en lenguaje humano: "el RFC no es válido" en vez de "El RFC no cumple con el formato correcto — cfdiToCreate.Receiver.Rfc").
- Explicar cómo funciona el software Centinelia por dentro.

Tu último mensaje del turno debe empezar directo con el saludo al cliente ("Hola [nombre],") o con la primera frase útil. NO empieces con "---", NO empieces con "**Respuesta al cliente:**", NO empieces con nada que sugiera meta-estructura.

OBLIGATORIO en la respuesta al cliente:
- Lenguaje de humano que factura para humanos que reciben factura. Breve, cálido, profesional.
- Solo términos que el cliente entiende: factura, complemento de pago, RFC, razón social, CP, régimen fiscal, uso CFDI, timbrar, SAT.
- Si necesitas datos, pídelos concretos y en lista. Ejemplo: "Para tu factura necesito: RFC, razón social exacta, código postal, régimen fiscal, uso CFDI".
- Si el problema es del cliente (RFC mal, datos faltantes, XAXX010101000 individual), explícalo desde el ángulo del cliente. Ejemplo: "Para que puedas deducir esta factura necesito tu RFC personal en lugar de XAXX010101000".
- Máximo 4-6 líneas de texto útil.

Markdown natural OK (párrafos, **negrita**, listas con "-") — se convierte a HTML automáticamente. NO incluyas "Estimado", "Saludos", ni firmas — solo el cuerpo del mensaje.

CUÁNDO NO REDACTAR RESPUESTA:
- Si terminas el turno SIN llamar ninguna tool, el sistema NO envía respuesta al cliente. Termina el turno en silencio.
- Si intentaste timbrar y el error es del sistema (bug interno, algo que solo Nazre puede resolver), NO redactes respuesta al cliente — termina en silencio para que Nazre vea el correo unread y lo maneje. Copiar errores técnicos al cliente es peor que no responder.
- Si el correo no es una solicitud clara de factura o REP, NO ejecutes tools y NO redactes respuesta.`;
}

export async function processNalaEmail(
  input: NalaEmailInput,
  opts: { sendReply?: boolean; sender?: ReplySender } = {},
): Promise<NalaProcessResult> {
  const classifyResult = classifyFiscalEmail(input);

  if (!classifyResult.fiscal) {
    return { fiscal: false, skipped: true, classifyResult };
  }

  // Confidence 'low' significa solo señales débiles sin corroboración fuerte.
  // Es demasiado riesgoso responder automático (podría ser falso positivo).
  // Skip — Nazre verá el correo unread en Titan y decidirá.
  if (classifyResult.confidence === 'low') {
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
  let toolsExecuted = 0;
  let onlyReportedBug = true;  // se vuelve false si Nala llama alguna tool que NO sea reportar_bug_a_nash

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
        toolsExecuted++;
        if (tu.name !== 'reportar_bug_a_nash') {
          onlyReportedBug = false;
        }
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

  // Guardarraíl 1: si Nala NO ejecutó ninguna tool → el correo no es una
  // solicitud de emisión ni pide datos ni reporta bug. Queda unread para Nazre.
  if (opts.sendReply && toolsExecuted === 0) {
    events!.push({
      kind: 'error',
      error: 'Nala no ejecutó ninguna tool — el correo no es una solicitud de emisión. Queda unread.',
    });
    return { fiscal: true, skipped: true, events, replyText: finalReply, replySent: false, classifyResult };
  }

  // Guardarraíl 2: si Nala SOLO reportó un bug a Nash (sin emitir, sin pedir
  // datos), NO se envía respuesta al cliente. El correo queda unread y Nash
  // procesa el bug en su próxima corrida. Nazre lo verá ambos: el correo
  // unread + el incidente en su panel Nash.
  if (opts.sendReply && onlyReportedBug) {
    events!.push({
      kind: 'error',
      error: 'Nala solo reportó bug a Nash — no se envía respuesta al cliente. Correo unread para revisión de Nazre.',
    });
    return { fiscal: true, skipped: true, events, replyText: finalReply, replySent: false, classifyResult };
  }

  // Sanitizer: remueve marcadores meta que a veces el LLM incluye por reflejo
  // (separadores horizontales, headers tipo "Respuesta al cliente:", etc).
  // Belt + suspenders sobre la prohibición del prompt.
  const sanitizeReply = (raw: string): string => {
    let out = raw;
    // Remueve headers meta al inicio ("---\n\n**Respuesta al cliente:**\n\n" o variantes)
    out = out.replace(/^\s*(-{3,}\s*\n+)?\s*\*{0,2}(Respuesta al cliente|Reply|Reply to sender|Response to client|Análisis|Analysis)\*{0,2}\s*:?\s*\n+/i, '');
    // Remueve separadores markdown sueltos al inicio o final
    out = out.replace(/^\s*-{3,}\s*\n+/, '').replace(/\n+\s*-{3,}\s*$/, '');
    return out.trim();
  };

  finalReply = sanitizeReply(finalReply);

  let replySent = false;
  if (opts.sendReply && finalReply.trim()) {
    const subject = input.subject.toLowerCase().startsWith('re:') ? input.subject : `Re: ${input.subject}`;
    // Nala responde en markdown natural. Convertimos a HTML para que se
    // renderice correctamente en clientes de correo (Gmail, Outlook, etc).
    const { marked } = await import('marked');
    marked.setOptions({ breaks: true, gfm: true });
    const rendered = await marked.parse(finalReply);
    // Firma consistente reutilizada del helper (avatar + info).
    const { nalaEmailHtml } = await import('./nala-cfdi-sender');
    const html = nalaEmailHtml(rendered);

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
