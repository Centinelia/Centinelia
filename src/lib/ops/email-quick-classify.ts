/**
 * Clasificador determinístico de correos (C5 iniciativa Company OS).
 *
 * Principio del artículo: "deterministic first, model as fallback. Never pay
 * a model to parse a regex." Muchos correos entrantes son obviamente spam,
 * marketing o notificaciones automáticas — no requieren juicio de un LLM
 * para clasificarlos. Cada uno que resolvemos aquí ahorra una tarea al
 * cliente y un token pagado a Anthropic.
 *
 * Regla de oro: **conservador**. Un falso positivo aquí es un correo real
 * marcado como spam y perdido. Solo clasificamos cuando la evidencia es
 * abrumadora — el resto sigue camino a Claude.
 */

export type QuickCategory = 'spam' | 'auto_notification' | null;

export interface QuickClassifyInput {
  from:    string;
  subject: string;
  body:    string;
}

export interface QuickClassifyResult {
  category: QuickCategory;
  reason:   string | null;
}

// ── Remitentes de notificación automática (matcheo de local-part o dominio) ──

const NOTIFICATION_LOCAL_PARTS = [
  'no-reply', 'noreply', 'no_reply',
  'donotreply', 'do-not-reply', 'do_not_reply',
  'notification', 'notifications',
  'alert', 'alerts',
  'automated', 'automatic',
  'system', 'sys',
  'bounce', 'bounces',
  'mailer-daemon', 'mailer_daemon',
  'postmaster',
];

const NOTIFICATION_LOCAL_PATTERNS = NOTIFICATION_LOCAL_PARTS.map(lp =>
  new RegExp(`^${lp}([+._-][a-z0-9]+)?@`, 'i')
);

// ── Marketing / newsletter (necesita match tanto en asunto como cuerpo) ──

const MARKETING_SUBJECT_PATTERNS: RegExp[] = [
  /\b\d{1,2}%\s+off\b/i,
  /\b\d{1,2}%\s+de\s+descuento\b/i,
  /\bmega\s+oferta\b/i,
  /\bpromoci[oó]n\s+exclusiva\b/i,
  /\bnewsletter\b/i,
  /\bpreventa\b/i,
  /\bpre-orden\b/i,
  /\bblack\s+friday\b/i,
  /\bcyber\s+monday\b/i,
  /\bhot\s+sale\b/i,
  /\bbuen\s+fin\b/i,
  /\btu\s+resumen\s+(semanal|mensual|diario)\b/i,
];

const MARKETING_BODY_PATTERNS: RegExp[] = [
  /\bunsubscribe\b/i,
  /\bdejar\s+de\s+recibir\s+(estos?\s+)?correos?\b/i,
  /\bdarse\s+de\s+baja\b/i,
  /\bcancelar\s+suscripci[oó]n\b/i,
  /\bmanage\s+preferences\b/i,
  /\bview\s+in\s+browser\b/i,
  /\bver\s+en\s+navegador\b/i,
];

// ── Recibos / confirmaciones automáticas ──

const RECEIPT_SUBJECT_PATTERNS: RegExp[] = [
  /^(re: )?receipt\b/i,
  /^(re: )?tu\s+recibo\b/i,
  /^(re: )?your\s+receipt\b/i,
  /^(re: )?order\s+confirmation\b/i,
  /^(re: )?confirmaci[oó]n\s+de\s+(orden|pedido|compra)\b/i,
  /^(re: )?tu\s+factura\s+(de|electr[oó]nica)\b/i,
  /^invoice\s+#\d+/i,
  /^\[(alert|alerta|automated)\]/i,
];

function matchesAny(text: string, patterns: RegExp[]): RegExp | null {
  for (const rx of patterns) if (rx.test(text)) return rx;
  return null;
}

/**
 * Clasificación determinística. Devuelve `null` en category cuando no hay
 * evidencia suficiente — en ese caso el correo continúa al pipeline con
 * Claude.
 *
 * Ejemplos que SÍ debe atrapar:
 * - `no-reply@amazon.com` con asunto "Order confirmation" → auto_notification
 * - `newsletter@promos.com` con "20% off + unsubscribe link" → spam
 * - `notifications@stripe.com` → auto_notification
 *
 * Ejemplos que NO debe atrapar (falsos positivos evitados):
 * - `soporte@proveedor.com` con "Notification about your order" → deja pasar
 *   (support@ es legítimo en muchos negocios)
 * - `juan@cliente.com` con "quiero un descuento del 20%" → deja pasar
 *   (mensaje real de un cliente pidiendo descuento)
 */
export function quickClassifyEmail(input: QuickClassifyInput): QuickClassifyResult {
  const from    = (input.from    ?? '').trim().toLowerCase();
  const subject = (input.subject ?? '').trim();
  const body    = (input.body    ?? '');

  // 1. Local-part del remitente = no-reply / notifications / alerts / postmaster / etc.
  //    Es la señal más fuerte y confiable.
  for (const rx of NOTIFICATION_LOCAL_PATTERNS) {
    if (rx.test(from)) {
      return { category: 'auto_notification', reason: `remitente automático (${from})` };
    }
  }

  // 2. Recibos / confirmaciones automáticas por asunto
  const receipt = matchesAny(subject, RECEIPT_SUBJECT_PATTERNS);
  if (receipt) {
    return { category: 'auto_notification', reason: `asunto de recibo/confirmación ("${subject.slice(0, 40)}…")` };
  }

  // 3. Marketing — requiere señales dobles (asunto Y cuerpo). Un solo match
  //    no es suficiente para arriesgar un falso positivo con un cliente real.
  const marketingSubject = matchesAny(subject, MARKETING_SUBJECT_PATTERNS);
  const marketingBody    = matchesAny(body,    MARKETING_BODY_PATTERNS);
  if (marketingSubject && marketingBody) {
    return { category: 'spam', reason: `marketing (asunto + cuerpo con "${marketingBody.source.slice(0, 30)}")` };
  }

  // 4. Solo body "unsubscribe" pero sin sujeto marketing → probablemente
  //    boletín confirmable como spam. Solo si además `from` tiene dominio de
  //    envío masivo típico.
  if (marketingBody) {
    const massSenderDomain = /@(mail|email|marketing|hs-send|sendgrid|amazonses|mailgun|mandrill|constantcontact|sendinblue|mailchimp)\./i;
    if (massSenderDomain.test(from)) {
      return { category: 'spam', reason: `envío masivo (${from}) con cuerpo de boletín` };
    }
  }

  return { category: null, reason: null };
}
