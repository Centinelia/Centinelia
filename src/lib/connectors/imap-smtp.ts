import nodemailer from 'nodemailer';
import MailComposer from 'nodemailer/lib/mail-composer/index.js';
import { ImapFlow } from 'imapflow';
import { simpleParser, type ParsedMail, type Attachment as MailAttachment } from 'mailparser';
import type { Attachment, Connector, EmailConnector, SendMeta } from './types';

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
  /** IMAP inbound (Fase 2). Opcional: si está presente, el empleado puede
   *  leer su inbox. Default: puerto 993, secure=true. */
  imapHost?: string;
  imapPort?: number;
}

export interface FetchedEmail {
  uid:         number;
  messageId:   string | null;
  from:        string;
  fromName:    string | null;
  to:          string[];
  subject:     string;
  bodyText:    string;
  bodyHtml:    string | null;
  date:        Date | null;
  attachments: Array<{
    filename:    string;
    contentType: string;
    size:        number;
    content:     Buffer;
  }>;
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
 * Metadata que devuelve el SMTP relay al aceptar el mensaje. `response` es la
 * línea 250 completa; `accepted`/`rejected` son las direcciones que el relay
 * confirmó o rechazó en la sesión (no garantiza entrega final — un `250` puede
 * ser aceptado y luego rebotar). Se persiste en `outbound_emails.smtp_response`
 * para diagnosticar deliverability post-facto.
 */
export interface SmtpSendResult {
  messageId?: string;
  response:   string;
  accepted:   string[];
  rejected:   string[];
  envelope:   { from: string; to: string[] };
}

/**
 * Envía un correo por SMTP directo al servidor del cliente (Telmex/Prodigy,
 * Titan, cPanel, cualquier proveedor con IMAP/SMTP estándar). Reutilizable
 * desde la ruta de test (probar creds antes de guardar) y desde el connector
 * per-agent que resuelve `getFileConnector`.
 *
 * Adicional a `sendMail`, si el cfg tiene IMAP configurado hace **IMAP APPEND
 * al folder Sent** con el mismo raw MIME que salió por SMTP. Sin esto, los
 * clientes webmail (Roundcube, Zimbra, Telmex) que leen vía IMAP muestran
 * "Enviados" vacío aunque los correos hayan salido — el owner cree que el
 * empleado no manda. Descubierto 2026-09-05 con Tortillería Estrella.
 */
export async function sendViaSmtp(
  cfg:      SmtpConfig,
  to:       string,
  subject:  string,
  bodyText: string,
  attachment?: Attachment,
  htmlBody?:   string,
): Promise<SmtpSendResult> {
  const from = cfg.fromDisplay
    ? `${cfg.fromDisplay} <${cfg.username}>`
    : cfg.username;

  // Construimos el MIME UNA vez (via MailComposer) y lo usamos tanto para
  // enviar como para el APPEND. Evita divergencia entre lo enviado y lo
  // guardado en Sent.
  const composer = new MailComposer({
    from,
    to,
    subject,
    text:        bodyText || (htmlBody ? '' : subject),
    html:        htmlBody,
    attachments: attachment
      ? [{ filename: attachment.filename, content: attachment.content, contentType: attachment.mimeType }]
      : undefined,
  });
  const rawBuffer: Buffer = await new Promise((resolve, reject) => {
    composer.compile().build((err: Error | null, message: Buffer) => {
      if (err) reject(err); else resolve(message);
    });
  });

  const transporter = nodemailer.createTransport(buildTransportOptions(cfg));
  let info: nodemailer.SentMessageInfo;
  try {
    info = await transporter.sendMail({
      envelope: { from: cfg.username, to: [to] },
      raw:      rawBuffer,
    });
  } finally {
    transporter.close();
  }

  // Best-effort IMAP APPEND — no bloquea ni propaga error. Si el IMAP no
  // está disponible (no imap_host, timeout, folder no encontrado), el send
  // sigue siendo exitoso pero el mensaje no aparecerá en el webmail.
  void appendToSentFolder(cfg, rawBuffer).catch(err => {
    console.warn(`[sendViaSmtp] APPEND a Sent falló (envío sí salió) para ${cfg.username} → ${to}:`,
      err instanceof Error ? err.message : err);
  });

  return {
    messageId: info.messageId,
    response:  String(info.response ?? ''),
    accepted:  (info.accepted ?? []).map(String),
    rejected:  (info.rejected ?? []).map(String),
    envelope:  { from: cfg.username, to: [to] },
  };
}

// Nombres típicos del folder Sent, en orden de preferencia. Distintos servidores
// (Zimbra/Telmex, cPanel/Roundcube, Titan, Exchange) usan nombres distintos.
// Buscamos el flag SPECIAL-USE `\Sent` primero y caemos a nombres comunes.
const SENT_FOLDER_CANDIDATES = [
  'Sent',
  'Sent Items',
  'Sent Messages',
  'INBOX.Sent',
  'Enviados',
  'INBOX.Enviados',
  '[Gmail]/Sent Mail',
];

async function findSentFolderName(client: ImapFlow): Promise<string | null> {
  try {
    const list = await client.list();
    // Primero por SPECIAL-USE \Sent (RFC 6154) — es lo correcto donde exista.
    const bySpecial = list.find(m => Array.isArray(m.specialUse) ? m.specialUse.includes('\\Sent') : m.specialUse === '\\Sent');
    if (bySpecial) return bySpecial.path;
    // Fallback: buscamos por nombre exacto entre candidatos.
    const names = new Set(list.map(m => m.path));
    for (const c of SENT_FOLDER_CANDIDATES) if (names.has(c)) return c;
  } catch {
    // Si list falla, retornamos null y el caller salta el APPEND.
  }
  return null;
}

async function appendToSentFolder(cfg: SmtpConfig, rawMime: Buffer): Promise<void> {
  // Skip si no hay IMAP configurado — cfg.host puede ser SMTP-only. En ese
  // caso no hay a dónde escribir el Sent.
  if (!cfg.imapHost && !cfg.host) return;
  const client = await connectImap(cfg);
  try {
    const sentFolder = await findSentFolderName(client);
    if (!sentFolder) {
      console.warn(`[sendViaSmtp] no encontré folder Sent en IMAP de ${cfg.username} — APPEND skipped`);
      return;
    }
    // Flag \Seen para que aparezca ya leído (el owner no lo mandó "manualmente";
    // no queremos que se llenen los "no leídos" del webmail).
    await client.append(sentFolder, rawMime, ['\\Seen']);
  } finally {
    await client.logout().catch(() => { /* ignore */ });
  }
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

// ---------------------------------------------------------------------------
// IMAP inbound (Fase 2)
// ---------------------------------------------------------------------------

/** Extrae host + puerto IMAP de la config, con defaults 993 + secure. */
function imapConn(cfg: SmtpConfig): { host: string; port: number } {
  const host = cfg.imapHost ?? cfg.host;
  const port = cfg.imapPort ?? 993;
  return { host, port };
}

async function connectImap(cfg: SmtpConfig): Promise<ImapFlow> {
  const { host, port } = imapConn(cfg);
  const client = new ImapFlow({
    host, port,
    secure: true,
    auth:   { user: cfg.username, pass: cfg.password },
    logger: false,
    tls:    cfg.tlsInsecure ? { rejectUnauthorized: false } : undefined,
  });
  await client.connect();
  return client;
}

/**
 * Verifica creds IMAP conectando + auth sin hacer fetch. Análogo a
 * verifySmtpCreds. Se usa desde el endpoint /test antes de guardar.
 */
export async function verifyImapCreds(cfg: SmtpConfig): Promise<void> {
  const client = await connectImap(cfg);
  try {
    // conectar + auth ya lo hace connectImap; abrir INBOX confirma acceso
    const lock = await client.getMailboxLock('INBOX');
    lock.release();
  } finally {
    await client.logout().catch(() => { /* ignore */ });
  }
}

function extractFromEmail(parsed: ParsedMail): { addr: string; name: string | null } {
  const from = parsed.from?.value?.[0];
  return { addr: from?.address ?? '', name: from?.name?.trim() || null };
}

function extractToAddresses(parsed: ParsedMail): string[] {
  const to = parsed.to;
  if (!to) return [];
  const arr = Array.isArray(to) ? to : [to];
  return arr.flatMap(t => (t.value ?? []).map(v => v.address).filter(Boolean) as string[]);
}

function mapAttachments(atts: MailAttachment[]): FetchedEmail['attachments'] {
  return atts
    .filter(a => a.content && Buffer.isBuffer(a.content))
    .map(a => ({
      filename:    a.filename ?? 'attachment',
      contentType: a.contentType ?? 'application/octet-stream',
      size:        a.size ?? a.content.length,
      content:     a.content,
    }));
}

/**
 * Trae los N emails más recientes NO leídos (\Seen=false) del INBOX. NO los
 * marca como leídos — el caller decide después de procesar exitosamente.
 * Espejo de fetchUnreadFromTitan; adaptado para SmtpConfig per-empleado.
 */
export async function fetchUnreadFromImap(
  cfg: SmtpConfig, opts: { limit?: number } = {},
): Promise<FetchedEmail[]> {
  const client = await connectImap(cfg);
  const results: FetchedEmail[] = [];
  const limit = opts.limit ?? 20;

  try {
    const lock = await client.getMailboxLock('INBOX');
    try {
      const uids = await client.search({ seen: false }, { uid: true });
      if (!uids || uids.length === 0) return [];

      const targetUids = uids.slice(-limit);
      for await (const msg of client.fetch(targetUids, { source: true, envelope: true, uid: true }, { uid: true })) {
        if (!msg.source) continue;
        const parsed = await simpleParser(msg.source);
        const { addr, name } = extractFromEmail(parsed);
        results.push({
          uid:         msg.uid,
          messageId:   parsed.messageId ?? null,
          from:        addr,
          fromName:    name,
          to:          extractToAddresses(parsed),
          subject:     parsed.subject ?? '(sin asunto)',
          bodyText:    parsed.text ?? '',
          bodyHtml:    parsed.html || null,
          date:        parsed.date ?? null,
          attachments: mapAttachments(parsed.attachments ?? []),
        });
      }
    } finally {
      lock.release();
    }
  } finally {
    await client.logout().catch(() => { /* ignore */ });
  }

  return results;
}

/**
 * Marca UIDs como leídos (\Seen) en INBOX. Espejo de markSeenInTitan.
 */
export async function markSeenInImap(cfg: SmtpConfig, uids: number[]): Promise<void> {
  if (uids.length === 0) return;
  const client = await connectImap(cfg);
  try {
    const lock = await client.getMailboxLock('INBOX');
    try {
      await client.messageFlagsAdd(uids, ['\\Seen'], { uid: true });
    } finally {
      lock.release();
    }
  } finally {
    await client.logout().catch(() => { /* ignore */ });
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
    async send(to, subject, body, attachment, _fromEmail, htmlBody): Promise<SendMeta> {
      // Ignoramos `_fromEmail` — SMTP no permite spoof. Siempre sale desde cfg.username.
      const result = await sendViaSmtp(cfg, to, subject, body, attachment, htmlBody);
      return {
        provider_response: {
          messageId: result.messageId,
          response:  result.response,
          accepted:  result.accepted,
          rejected:  result.rejected,
          envelope:  result.envelope,
        },
      };
    },
    async fetchUnread(_since, _folder) {
      // Sólo devolvemos correos si el empleado tiene IMAP configurado.
      // `_since` se ignora — IMAP unread ya filtra por \Seen=false.
      // `_folder` se ignora — solo INBOX por ahora.
      if (!cfg.imapHost && !cfg.host) return [];
      const emails = await fetchUnreadFromImap(cfg);
      return emails.map(e => ({
        id:       String(e.uid),
        threadId: e.messageId ?? String(e.uid),
        from:     e.from,
        subject:  e.subject,
        body:     e.bodyText,
      }));
    },
    async sendReply(params) {
      const from = cfg.fromDisplay ? `${cfg.fromDisplay} <${cfg.username}>` : cfg.username;
      const transporter = nodemailer.createTransport(buildTransportOptions(cfg));
      const subj = params.subject ?? '';
      try {
        await transporter.sendMail({
          from,
          to:         params.to ?? cfg.username,
          subject:    subj.toLowerCase().startsWith('re:') ? subj : `Re: ${subj}`,
          text:       params.body,
          inReplyTo:  params.threadId ?? params.messageId,
          references: params.threadId ?? params.messageId,
          attachments: params.attachments?.map(a => ({
            filename: a.filename, content: a.content, contentType: a.mimeType,
          })),
        });
      } finally {
        transporter.close();
      }
    },
    async markRead(messageId) {
      const uid = Number.parseInt(messageId, 10);
      if (!Number.isFinite(uid)) return;
      await markSeenInImap(cfg, [uid]);
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
