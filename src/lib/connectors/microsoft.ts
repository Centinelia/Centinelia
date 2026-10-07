import type { Connector, EmailConnector, FilesConnector, CalendarConnector, CalendarEvent, CreateEventInput, EmailMessage, FileItem, Attachment, UploadResult, FolderResult, ReplyParams } from './types';
import { parseFileToText } from './parse';

const GRAPH = 'https://graph.microsoft.com/v1.0';

// ── Email ─────────────────────────────────────────────────────────────────────

export type MicrosoftAuthErrorCallback = (details: { status: number; where: string }) => void | Promise<void>;

class MicrosoftEmail implements EmailConnector {
  constructor(private tok: string, private onAuthError?: MicrosoftAuthErrorCallback) {}

  private h(): Record<string, string> {
    return { Authorization: `Bearer ${this.tok}` };
  }

  private async triggerAuthErrorIfNeeded(res: Response, where: string): Promise<void> {
    if ((res.status === 401 || res.status === 403) && this.onAuthError) {
      try { await this.onAuthError({ status: res.status, where }); }
      catch (err) { console.error('[microsoft/onAuthError] callback threw:', err); }
    }
  }

  async fetchUnread(since: Date, folder: 'inbox' | 'spam' = 'inbox'): Promise<EmailMessage[]> {
    const folderName = folder === 'spam' ? 'JunkEmail' : 'Inbox';
    // 2026-10-07 BUG FIX: antes era `isRead eq false and receivedDateTime gt ${since}`.
    // El filtro isRead=false skippea correos que Outlook marcó como leídos ANTES del
    // sync — típico cuando el dueño del buzón se auto-manda correos desde su móvil
    // (Outlook los marca como leídos instant). Caso real demo AC Camila 2026-10-07:
    // 2 correos con OC+factura Trane nunca llegaron a Nami. La dedup se hace en
    // ops_inbox por rawMessageId, no hace falta el filtro isRead.
    //
    // 2026-10-07 (segunda vez): también agregamos hasAttachments al select para
    // detectar correos con PDFs. Attachments metadata se trae con $expand en una
    // segunda query solo si hasAttachments=true (optimización — la mayoría no tiene).
    // Caso real: TEST-88888 llegó con PDF pero attachments=[] en ops_inbox porque
    // el connector no los expandía. Resultado: detectForcedTool no disparaba
    // porque el patrón requiere PDF attachment.
    const filter     = `receivedDateTime gt ${since.toISOString()}`;
    const select     = 'id,conversationId,subject,from,body,receivedDateTime,hasAttachments';
    const url        = `${GRAPH}/me/mailFolders/${folderName}/messages?$filter=${encodeURIComponent(filter)}&$select=${select}&$top=20&$orderby=receivedDateTime desc`;
    const res = await fetch(url, { headers: this.h() });
    if (!res.ok) {
      // Ver Scope C1 CRIT #2 (patrón F13). MS Graph 401/403 = token revocado
      // o consent removido desde admin.microsoft.com → set needs_reauth.
      await this.triggerAuthErrorIfNeeded(res, 'fetchUnread');
      return [];
    }
    const data = await res.json();
    const messages = (data.value ?? []) as Array<{
      id: string;
      conversationId?: string;
      from: { emailAddress: { address: string; name: string } };
      subject: string;
      body: { content: string };
      hasAttachments?: boolean;
    }>;

    // Para cada mensaje con hasAttachments, fetch attachment metadata en paralelo.
    //
    // 2026-10-07: Graph no acepta contentId en $select (BadRequest), así que
    // omitimos el filtro y nos quedamos con todos los campos. isInline SÍ se
    // puede filtrar en POST-processing. Caso real demo AC: hoja de salida llegó
    // como JPEG pegada al body con isInline=true → Outlook así clasifica
    // imágenes pegadas desde clipboard. El attachment real existe en Graph pero
    // sin filtro inteligente se descartaba junto con logos de firma. Heurística:
    //   - inline + image/* + size > 5KB → contenido real (foto, screenshot).
    //   - inline + image/* + size ≤ 5KB → logo/pixel de firma, skipear.
    //   - no-inline → siempre incluir (adjunto formal).
    const attachmentPromises = messages.map(async m => {
      if (!m.hasAttachments) return [];
      try {
        const attUrl = `${GRAPH}/me/messages/${encodeURIComponent(m.id)}/attachments`;
        const attRes = await fetch(attUrl, { headers: this.h() });
        if (!attRes.ok) return [];
        const attData = await attRes.json();
        const raw = (attData.value ?? []) as Array<{ id: string; name?: string; contentType?: string; size?: number; isInline?: boolean }>;
        return raw
          .filter(a => {
            if (!a.isInline) return true;
            const mime = (a.contentType ?? '').toLowerCase();
            if (!mime.startsWith('image/')) return true;
            // Imagen inline: filtrar logos/pixels de firma (<5KB).
            return (a.size ?? 0) > 5120;
          })
          .map(a => ({
            id:       a.id,
            name:     a.name ?? 'attachment',
            mimeType: a.contentType ?? 'application/octet-stream',
            size:     a.size ?? 0,
          }));
      } catch (err) {
        console.warn('[microsoft/fetchUnread] attachment fetch failed for', m.id, err);
        return [];
      }
    });
    const attachmentsPerMsg = await Promise.all(attachmentPromises);

    return messages.map((m, idx) => ({
      id:          m.id,
      threadId:    m.conversationId,
      from:        `${m.from?.emailAddress?.name ?? ''} <${m.from?.emailAddress?.address ?? ''}>`,
      subject:     m.subject ?? '',
      body:        stripHtml(m.body?.content ?? ''),
      attachments: attachmentsPerMsg[idx],
    }));
  }

  async unmarkSpam(messageId: string): Promise<void> {
    await fetch(`${GRAPH}/me/messages/${messageId}/move`, {
      method:  'POST',
      headers: { ...this.h(), 'Content-Type': 'application/json' },
      body:    JSON.stringify({ destinationId: 'inbox' }),
    });
  }

  async send(to: string, subject: string, body: string, attachment?: Attachment, fromEmail?: string, htmlBody?: string): Promise<void> {
    const message: Record<string, unknown> = {
      subject,
      body:         htmlBody
        ? { contentType: 'HTML', content: htmlBody }
        : { contentType: 'Text', content: body },
      toRecipients: [{ emailAddress: { address: to } }],
      ...(fromEmail ? { from: { emailAddress: { address: fromEmail } } } : {}),
    };
    if (attachment) {
      message.attachments = [{
        '@odata.type': '#microsoft.graph.fileAttachment',
        name:          attachment.filename,
        contentType:   attachment.mimeType,
        contentBytes:  attachment.content.toString('base64'),
      }];
    }
    await fetch(`${GRAPH}/me/sendMail`, {
      method:  'POST',
      headers: { ...this.h(), 'Content-Type': 'application/json' },
      body:    JSON.stringify({ message }),
    });
  }

  async sendReply({ messageId, body, attachments }: ReplyParams): Promise<void> {
    // Attachments requieren flujo separado en Microsoft Graph: createReply →
    // POST /messages/{draftId}/attachments (uno por uno o via /$value para
    // >4MB) → /messages/{draftId}/send. TODO: implementar cuando algún piloto
    // Outlook necesite adjuntar files generados por Nova/Niva. Por ahora
    // logeamos y enviamos el reply sin adjuntos — mejor que fallar silencioso.
    if (attachments?.length) {
      console.warn(
        '[microsoft.sendReply] attachments no soportados aún, enviando sin adjuntos',
        { count: attachments.length, names: attachments.map(a => a.filename) },
      );
    }
    // 2026-10-07: detecta HTML en el body (ej. firma con <img src=".../logo.png">)
    // y lo manda como HTML en vez de texto plano. Sin esto el <img> aparecía
    // como texto literal al cliente. Pattern: cualquier tag HTML común activa
    // modo HTML. Si no hay tags, usamos `comment` (text/plain) como siempre.
    const looksLikeHtml = /<(img|a|br|p|div|span|b|i|strong|em|table|ul|ol|li)[\s>/]/i.test(body);
    if (looksLikeHtml) {
      // Convertir newlines a <br> y envolver en HTML si no está ya
      const htmlBody = /<html|<body/i.test(body)
        ? body
        : `<html><body>${body.replace(/\n/g, '<br>')}</body></html>`;
      await fetch(`${GRAPH}/me/messages/${messageId}/reply`, {
        method:  'POST',
        headers: { ...this.h(), 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          message: { body: { contentType: 'HTML', content: htmlBody } },
        }),
      });
      return;
    }
    await fetch(`${GRAPH}/me/messages/${messageId}/reply`, {
      method:  'POST',
      headers: { ...this.h(), 'Content-Type': 'application/json' },
      body:    JSON.stringify({ message: {}, comment: body }),
    });
  }

  async markRead(messageId: string): Promise<void> {
    await fetch(`${GRAPH}/me/messages/${messageId}`, {
      method:  'PATCH',
      headers: { ...this.h(), 'Content-Type': 'application/json' },
      body:    JSON.stringify({ isRead: true }),
    });
  }

  // 2026-10-07: descarga el binario de un attachment vía Graph API.
  // Caso real OC 6203: Nami invocó inv_procesar_oc_qb pero devolvió "items es
  // requerido" porque el PDF llegó como metadata sin content. attachment-reader
  // (processIncomingAttachments) early-return cuando connector.fetchAttachment
  // está undefined. Sin este método, Nami nunca puede extraer datos de PDFs.
  // Endpoint Graph: GET /me/messages/{id}/attachments/{attId}/$value → raw bytes.
  async fetchAttachment(messageId: string, attachmentId: string): Promise<Buffer | null> {
    try {
      const url = `${GRAPH}/me/messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(attachmentId)}/$value`;
      const res = await fetch(url, { headers: this.h() });
      if (!res.ok) {
        await this.triggerAuthErrorIfNeeded(res, 'fetchAttachment');
        console.warn('[microsoft/fetchAttachment] non-ok:', res.status, messageId, attachmentId);
        return null;
      }
      const buf = await res.arrayBuffer();
      return Buffer.from(buf);
    } catch (err) {
      console.error('[microsoft/fetchAttachment] error:', err);
      return null;
    }
  }
}

// ── Files ─────────────────────────────────────────────────────────────────────

class MicrosoftFiles implements FilesConnector {
  constructor(private tok: string) {}

  private h(): Record<string, string> {
    return { Authorization: `Bearer ${this.tok}` };
  }

  async search(query: string): Promise<FileItem[]> {
    const res = await fetch(
      `${GRAPH}/me/drive/search(q='${encodeURIComponent(query)}')?$select=id,name,file,folder&$top=10`,
      { headers: this.h() },
    );
    if (!res.ok) return [];
    const data = await res.json();
    return ((data.value ?? []) as any[]).map(f => ({
      id:       f.id,
      name:     f.name,
      mimeType: f.file?.mimeType ?? (f.folder ? 'folder' : 'application/octet-stream'),
      isFolder: !!f.folder,
    }));
  }

  async read(fileId: string, mimeType: string): Promise<string> {
    const res = await fetch(`${GRAPH}/me/drive/items/${fileId}/content`, { headers: this.h() });
    if (!res.ok) return '';
    const contentType = mimeType || res.headers.get('content-type') || '';
    if (contentType.startsWith('text/') || contentType.includes('json')) return res.text();
    const buf = Buffer.from(await res.arrayBuffer());
    return parseFileToText(buf, contentType);
  }

  async download(fileId: string, mimeType: string): Promise<{ buffer: Buffer; contentType: string } | null> {
    const res = await fetch(`${GRAPH}/me/drive/items/${fileId}/content`, { headers: this.h() });
    if (!res.ok) return null;
    const contentType = res.headers.get('content-type') ?? mimeType;
    return { buffer: Buffer.from(await res.arrayBuffer()), contentType };
  }

  async upload(filename: string, content: Buffer, mimeType: string, folder?: string): Promise<UploadResult | null> {
    const path = folder
      ? `${folder.replace(/^\/+|\/+$/g, '')}/${filename}`
      : filename;
    const encodedPath = path.split('/').map(encodeURIComponent).join('/');
    const res = await fetch(
      `${GRAPH}/me/drive/root:/${encodedPath}:/content?@microsoft.graph.conflictBehavior=rename`,
      {
        method:  'PUT',
        headers: { ...this.h(), 'Content-Type': mimeType },
        body:    content as unknown as BodyInit,
      },
    );
    if (!res.ok) {
      const err = await res.text();
      if (res.status === 403) return null;
      throw new Error(`OneDrive upload failed (${res.status}): ${err}`);
    }
    const data = await res.json() as { id: string; name: string; webUrl: string };
    return { id: data.id, name: data.name, link: data.webUrl };
  }

  async list(folderId?: string): Promise<FileItem[]> {
    const endpoint = folderId
      ? `${GRAPH}/me/drive/items/${folderId}/children`
      : `${GRAPH}/me/drive/root/children`;
    const res = await fetch(
      `${endpoint}?$select=id,name,file,folder&$top=100&$orderby=name`,
      { headers: this.h() },
    );
    if (!res.ok) return [];
    const data = await res.json();
    return ((data.value ?? []) as any[]).map(f => ({
      id:       f.id,
      name:     f.name,
      mimeType: f.file?.mimeType ?? (f.folder ? 'folder' : 'application/octet-stream'),
      isFolder: !!f.folder,
    }));
  }

  async move(fileId: string, destination: string): Promise<boolean> {
    const folderId = await this.findOrCreateFolder(destination);
    if (!folderId) return false;
    const res = await fetch(`${GRAPH}/me/drive/items/${fileId}`, {
      method:  'PATCH',
      headers: { ...this.h(), 'Content-Type': 'application/json' },
      body:    JSON.stringify({ parentReference: { id: folderId } }),
    });
    return res.ok;
  }

  async rename(fileId: string, newName: string): Promise<boolean> {
    const res = await fetch(`${GRAPH}/me/drive/items/${fileId}`, {
      method:  'PATCH',
      headers: { ...this.h(), 'Content-Type': 'application/json' },
      body:    JSON.stringify({ name: newName }),
    });
    return res.ok;
  }

  async createFolder(name: string): Promise<FolderResult | null> {
    const res = await fetch(`${GRAPH}/me/drive/root/children`, {
      method:  'POST',
      headers: { ...this.h(), 'Content-Type': 'application/json' },
      body:    JSON.stringify({ name, folder: {}, '@microsoft.graph.conflictBehavior': 'rename' }),
    });
    if (!res.ok) return null;
    const data = await res.json() as { id: string; name: string };
    return { id: data.id, name: data.name };
  }

  private async findOrCreateFolder(name: string): Promise<string | null> {
    const searchRes = await fetch(
      `${GRAPH}/me/drive/root/children?$filter=name eq '${encodeURIComponent(name)}' and folder ne null&$select=id`,
      { headers: this.h() },
    );
    if (searchRes.ok) {
      const data = await searchRes.json();
      if (data.value?.[0]?.id) return data.value[0].id as string;
    }
    const createRes = await fetch(`${GRAPH}/me/drive/root/children`, {
      method:  'POST',
      headers: { ...this.h(), 'Content-Type': 'application/json' },
      body:    JSON.stringify({ name, folder: {}, '@microsoft.graph.conflictBehavior': 'rename' }),
    });
    if (!createRes.ok) return null;
    const folder = await createRes.json();
    return folder.id as string;
  }
}

// ── Calendar ──────────────────────────────────────────────────────────────────

class MicrosoftCalendar implements CalendarConnector {
  constructor(private tok: string) {}

  private h(): Record<string, string> {
    return { Authorization: `Bearer ${this.tok}` };
  }

  async listEvents(from: Date, to: Date): Promise<CalendarEvent[]> {
    const params = new URLSearchParams({
      startDateTime: from.toISOString(),
      endDateTime:   to.toISOString(),
      $select:       'id,subject,start,end,location,bodyPreview,attendees',
      $top:          '20',
      $orderby:      'start/dateTime',
    });
    const res = await fetch(`${GRAPH}/me/calendarView?${params}`, { headers: this.h() });
    if (!res.ok) return [];
    const data = await res.json();
    return ((data.value ?? []) as any[]).map(e => ({
      id:          e.id,
      title:       e.subject ?? '(Sin título)',
      start:       e.start?.dateTime ?? '',
      end:         e.end?.dateTime   ?? '',
      location:    e.location?.displayName,
      description: e.bodyPreview,
      attendees:   ((e.attendees ?? []) as { emailAddress: { address: string } }[]).map(a => a.emailAddress.address),
    }));
  }

  async createEvent(input: CreateEventInput): Promise<CalendarEvent | null> {
    const body: Record<string, unknown> = {
      subject: input.title,
      start:   { dateTime: input.start, timeZone: 'America/Monterrey' },
      end:     { dateTime: input.end,   timeZone: 'America/Monterrey' },
    };
    if (input.description) body.body      = { contentType: 'Text', content: input.description };
    if (input.location)    body.location  = { displayName: input.location };
    if (input.attendees?.length) {
      body.attendees = input.attendees.map(email => ({
        emailAddress: { address: email },
        type: 'required',
      }));
    }
    const res = await fetch(`${GRAPH}/me/events`, {
      method:  'POST',
      headers: { ...this.h(), 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
    });
    if (!res.ok) return null;
    const e = await res.json();
    return {
      id:          e.id,
      title:       e.subject ?? input.title,
      start:       e.start?.dateTime ?? input.start,
      end:         e.end?.dateTime   ?? input.end,
      location:    e.location?.displayName,
      description: input.description,
      attendees:   input.attendees ?? [],
    };
  }

  async deleteEvent(eventId: string): Promise<boolean> {
    const res = await fetch(`${GRAPH}/me/events/${eventId}`, {
      method:  'DELETE',
      headers: this.h(),
    });
    return res.ok || res.status === 204;
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

// ── Factory ───────────────────────────────────────────────────────────────────

export function createMicrosoftConnector(accessToken: string, onAuthError?: MicrosoftAuthErrorCallback): Connector {
  return {
    provider: 'microsoft',
    email:    new MicrosoftEmail(accessToken, onAuthError),
    files:    new MicrosoftFiles(accessToken),
    calendar: new MicrosoftCalendar(accessToken),
  };
}
