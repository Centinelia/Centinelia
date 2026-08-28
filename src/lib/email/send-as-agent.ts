import type { createAdminClient } from '@/lib/supabase/admin';
import type { Attachment, IntegrationRow, Connector } from '@/lib/connectors';
import { sendEmail, agentBrandedFrom } from './send';
import { getFileConnector } from './agent-connector';

type SupabaseClient = ReturnType<typeof createAdminClient>;

export interface SendAsAgentInput {
  agentId:      string;
  to:           string;
  subject:      string;
  /** HTML ya renderizado. El caller es responsable del formatting (markdown-
   *  to-html, wrapping, footers). */
  html:         string;
  /** From explícito para el fallback Resend. Si se omite, se computa desde
   *  `agent` via `agentBrandedFrom`. Ignorado en el path OAuth (Gmail/Outlook
   *  siempre envían desde `integration.send_as_email` o desde la cuenta OAuth). */
  from?:        string;
  replyTo?:     string;
  attachment?:  Attachment;
  /** Datos del agente para computar From del fallback Resend. Opcional si
   *  `from` viene explícito. */
  agent?: {
    agent_name?:            string | null;
    business_name?:         string | null;
    email_from?:            string | null;
    email_domain_verified?: boolean | null;
  };
}

export interface SendAsAgentResult {
  ok:       boolean;
  provider: 'gmail' | 'outlook' | 'resend' | 'none';
  error?:   string;
}

/**
 * Envía un HTML pre-construido "como el meerkat", enrutando por el mejor canal
 * disponible sin duplicar la lógica en cada executor de tool.
 *
 * Orden de intento:
 * 1. **OAuth Gmail/Outlook** — si el meerkat tiene integración OAuth activa,
 *    el correo sale desde su cuenta real (Gmail API / Microsoft Graph). Es
 *    lo natural cuando el cliente conectó su Workspace desde el portal.
 * 2. **Resend + dominio propio verificado** — si `agent.email_from` +
 *    `agent.email_domain_verified=true`, `agentBrandedFrom` genera un From
 *    con el dominio del cliente ("Nelia (Negocio) <nelia@dominio.mx>").
 * 3. **Resend + Centinelia** — fallback final. Sale como
 *    "Nelia Centinelia <notificaciones@centinelia.mx>".
 *
 * Si el OAuth path falla (token expirado, throw, etc), cae automáticamente
 * a Resend en vez de propagar el error — el correo sale sí o sí (con menor
 * fidelidad de branding, pero sale).
 *
 * @param precomputedConnector - Si el caller ya resolvió el connector, evita
 *   una segunda query. Pasa `undefined` (default) para que resuelva. Pasa
 *   `null` explícito para saltar OAuth y forzar Resend.
 */
export async function sendMeerkatHtmlEmail(
  input:    SendAsAgentInput,
  supabase: SupabaseClient,
  precomputedConnector?: { integration: IntegrationRow; conn: Connector } | null,
): Promise<SendAsAgentResult> {
  const ic = precomputedConnector !== undefined
    ? precomputedConnector
    : await getFileConnector(input.agentId, supabase);

  if (ic) {
    const sendFrom = ((ic.integration as unknown as Record<string, unknown>).send_as_email as string | null | undefined) ?? undefined;
    try {
      const plainFallback = htmlToPlainText(input.html);
      await ic.conn.email.send(input.to, input.subject, plainFallback, input.attachment, sendFrom, input.html);
      return { ok: true, provider: ic.integration.provider as 'gmail' | 'outlook' };
    } catch (err) {
      console.warn('[sendMeerkatHtmlEmail] OAuth send failed, cayendo a Resend:', err);
    }
  }

  const from = input.from ?? agentBrandedFrom(input.agent ?? null);
  const resendAtts = input.attachment
    ? [{ filename: input.attachment.filename, content: input.attachment.content.toString('base64') }]
    : undefined;
  const ok = await sendEmail({
    to:          input.to,
    subject:     input.subject,
    html:        input.html,
    from,
    replyTo:     input.replyTo,
    attachments: resendAtts,
  });
  return { ok, provider: ok ? 'resend' : 'none' };
}

/**
 * Extracción muy básica de texto para el argumento plain-text de Gmail/Outlook
 * API (algunos clientes fallan al enviar solo HTML sin plain-text sibling).
 * No pretende preservar formato; solo remove tags + collapse whitespace.
 */
function htmlToPlainText(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|li|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
