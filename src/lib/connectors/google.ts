import type { Connector, EmailConnector, FilesConnector, ContactsConnector, CalendarConnector, CalendarEvent, CreateEventInput, ContactResult, EmailMessage, FileItem, Attachment, UploadResult, FolderResult, ReplyParams } from './types';
import { parseFileToText } from './parse';

const GMAIL     = 'https://www.googleapis.com/gmail/v1/users/me';
const DRIVE     = 'https://www.googleapis.com/drive/v3';
const GCAL      = 'https://www.googleapis.com/calendar/v3';

// RFC 2047 encoding para headers con caracteres non-ASCII (acentos, em-dashes, etc.).
// Sin esto los receivers muestran mojibake: "Cotización" → "CotizaciÃƒÂ³n".
function encodeHeaderRFC2047(value: string): string {
  if (/^[\x00-\x7F]*$/.test(value)) return value; // ASCII puro, no encoding
  return `=?UTF-8?B?${Buffer.from(value, 'utf-8').toString('base64')}?=`;
}

// ── Email ─────────────────────────────────────────────────────────────────────

class GoogleEmail implements EmailConnector {
  constructor(private tok: string) {}

  private h(): Record<string, string> {
    return { Authorization: `Bearer ${this.tok}` };
  }

  async fetchUnread(since: Date, folder: 'inbox' | 'spam' = 'inbox'): Promise<EmailMessage[]> {
    const after   = Math.floor(since.getTime() / 1000);
    const labelId = folder === 'spam' ? 'SPAM' : 'INBOX';
    const query   = `label:${labelId} is:unread after:${after}`;
    const res = await fetch(
      `${GMAIL}/messages?q=${encodeURIComponent(query)}&maxResults=20`,
      { headers: this.h() },
    );
    if (!res.ok) return [];
    const list = await res.json();
    const ids: string[] = (list.messages ?? []).map((m: { id: string }) => m.id);
    if (!ids.length) return [];
    const msgs = await Promise.all(ids.map(id => this.getMessage(id)));
    return msgs.filter(Boolean) as EmailMessage[];
  }

  async unmarkSpam(messageId: string): Promise<void> {
    await fetch(`${GMAIL}/messages/${messageId}/modify`, {
      method:  'POST',
      headers: { ...this.h(), 'Content-Type': 'application/json' },
      body:    JSON.stringify({ removeLabelIds: ['SPAM'], addLabelIds: ['INBOX'] }),
    });
  }

  // Public helper para dev / re-processing endpoints — fetch by id (bypassa filtro is:unread).
  async getMessageById(id: string): Promise<EmailMessage | null> {
    return this.getMessage(id);
  }

  private async getMessage(id: string): Promise<EmailMessage | null> {
    const res = await fetch(`${GMAIL}/messages/${id}?format=full`, { headers: this.h() });
    if (!res.ok) return null;
    const msg = await res.json();
    const headers: Record<string, string> = {};
    for (const h of msg.payload?.headers ?? []) headers[h.name.toLowerCase()] = h.value;
    return {
      id,
      threadId: msg.threadId,
      from:     headers['from'] ?? '',
      subject:  headers['subject'] ?? '',
      body:     this.extractBody(msg.payload),
      attachments: this.extractAttachments(msg.payload),
    };
  }

  private extractAttachments(payload: Record<string, unknown> | undefined, out: Array<{ id: string; name: string; mimeType: string; size: number }> = []): Array<{ id: string; name: string; mimeType: string; size: number }> {
    if (!payload) return out;
    const body = payload.body as { attachmentId?: string; size?: number } | undefined;
    const filename = payload.filename as string | undefined;
    if (body?.attachmentId && filename) {
      out.push({
        id:       body.attachmentId,
        name:     filename,
        mimeType: (payload.mimeType as string) ?? 'application/octet-stream',
        size:     body.size ?? 0,
      });
    }
    for (const part of (payload.parts as Record<string, unknown>[] ?? [])) {
      this.extractAttachments(part, out);
    }
    return out;
  }

  async fetchAttachment(messageId: string, attachmentId: string): Promise<Buffer | null> {
    const res = await fetch(`${GMAIL}/messages/${messageId}/attachments/${attachmentId}`, { headers: this.h() });
    if (!res.ok) return null;
    const data = await res.json();
    const b64: string = (data.data as string) ?? '';
    if (!b64) return null;
    // Gmail uses URL-safe base64 without padding — normalize before decode
    const normalized = b64.replace(/-/g, '+').replace(/_/g, '/').padEnd(b64.length + (4 - b64.length % 4) % 4, '=');
    return Buffer.from(normalized, 'base64');
  }

  private extractBody(payload: Record<string, unknown>): string {
    if (!payload) return '';
    if (payload.body && (payload.body as { size: number }).size > 0) {
      const data = (payload.body as { data?: string }).data ?? '';
      return Buffer.from(data, 'base64').toString('utf-8');
    }
    for (const part of (payload.parts as Record<string, unknown>[] ?? [])) {
      if (part.mimeType === 'text/plain') {
        const data = (part.body as { data?: string } | undefined)?.data ?? '';
        return Buffer.from(data, 'base64').toString('utf-8');
      }
    }
    for (const part of (payload.parts as Record<string, unknown>[] ?? [])) {
      const text = this.extractBody(part as Record<string, unknown>);
      if (text) return text;
    }
    return '';
  }

  async send(to: string, subject: string, body: string, attachment?: Attachment, fromEmail?: string, htmlBody?: string): Promise<void> {
    const encodedSubject = encodeHeaderRFC2047(subject);
    let raw: string;
    if (attachment) {
      const outer = `mixed_${Date.now()}`;
      const alt   = `alt_${Date.now()}`;
      const altPart = htmlBody
        ? [
            `Content-Type: multipart/alternative; boundary="${alt}"`, '',
            `--${alt}`, 'Content-Type: text/plain; charset=utf-8', '', body, '',
            `--${alt}`, 'Content-Type: text/html; charset=utf-8', '', htmlBody, '',
            `--${alt}--`,
          ]
        : ['Content-Type: text/plain; charset=utf-8', '', body];
      raw = [
        'MIME-Version: 1.0',
        `To: ${to}`,
        ...(fromEmail ? [`From: ${fromEmail}`] : []),
        `Subject: ${encodedSubject}`,
        `Content-Type: multipart/mixed; boundary="${outer}"`,
        '',
        `--${outer}`,
        ...altPart,
        '',
        `--${outer}`,
        `Content-Type: ${attachment.mimeType}`,
        `Content-Disposition: attachment; filename="${attachment.filename}"`,
        'Content-Transfer-Encoding: base64',
        '',
        attachment.content.toString('base64'),
        '',
        `--${outer}--`,
      ].join('\r\n');
    } else if (htmlBody) {
      const alt = `alt_${Date.now()}`;
      raw = [
        'MIME-Version: 1.0',
        `To: ${to}`,
        ...(fromEmail ? [`From: ${fromEmail}`] : []),
        `Subject: ${encodedSubject}`,
        `Content-Type: multipart/alternative; boundary="${alt}"`,
        '',
        `--${alt}`, 'Content-Type: text/plain; charset=utf-8', '', body, '',
        `--${alt}`, 'Content-Type: text/html; charset=utf-8', '', htmlBody, '',
        `--${alt}--`,
      ].join('\r\n');
    } else {
      const headers = [`To: ${to}`, ...(fromEmail ? [`From: ${fromEmail}`] : []), `Subject: ${encodedSubject}`, 'Content-Type: text/plain; charset=utf-8'];
      raw = [...headers, '', body].join('\r\n');
    }
    await fetch(`${GMAIL}/messages/send`, {
      method:  'POST',
      headers: { ...this.h(), 'Content-Type': 'application/json' },
      body:    JSON.stringify({ raw: Buffer.from(raw).toString('base64url') }),
    });
  }

  private async getAuthenticatedEmail(): Promise<string | null> {
    try {
      const res = await fetch(`${GMAIL}/profile`, { headers: this.h() });
      if (!res.ok) return null;
      const data = await res.json();
      return (data.emailAddress as string | undefined) ?? null;
    } catch { return null; }
  }

  async sendReply({ messageId, threadId, to = '', subject = '', body, fromDisplay }: ReplyParams): Promise<void> {
    const replySubject = subject.startsWith('Re:') ? subject : `Re: ${subject}`;
    const encodedSubject = encodeHeaderRFC2047(replySubject);
    // From con display name: "Noah - Pneuma Studio <cuenta@gmail.com>". Gmail
    // acepta cambios de nombre visible pero la dirección debe ser la cuenta
    // autenticada. Si no podemos obtener el email autenticado, omitimos From.
    let fromHeader: string | null = null;
    if (fromDisplay?.trim()) {
      const authEmail = await this.getAuthenticatedEmail();
      if (authEmail) fromHeader = `${encodeHeaderRFC2047(fromDisplay.trim())} <${authEmail}>`;
    }
    // In-Reply-To/References requieren el Message-ID RFC 5322 (formato
    // <xxx@dominio>) del correo original, NO el Gmail internal id. Obtenemos
    // el header Message-Id del mensaje original vía API antes de responder,
    // y si falla omitimos ambos headers. El threading en Gmail se mantiene
    // por el threadId en el JSON body, no por estos headers.
    let refHeaders: string[] = [];
    if (messageId) {
      try {
        const msgRes = await fetch(`${GMAIL}/messages/${messageId}?format=metadata&metadataHeaders=Message-Id`, { headers: this.h() });
        if (msgRes.ok) {
          const msgJson = await msgRes.json();
          const headers: Array<{ name: string; value: string }> = msgJson.payload?.headers ?? [];
          const rfcMsgId = headers.find(h => h.name.toLowerCase() === 'message-id')?.value;
          if (rfcMsgId) refHeaders = [`In-Reply-To: ${rfcMsgId}`, `References: ${rfcMsgId}`];
        }
      } catch { /* omit headers on failure — threadId alone still threads in Gmail */ }
    }
    const raw = [
      `To: ${to}`,
      ...(fromHeader ? [`From: ${fromHeader}`] : []),
      `Subject: ${encodedSubject}`,
      ...refHeaders,
      'Content-Type: text/plain; charset=utf-8',
      '',
      body,
    ].join('\r\n');
    const sendRes = await fetch(`${GMAIL}/messages/send`, {
      method:  'POST',
      headers: { ...this.h(), 'Content-Type': 'application/json' },
      body:    JSON.stringify({ raw: Buffer.from(raw).toString('base64url'), threadId: threadId ?? undefined }),
    });
    if (sendRes.ok) return;

    // Cross-account fallback: si el threadId original vive en la cuenta org
    // (nazre@) pero el sender es per-agent (verdantis@), Gmail devuelve 404
    // porque el thread no existe en la cuenta autenticada. Reintenta sin
    // threadId — el cliente recibe el correo en un hilo nuevo con el mismo
    // subject "Re: ...", que es aceptable UX.
    if (sendRes.status === 404 && threadId) {
      const retryRes = await fetch(`${GMAIL}/messages/send`, {
        method:  'POST',
        headers: { ...this.h(), 'Content-Type': 'application/json' },
        body:    JSON.stringify({ raw: Buffer.from(raw).toString('base64url') }),
      });
      if (retryRes.ok) return;
      const retryErr = await retryRes.text().catch(() => '');
      throw new Error(`Gmail sendReply retry (no thread) failed: ${retryRes.status} ${retryErr.slice(0, 500)}`);
    }

    const errText = await sendRes.text().catch(() => '');
    throw new Error(`Gmail sendReply failed: ${sendRes.status} ${errText.slice(0, 500)}`);
  }

  async markRead(messageId: string): Promise<void> {
    await fetch(`${GMAIL}/messages/${messageId}/modify`, {
      method:  'POST',
      headers: { ...this.h(), 'Content-Type': 'application/json' },
      body:    JSON.stringify({ removeLabelIds: ['UNREAD'] }),
    });
  }
}

// ── Files ─────────────────────────────────────────────────────────────────────

class GoogleFiles implements FilesConnector {
  constructor(private tok: string) {}

  private h(): Record<string, string> {
    return { Authorization: `Bearer ${this.tok}` };
  }

  async search(query: string): Promise<FileItem[]> {
    const safe = query.replace(/'/g, "\\'");
    // Search both filename and full-text content, exclude trashed files. Drive returns dedupe.
    const q = encodeURIComponent(`(name contains '${safe}' or fullText contains '${safe}') and trashed = false`);
    const url = `${DRIVE}/files?q=${q}&fields=files(id,name,mimeType)&pageSize=15&orderBy=modifiedTime desc`;
    const res = await fetch(url, { headers: this.h() });
    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      console.error('[drive.search] FAIL q="' + query + '" status=' + res.status + ' body=' + errText.slice(0, 300));
      return [];
    }
    const data = await res.json();
    const count = (data.files ?? []).length;
    console.log('[drive.search] q="' + query + '" ok status=' + res.status + ' files=' + count);
    return ((data.files ?? []) as { id: string; name: string; mimeType: string }[]).map(f => ({
      id:       f.id,
      name:     f.name,
      mimeType: f.mimeType,
      isFolder: f.mimeType === 'application/vnd.google-apps.folder',
    }));
  }

  async read(fileId: string, mimeType: string): Promise<string> {
    // Native Google formats: use Drive export → plaintext
    if (mimeType === 'application/vnd.google-apps.document' || mimeType === 'application/vnd.google-apps.presentation') {
      const res = await fetch(`${DRIVE}/files/${fileId}/export?mimeType=text/plain`, { headers: this.h() });
      return res.ok ? res.text() : '';
    }
    if (mimeType === 'application/vnd.google-apps.spreadsheet') {
      const res = await fetch(`${DRIVE}/files/${fileId}/export?mimeType=text/csv`, { headers: this.h() });
      return res.ok ? res.text() : '';
    }
    // Uploaded files (.docx/.xlsx/.pdf/etc): download bytes and parse locally
    const res = await fetch(`${DRIVE}/files/${fileId}?alt=media`, { headers: this.h() });
    if (!res.ok) return '';
    const buf = Buffer.from(await res.arrayBuffer());
    return parseFileToText(buf, mimeType);
  }

  async download(fileId: string, mimeType: string): Promise<{ buffer: Buffer; contentType: string } | null> {
    let url: string;
    let contentType: string;
    if (mimeType === 'application/vnd.google-apps.document') {
      url = `${DRIVE}/files/${fileId}/export?mimeType=application/pdf`;
      contentType = 'application/pdf';
    } else if (mimeType === 'application/vnd.google-apps.spreadsheet') {
      url = `${DRIVE}/files/${fileId}/export?mimeType=application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`;
      contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    } else if (mimeType === 'application/vnd.google-apps.presentation') {
      url = `${DRIVE}/files/${fileId}/export?mimeType=application/vnd.openxmlformats-officedocument.presentationml.presentation`;
      contentType = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
    } else {
      url = `${DRIVE}/files/${fileId}?alt=media`;
      contentType = mimeType;
    }
    const res = await fetch(url, { headers: this.h() });
    if (!res.ok) return null;
    return { buffer: Buffer.from(await res.arrayBuffer()), contentType };
  }

  async upload(filename: string, content: Buffer, mimeType: string, folder?: string): Promise<UploadResult | null> {
    const metadata: Record<string, unknown> = { name: filename };
    if (folder) {
      const folderId = await this.findOrCreateFolder(folder);
      metadata.parents = [folderId];
    }
    const boundary = `drive_upload_${Date.now()}`;
    const body = Buffer.concat([
      Buffer.from(
        `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
        JSON.stringify(metadata) + `\r\n--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`,
      ),
      content,
      Buffer.from(`\r\n--${boundary}--`),
    ]);
    const res = await fetch(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink',
      {
        method:  'POST',
        headers: { ...this.h(), 'Content-Type': `multipart/related; boundary="${boundary}"` },
        body,
      },
    );
    if (!res.ok) {
      const err = await res.text();
      if (res.status === 403 && err.includes('insufficientPermissions')) return null;
      throw new Error(`Drive upload failed (${res.status}): ${err}`);
    }
    const data = await res.json() as { id: string; name: string; webViewLink: string };
    return { id: data.id, name: data.name, link: data.webViewLink };
  }

  async list(folderId?: string): Promise<FileItem[]> {
    const parent = folderId ? `'${folderId}'` : "'root'";
    const q = encodeURIComponent(`${parent} in parents and trashed=false`);
    const res = await fetch(
      `${DRIVE}/files?q=${q}&fields=files(id,name,mimeType)&pageSize=100&orderBy=folder,name`,
      { headers: this.h() },
    );
    if (!res.ok) return [];
    const data = await res.json();
    return ((data.files ?? []) as { id: string; name: string; mimeType: string }[]).map(f => ({
      id:       f.id,
      name:     f.name,
      mimeType: f.mimeType,
      isFolder: f.mimeType === 'application/vnd.google-apps.folder',
    }));
  }

  async move(fileId: string, destination: string): Promise<boolean> {
    const metaRes = await fetch(`${DRIVE}/files/${fileId}?fields=parents`, { headers: this.h() });
    if (!metaRes.ok) return false;
    const meta = await metaRes.json();
    const currentParents = ((meta.parents ?? []) as string[]).join(',');
    const folderId = await this.findOrCreateFolder(destination);
    const res = await fetch(
      `${DRIVE}/files/${fileId}?addParents=${folderId}&removeParents=${currentParents}&fields=id`,
      {
        method:  'PATCH',
        headers: { ...this.h(), 'Content-Type': 'application/json' },
        body:    JSON.stringify({}),
      },
    );
    return res.ok;
  }

  async rename(fileId: string, newName: string): Promise<boolean> {
    const res = await fetch(`${DRIVE}/files/${fileId}?fields=id`, {
      method:  'PATCH',
      headers: { ...this.h(), 'Content-Type': 'application/json' },
      body:    JSON.stringify({ name: newName }),
    });
    return res.ok;
  }

  async createFolder(name: string): Promise<FolderResult | null> {
    const res = await fetch(`${DRIVE}/files?fields=id,name`, {
      method:  'POST',
      headers: { ...this.h(), 'Content-Type': 'application/json' },
      body:    JSON.stringify({ name, mimeType: 'application/vnd.google-apps.folder' }),
    });
    if (!res.ok) return null;
    const data = await res.json() as { id: string; name: string };
    return { id: data.id, name: data.name };
  }

  private async findOrCreateFolder(name: string): Promise<string> {
    const q = encodeURIComponent(
      `name='${name.replace(/'/g, "\\'")}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    );
    const searchRes = await fetch(
      `${DRIVE}/files?q=${q}&fields=files(id)&pageSize=1`,
      { headers: this.h() },
    );
    if (searchRes.ok) {
      const data = await searchRes.json();
      if (data.files?.[0]?.id) return data.files[0].id as string;
    }
    const createRes = await fetch(`${DRIVE}/files`, {
      method:  'POST',
      headers: { ...this.h(), 'Content-Type': 'application/json' },
      body:    JSON.stringify({ name, mimeType: 'application/vnd.google-apps.folder' }),
    });
    const folder = await createRes.json();
    return folder.id as string;
  }
}

// ── Contacts ──────────────────────────────────────────────────────────────────

const PEOPLE_SEARCH = 'https://people.googleapis.com/v1/people:searchContacts';

class GoogleContacts implements ContactsConnector {
  constructor(private tok: string) {}

  private h(): Record<string, string> {
    return { Authorization: `Bearer ${this.tok}` };
  }

  async search(query: string): Promise<ContactResult[]> {
    const params = new URLSearchParams({
      query,
      readMask: 'names,emailAddresses,phoneNumbers',
      pageSize: '10',
    });
    const res = await fetch(`${PEOPLE_SEARCH}?${params}`, { headers: this.h() });
    if (!res.ok) return [];
    const data = await res.json();
    return ((data.results ?? []) as Array<{ person?: Record<string, unknown> }>).map(r => {
      const p = r.person ?? {};
      return {
        name:  (p.names as Array<{ displayName?: string }> | undefined)?.[0]?.displayName ?? '',
        email: (p.emailAddresses as Array<{ value?: string }> | undefined)?.[0]?.value ?? null,
        phone: (p.phoneNumbers as Array<{ value?: string }> | undefined)?.[0]?.value ?? null,
      };
    });
  }

  async getByPhone(phone: string): Promise<ContactResult | null> {
    const results = await this.search(phone);
    return results[0] ?? null;
  }
}

// ── Calendar ──────────────────────────────────────────────────────────────────

class GoogleCalendar implements CalendarConnector {
  constructor(private tok: string) {}

  private h(): Record<string, string> {
    return { Authorization: `Bearer ${this.tok}` };
  }

  async listEvents(from: Date, to: Date): Promise<CalendarEvent[]> {
    const params = new URLSearchParams({
      timeMin:      from.toISOString(),
      timeMax:      to.toISOString(),
      singleEvents: 'true',
      orderBy:      'startTime',
      maxResults:   '20',
    });
    const res = await fetch(`${GCAL}/calendars/primary/events?${params}`, { headers: this.h() });
    if (!res.ok) return [];
    const data = await res.json();
    return ((data.items ?? []) as any[]).map(e => ({
      id:          e.id,
      title:       e.summary ?? '(Sin título)',
      start:       e.start?.dateTime ?? e.start?.date ?? '',
      end:         e.end?.dateTime   ?? e.end?.date   ?? '',
      location:    e.location,
      description: e.description,
      attendees:   ((e.attendees ?? []) as { email: string }[]).map(a => a.email),
    }));
  }

  async createEvent(input: CreateEventInput): Promise<CalendarEvent | null> {
    const body: Record<string, unknown> = {
      summary:     input.title,
      start:       { dateTime: input.start, timeZone: 'America/Monterrey' },
      end:         { dateTime: input.end,   timeZone: 'America/Monterrey' },
    };
    if (input.description) body.description = input.description;
    if (input.location)    body.location    = input.location;
    if (input.attendees?.length) {
      body.attendees = input.attendees.map(email => ({ email }));
    }
    // Auto-generar Meet link cuando se pida explícito o cuando location
    // mencione "meet"/"videollamada"/"zoom" y no traiga URL propia — Google
    // acepta conferenceData sólo con conferenceDataVersion=1 en el query.
    const wantsMeet = input.generate_meet_link === true
      || (typeof input.location === 'string' && /\b(meet|videollamada|zoom|remoto|virtual)\b/i.test(input.location) && !/https?:/i.test(input.location));
    if (wantsMeet) {
      body.conferenceData = {
        createRequest: {
          requestId: `meet-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          conferenceSolutionKey: { type: 'hangoutsMeet' },
        },
      };
    }
    // sendUpdates=all → Google envía email de invitación de Calendar a los
    // attendees. Ese email trae el botón "Unirse con Google Meet" que SÍ
    // materializa la sala aun en cuentas @gmail.com personales (donde el
    // link crudo del Meet muestra "verifica el código" si el invitado abre
    // antes que el host). Sin esto el attendee no recibe el invite y la única
    // ruta al Meet es el link crudo problemático.
    const params = new URLSearchParams();
    if (wantsMeet) params.set('conferenceDataVersion', '1');
    if (input.attendees?.length) params.set('sendUpdates', 'all');
    const qs = params.toString();
    const url = qs
      ? `${GCAL}/calendars/primary/events?${qs}`
      : `${GCAL}/calendars/primary/events`;
    const res = await fetch(url, {
      method:  'POST',
      headers: { ...this.h(), 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
    });
    if (!res.ok) return null;
    let e = await res.json();
    // conferenceData.createRequest es asíncrono: la primera respuesta puede
    // traer status.statusCode='pending' con un entryPoint provisional que aún
    // NO existe en Meet (Google devuelve "verifica el código" si el receptor
    // hace click antes de que se materialice). Chequeamos status y re-GET
    // hasta 3 veces con backoff corto. Si termina 'failure' o sigue pending,
    // devolvemos meet_link=undefined para que el meerkat sepa que falló y no
    // envíe un URL roto al cliente.
    if (wantsMeet && e?.conferenceData?.createRequest?.status?.statusCode !== 'success') {
      for (let attempt = 0; attempt < 3; attempt++) {
        await new Promise(r => setTimeout(r, 700 + attempt * 500));
        const check = await fetch(
          `${GCAL}/calendars/primary/events/${e.id}?conferenceDataVersion=1`,
          { headers: this.h() },
        );
        if (!check.ok) break;
        e = await check.json();
        const status = e?.conferenceData?.createRequest?.status?.statusCode as string | undefined;
        if (status === 'success') break;
        if (status === 'failure') break;
      }
    }
    const meetStatus = e?.conferenceData?.createRequest?.status?.statusCode as string | undefined;
    const rawMeetLink = e.conferenceData?.entryPoints?.find(
      (ep: { entryPointType?: string; uri?: string }) => ep.entryPointType === 'video'
    )?.uri as string | undefined;
    // Solo aceptamos el link si la conferencia fue creada exitosamente.
    // Si status es undefined pero el evento no pidió Meet, aceptamos el link
    // que venga (evento existente con Meet ya asociado). Cuando pedimos Meet
    // explícito exigimos statusCode='success'.
    const meetLink = wantsMeet
      ? (meetStatus === 'success' ? rawMeetLink : undefined)
      : rawMeetLink;
    return {
      id:          e.id,
      title:       e.summary ?? input.title,
      start:       e.start?.dateTime ?? input.start,
      end:         e.end?.dateTime   ?? input.end,
      location:    meetLink ?? e.location,
      description: e.description,
      attendees:   input.attendees ?? [],
      meet_link:   meetLink,
    };
  }

  async deleteEvent(eventId: string): Promise<boolean> {
    const res = await fetch(`${GCAL}/calendars/primary/events/${eventId}`, {
      method:  'DELETE',
      headers: this.h(),
    });
    return res.ok || res.status === 204;
  }
}

// ── Factory ───────────────────────────────────────────────────────────────────

export function createGoogleConnector(accessToken: string): Connector {
  return {
    provider: 'google',
    email:    new GoogleEmail(accessToken),
    files:    new GoogleFiles(accessToken),
    contacts: new GoogleContacts(accessToken),
    calendar: new GoogleCalendar(accessToken),
  };
}
