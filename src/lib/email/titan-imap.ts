/**
 * IMAP client para leer correos entrantes de la cuenta Titan de Centinelia
 * (hola@centinelia.mx). Se usa desde el cron nala-mailbox para procesar
 * fiscales automáticamente.
 *
 * Config esperada en env:
 *   TITAN_IMAP_HOST      (default imap.titan.email)
 *   TITAN_IMAP_PORT      (default 993)
 *   TITAN_EMAIL          (default hola@centinelia.mx)
 *   TITAN_APP_PASSWORD   (app password generado en Panel Titan)
 */
import { ImapFlow } from 'imapflow';
import { simpleParser, type ParsedMail, type Attachment } from 'mailparser';

export interface TitanConfig {
  host:     string;
  port:     number;
  user:     string;
  password: string;
}

export function getTitanConfig(): TitanConfig | null {
  const password = process.env.TITAN_APP_PASSWORD;
  const user     = process.env.TITAN_EMAIL ?? 'hola@centinelia.mx';
  if (!password) return null;
  return {
    host: process.env.TITAN_IMAP_HOST ?? 'imap.titan.email',
    port: Number(process.env.TITAN_IMAP_PORT ?? 993),
    user,
    password,
  };
}

export interface FetchedEmail {
  uid:          number;
  messageId:    string | null;
  from:         string;
  fromName:     string | null;
  to:           string[];
  subject:      string;
  bodyText:     string;
  bodyHtml:     string | null;
  date:         Date | null;
  attachments:  Array<{
    filename: string;
    contentType: string;
    size: number;
    content: Buffer;
  }>;
}

async function connect(cfg: TitanConfig): Promise<ImapFlow> {
  const client = new ImapFlow({
    host:   cfg.host,
    port:   cfg.port,
    secure: true,
    auth:   { user: cfg.user, pass: cfg.password },
    logger: false,
  });
  await client.connect();
  return client;
}

function extractFromEmail(parsed: ParsedMail): { addr: string; name: string | null } {
  const from = parsed.from?.value?.[0];
  return {
    addr: from?.address ?? '',
    name: from?.name?.trim() || null,
  };
}

function extractToAddresses(parsed: ParsedMail): string[] {
  const to = parsed.to;
  if (!to) return [];
  const arr = Array.isArray(to) ? to : [to];
  return arr.flatMap(t => (t.value ?? []).map(v => v.address).filter(Boolean) as string[]);
}

function mapAttachments(atts: Attachment[]): FetchedEmail['attachments'] {
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
 * Trae los N emails más recientes NO leídos (\Seen=false) del INBOX.
 * NO los marca como leídos — eso es responsabilidad del caller tras procesarlos.
 */
export async function fetchUnreadFromTitan(
  cfg: TitanConfig, opts: { limit?: number } = {},
): Promise<FetchedEmail[]> {
  const client = await connect(cfg);
  const results: FetchedEmail[] = [];
  const limit = opts.limit ?? 20;

  try {
    const lock = await client.getMailboxLock('INBOX');
    try {
      // Búsqueda UIDs no leídos (más recientes primero)
      const uids = await client.search({ seen: false }, { uid: true });
      if (!uids || uids.length === 0) return [];

      // Toma los últimos `limit` (más recientes)
      const targetUids = uids.slice(-limit);

      for await (const msg of client.fetch(targetUids, { source: true, envelope: true, uid: true }, { uid: true })) {
        if (!msg.source) continue;
        const parsed = await simpleParser(msg.source);
        const { addr: fromAddr, name: fromName } = extractFromEmail(parsed);
        results.push({
          uid:         msg.uid,
          messageId:   parsed.messageId ?? null,
          from:        fromAddr,
          fromName,
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
 * Marca UIDs como leídos (\Seen) en INBOX. Se llama después de procesar
 * exitosamente un correo, para que no vuelva a caer en el próximo cron.
 */
export async function markSeenInTitan(cfg: TitanConfig, uids: number[]): Promise<void> {
  if (uids.length === 0) return;
  const client = await connect(cfg);
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
 * Agrega un mensaje enviado a la carpeta Sent del IMAP.
 * Cuando Nala responde via SMTP, el mensaje llega al destinatario pero NO
 * queda en la carpeta Enviados del webmail. Esta función guarda una copia
 * para que aparezca ahí como si Nazre hubiera respondido normalmente.
 */
export async function appendToSent(cfg: TitanConfig, rawMessage: Buffer | string): Promise<void> {
  const client = await connect(cfg);
  try {
    // Titan usa "Sent" (nombre estándar). Si algún day cambia, esto falla y el
    // caller loggea — no bloqueamos el envío por eso.
    await client.append('Sent', rawMessage, ['\\Seen']);
  } finally {
    await client.logout().catch(() => { /* ignore */ });
  }
}
