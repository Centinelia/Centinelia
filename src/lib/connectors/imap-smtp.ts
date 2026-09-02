import nodemailer from 'nodemailer';
import type { Attachment, Connector, EmailConnector } from './types';

export interface SmtpConfig {
  host:     string;
  port:     number;
  secure:   boolean;    // true = TLS implícito (puerto 465), false = STARTTLS o plain
  username: string;
  password: string;     // plaintext — el caller ya desencriptó
  /** Display name que aparece en el From (ej "Nelia · Tortillería Estrella").
   *  El address siempre es `username` — SMTP no permite spoof. */
  fromDisplay?: string;
  /** Si true, ignora mismatch del certificado TLS (host CNAME vs cert altnames).
   *  Necesario para Telmex/Prodigy donde el hosting real es CarrierZone
   *  y el cert es para *.carrierzone.com. Outlook/Thunderbird permiten esto
   *  vía diálogo "confiar siempre"; nosotros lo exponemos como toggle.
   *  Default false = validación estricta. */
  tlsInsecure?: boolean;
}

function buildTransportOptions(cfg: SmtpConfig) {
  return {
    host:   cfg.host,
    port:   cfg.port,
    secure: cfg.secure,
    auth: {
      user: cfg.username,
      pass: cfg.password,
    },
    tls: cfg.tlsInsecure
      ? { rejectUnauthorized: false }
      : undefined,
    connectionTimeout: 10_000,
    greetingTimeout:   10_000,
    socketTimeout:     20_000,
  };
}

/**
 * Envía un correo por SMTP directo al servidor del cliente (Telmex/Prodigy,
 * Titan, cPanel, cualquier proveedor con IMAP/SMTP estándar). Reutilizable
 * desde la ruta de test (probar creds antes de guardar) y desde el connector
 * per-agent que resuelve `getFileConnector`.
 *
 * Retorna void para ser drop-in del `EmailConnector.send` que Gmail/Outlook
 * cumplen (Connector interface espera Promise<void>; el caller mapea
 * excepción → error). Solo outbound por ahora — MVP.
 */
export async function sendViaSmtp(
  cfg:      SmtpConfig,
  to:       string,
  subject:  string,
  bodyText: string,
  attachment?: Attachment,
  htmlBody?:   string,
): Promise<void> {
  const transporter = nodemailer.createTransport(buildTransportOptions(cfg));

  const from = cfg.fromDisplay
    ? `${cfg.fromDisplay} <${cfg.username}>`
    : cfg.username;

  await transporter.sendMail({
    from,
    to,
    subject,
    text:        bodyText || (htmlBody ? '' : subject),
    html:        htmlBody,
    attachments: attachment
      ? [{ filename: attachment.filename, content: attachment.content, contentType: attachment.mimeType }]
      : undefined,
  });

  transporter.close();
}

/**
 * Verifica que los creds funcionan: intenta conectar + autenticar sin mandar
 * correo. Se usa en el endpoint /test antes de guardar en la BD. Throws con
 * mensaje humano si algo falla (host inválido, cred incorrecta, TLS fail).
 */
export async function verifySmtpCreds(cfg: SmtpConfig): Promise<void> {
  const transporter = nodemailer.createTransport({ ...buildTransportOptions(cfg), socketTimeout: 10_000 });
  try {
    await transporter.verify();
  } finally {
    transporter.close();
  }
}

/**
 * Construye un EmailConnector minimal-outbound: solo `send()` funciona; el
 * resto (fetchUnread, sendReply, markRead) throw. Suficiente para MVP porque
 * el único caller crítico es sendMeerkatHtmlEmail → ic.conn.email.send.
 *
 * Cuando llegue Fase 2 (leer inbox via IMAP), se amplía este connector.
 */
export function createImapSmtpConnector(cfg: SmtpConfig): Connector {
  const email: EmailConnector = {
    async send(to, subject, body, attachment, _fromEmail, htmlBody) {
      // Ignoramos `_fromEmail` — SMTP no permite spoof. Siempre sale desde cfg.username.
      await sendViaSmtp(cfg, to, subject, body, attachment, htmlBody);
    },
    async fetchUnread() {
      throw new Error('IMAP fetchUnread aún no implementado (Fase 2)');
    },
    async sendReply() {
      throw new Error('IMAP sendReply aún no implementado (Fase 2)');
    },
    async markRead() {
      throw new Error('IMAP markRead aún no implementado (Fase 2)');
    },
  };

  return {
    // Downstream shape espera 'google' | 'microsoft' | 'dropbox'. Mapeo a
    // 'microsoft' es arbitrario pero seguro: casi nadie discrimina por
    // provider en el hot path — solo se lee `.email.send`. Si algún caller
    // ramifica por provider (raro) va a caer por default a microsoft-like.
    // Cuando amplíemos a Fase 2, agregar 'imap_smtp' al enum del type.
    provider: 'microsoft',
    email,
    files: {
      async search()      { return []; },
      async read()        { throw new Error('IMAP/SMTP no provee files'); },
      async download()    { return null; },
      async upload()      { return null; },
      async list()        { return []; },
      async move()        { return false; },
      async rename()      { return false; },
      async createFolder(){ return null; },
    },
  };
}
