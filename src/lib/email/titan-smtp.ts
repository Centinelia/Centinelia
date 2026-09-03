/**
 * SMTP sender via Titan para responder correos de Nala manteniendo el hilo en
 * el remitente hola@centinelia.mx. También pide guardar una copia en la
 * carpeta Sent (a través de titan-imap.appendToSent) para que Nazre vea la
 * conversación completa en su webmail Titan.
 *
 * Config esperada en env:
 *   TITAN_SMTP_HOST      (default smtp.titan.email)
 *   TITAN_SMTP_PORT      (default 465)
 *   TITAN_EMAIL          (default hola@centinelia.mx)
 *   TITAN_APP_PASSWORD
 */
import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { getTitanConfig, appendToSent } from './titan-imap';

export interface TitanSendInput {
  to:            string;
  subject:       string;
  html:          string;
  text?:         string;
  inReplyTo?:    string;         // Message-Id original para mantener el thread
  references?:   string[];       // References header
  attachments?:  Array<{ filename: string; content: Buffer; contentType?: string }>;
  fromDisplay?:  string;         // "Nala Centinelia" u otro nombre visible
  cc?:           string;
  saveToSent?:   boolean;        // default true
}

export interface TitanSendResult {
  ok:          boolean;
  messageId?:  string;
  savedToSent: boolean;
  error?:      string;
}

function buildTransporter(): { transporter: Transporter; from: string } | null {
  const cfg = getTitanConfig();
  if (!cfg) return null;
  const smtpHost = process.env.TITAN_SMTP_HOST ?? 'smtp.titan.email';
  const smtpPort = Number(process.env.TITAN_SMTP_PORT ?? 465);
  const transporter = nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: true,
    auth: { user: cfg.user, pass: cfg.password },
  });
  return { transporter, from: cfg.user };
}

export async function sendViaTitan(input: TitanSendInput): Promise<TitanSendResult> {
  const built = buildTransporter();
  if (!built) return { ok: false, savedToSent: false, error: 'Titan SMTP no configurado (TITAN_APP_PASSWORD faltante)' };

  const { transporter, from: fromAddr } = built;
  const fromHeader = input.fromDisplay ? `${input.fromDisplay} <${fromAddr}>` : fromAddr;

  const headers: Record<string, string> = {};
  if (input.inReplyTo) headers['In-Reply-To'] = input.inReplyTo;
  if (input.references && input.references.length > 0) {
    headers['References'] = input.references.join(' ');
  }

  try {
    const info = await transporter.sendMail({
      from:    fromHeader,
      to:      input.to,
      cc:      input.cc,
      subject: input.subject,
      text:    input.text,
      html:    input.html,
      headers,
      attachments: input.attachments?.map(a => ({
        filename:    a.filename,
        content:     a.content,
        contentType: a.contentType,
      })),
    });

    let savedToSent = false;
    if (input.saveToSent !== false) {
      const cfg = getTitanConfig();
      if (cfg) {
        try {
          // Reconstruimos un RFC-822 message para meterlo en Sent. nodemailer's
          // `info.messageId` está pero no da el raw. Fabricamos uno mínimo con los
          // mismos headers para que Titan lo indexe.
          const raw = buildRfc822({
            from: fromHeader, to: input.to, subject: input.subject,
            html: input.html, text: input.text,
            messageId: info.messageId,
            inReplyTo: input.inReplyTo,
            references: input.references,
            date: new Date(),
          });
          await appendToSent(cfg, raw);
          savedToSent = true;
        } catch (e) {
          console.warn('[titan-smtp] appendToSent falló:', (e as Error).message);
        }
      }
    }

    return { ok: true, messageId: info.messageId, savedToSent };
  } catch (e) {
    return { ok: false, savedToSent: false, error: (e as Error).message };
  }
}

/**
 * Construye un mensaje RFC-822 mínimo (sin attachments — Titan Sent solo
 * necesita el skeleton para mostrar el mensaje en la lista). Los adjuntos que
 * el receptor ya vio en el correo real no se replican en Sent.
 */
function buildRfc822(m: {
  from: string; to: string; subject: string;
  html: string; text?: string;
  messageId?: string; inReplyTo?: string; references?: string[];
  date: Date;
}): string {
  const lines: string[] = [];
  lines.push(`From: ${m.from}`);
  lines.push(`To: ${m.to}`);
  lines.push(`Subject: ${m.subject}`);
  lines.push(`Date: ${m.date.toUTCString()}`);
  if (m.messageId) lines.push(`Message-ID: ${m.messageId}`);
  if (m.inReplyTo) lines.push(`In-Reply-To: ${m.inReplyTo}`);
  if (m.references && m.references.length > 0) lines.push(`References: ${m.references.join(' ')}`);
  lines.push('MIME-Version: 1.0');
  lines.push('Content-Type: text/html; charset=UTF-8');
  lines.push('');
  lines.push(m.html);
  return lines.join('\r\n');
}
