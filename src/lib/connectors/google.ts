import type { Connector, EmailConnector, FilesConnector, EmailMessage, FileItem, Attachment, UploadResult, FolderResult, ReplyParams } from './types';

const GMAIL = 'https://www.googleapis.com/gmail/v1/users/me';
const DRIVE = 'https://www.googleapis.com/drive/v3';

// ── Email ─────────────────────────────────────────────────────────────────────

class GoogleEmail implements EmailConnector {
  constructor(private tok: string) {}

  private h(): Record<string, string> {
    return { Authorization: `Bearer ${this.tok}` };
  }

  async fetchUnread(since: Date): Promise<EmailMessage[]> {
    const after = Math.floor(since.getTime() / 1000);
    const query = `in:inbox is:unread after:${after}`;
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
    };
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

  async send(to: string, subject: string, body: string, attachment?: Attachment): Promise<void> {
    let raw: string;
    if (attachment) {
      const boundary = `centinelia_${Date.now()}`;
      raw = [
        'MIME-Version: 1.0',
        `To: ${to}`,
        `Subject: ${subject}`,
        `Content-Type: multipart/mixed; boundary="${boundary}"`,
        '',
        `--${boundary}`,
        'Content-Type: text/plain; charset=utf-8',
        '',
        body,
        '',
        `--${boundary}`,
        `Content-Type: ${attachment.mimeType}`,
        `Content-Disposition: attachment; filename="${attachment.filename}"`,
        'Content-Transfer-Encoding: base64',
        '',
        attachment.content.toString('base64'),
        '',
        `--${boundary}--`,
      ].join('\r\n');
    } else {
      raw = [`To: ${to}`, `Subject: ${subject}`, 'Content-Type: text/plain; charset=utf-8', '', body].join('\r\n');
    }
    await fetch(`${GMAIL}/messages/send`, {
      method:  'POST',
      headers: { ...this.h(), 'Content-Type': 'application/json' },
      body:    JSON.stringify({ raw: Buffer.from(raw).toString('base64url') }),
    });
  }

  async sendReply({ messageId, threadId, to = '', subject = '', body }: ReplyParams): Promise<void> {
    const replySubject = subject.startsWith('Re:') ? subject : `Re: ${subject}`;
    const refId = threadId ?? messageId;
    const raw = [
      `To: ${to}`,
      `Subject: ${replySubject}`,
      `In-Reply-To: ${refId}`,
      `References: ${refId}`,
      'Content-Type: text/plain; charset=utf-8',
      '',
      body,
    ].join('\r\n');
    await fetch(`${GMAIL}/messages/send`, {
      method:  'POST',
      headers: { ...this.h(), 'Content-Type': 'application/json' },
      body:    JSON.stringify({ raw: Buffer.from(raw).toString('base64url'), threadId: threadId ?? undefined }),
    });
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
    const q = encodeURIComponent(`name contains '${query.replace(/'/g, "\\'")}'`);
    const res = await fetch(
      `${DRIVE}/files?q=${q}&fields=files(id,name,mimeType)&pageSize=10`,
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

  async read(fileId: string, mimeType: string): Promise<string> {
    let url: string;
    if (mimeType === 'application/vnd.google-apps.document') {
      url = `${DRIVE}/files/${fileId}/export?mimeType=text/plain`;
    } else if (mimeType === 'application/vnd.google-apps.spreadsheet') {
      url = `${DRIVE}/files/${fileId}/export?mimeType=text/csv`;
    } else {
      url = `${DRIVE}/files/${fileId}?alt=media`;
    }
    const res = await fetch(url, { headers: this.h() });
    if (!res.ok) return '';
    return res.text();
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

// ── Factory ───────────────────────────────────────────────────────────────────

export function createGoogleConnector(accessToken: string): Connector {
  return {
    provider: 'google',
    email:    new GoogleEmail(accessToken),
    files:    new GoogleFiles(accessToken),
  };
}
