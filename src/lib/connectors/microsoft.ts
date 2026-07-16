import type { Connector, EmailConnector, FilesConnector, CalendarConnector, CalendarEvent, CreateEventInput, EmailMessage, FileItem, Attachment, UploadResult, FolderResult, ReplyParams } from './types';

const GRAPH = 'https://graph.microsoft.com/v1.0';

// ── Email ─────────────────────────────────────────────────────────────────────

class MicrosoftEmail implements EmailConnector {
  constructor(private tok: string) {}

  private h(): Record<string, string> {
    return { Authorization: `Bearer ${this.tok}` };
  }

  async fetchUnread(since: Date): Promise<EmailMessage[]> {
    const filter = `isRead eq false and receivedDateTime gt ${since.toISOString()}`;
    const select = 'id,subject,from,body,receivedDateTime';
    const url    = `${GRAPH}/me/mailFolders/inbox/messages?$filter=${encodeURIComponent(filter)}&$select=${select}&$top=20&$orderby=receivedDateTime desc`;
    const res = await fetch(url, { headers: this.h() });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.value ?? []).map((m: {
      id: string;
      from: { emailAddress: { address: string; name: string } };
      subject: string;
      body: { content: string };
    }) => ({
      id:      m.id,
      from:    `${m.from?.emailAddress?.name ?? ''} <${m.from?.emailAddress?.address ?? ''}>`,
      subject: m.subject ?? '',
      body:    stripHtml(m.body?.content ?? ''),
    }));
  }

  async send(to: string, subject: string, body: string, attachment?: Attachment): Promise<void> {
    const message: Record<string, unknown> = {
      subject,
      body:         { contentType: 'Text', content: body },
      toRecipients: [{ emailAddress: { address: to } }],
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

  async sendReply({ messageId, body }: ReplyParams): Promise<void> {
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

  async read(fileId: string): Promise<string> {
    const res = await fetch(`${GRAPH}/me/drive/items/${fileId}/content`, { headers: this.h() });
    if (!res.ok) return '';
    const contentType = res.headers.get('content-type') ?? '';
    if (contentType.includes('text') || contentType.includes('json')) return res.text();
    return '[Archivo binario — no se puede leer como texto]';
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

export function createMicrosoftConnector(accessToken: string): Connector {
  return {
    provider: 'microsoft',
    email:    new MicrosoftEmail(accessToken),
    files:    new MicrosoftFiles(accessToken),
    calendar: new MicrosoftCalendar(accessToken),
  };
}
