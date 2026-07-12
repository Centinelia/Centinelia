const GMAIL_AUTH_URL   = 'https://accounts.google.com/o/oauth2/v2/auth';
const GMAIL_TOKEN_URL  = 'https://oauth2.googleapis.com/token';
const GMAIL_SCOPES     = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/drive.readonly',
].join(' ');

export function gmailAuthUrl(state: string): string {
  const p = new URLSearchParams({
    client_id:     process.env.GOOGLE_CLIENT_ID!,
    redirect_uri:  callbackUrl('gmail'),
    response_type: 'code',
    scope:         GMAIL_SCOPES,
    access_type:   'offline',
    prompt:        'consent',
    state,
  });
  return `${GMAIL_AUTH_URL}?${p}`;
}

export async function gmailExchangeCode(code: string): Promise<{
  access_token: string; refresh_token: string; expires_in: number; email: string;
}> {
  const res = await fetch(GMAIL_TOKEN_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    new URLSearchParams({
      code,
      client_id:     process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri:  callbackUrl('gmail'),
      grant_type:    'authorization_code',
    }),
  });
  if (!res.ok) throw new Error(`Gmail token exchange failed: ${await res.text()}`);
  const data = await res.json();

  const profileRes = await fetch('https://www.googleapis.com/oauth2/v1/userinfo', {
    headers: { Authorization: `Bearer ${data.access_token}` },
  });
  const profile = await profileRes.json();

  return {
    access_token:  data.access_token,
    refresh_token: data.refresh_token,
    expires_in:    data.expires_in,
    email:         profile.email,
  };
}

export async function gmailRefreshToken(refresh_token: string): Promise<{ access_token: string; expires_in: number }> {
  const res = await fetch(GMAIL_TOKEN_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    new URLSearchParams({
      refresh_token,
      client_id:     process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      grant_type:    'refresh_token',
    }),
  });
  if (!res.ok) throw new Error(`Gmail refresh failed: ${await res.text()}`);
  const data = await res.json();
  return { access_token: data.access_token, expires_in: data.expires_in };
}

export async function gmailFetchUnread(
  accessToken: string,
  since: Date,
): Promise<GmailMessage[]> {
  const after = Math.floor(since.getTime() / 1000);
  const query = `in:inbox is:unread after:${after}`;
  const listRes = await fetch(
    `https://www.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(query)}&maxResults=20`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!listRes.ok) return [];
  const list = await listRes.json();
  const ids: string[] = (list.messages ?? []).map((m: { id: string }) => m.id);
  if (!ids.length) return [];

  const messages = await Promise.all(ids.map(id => gmailGetMessage(accessToken, id)));
  return messages.filter(Boolean) as GmailMessage[];
}

export interface GmailMessage {
  id:       string;
  threadId: string;
  from:     string;
  subject:  string;
  body:     string;
}

async function gmailGetMessage(accessToken: string, id: string): Promise<GmailMessage | null> {
  const res = await fetch(
    `https://www.googleapis.com/gmail/v1/users/me/messages/${id}?format=full`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!res.ok) return null;
  const msg = await res.json();

  const headers: Record<string, string> = {};
  for (const h of msg.payload?.headers ?? []) {
    headers[h.name.toLowerCase()] = h.value;
  }

  const body = extractGmailBody(msg.payload);
  return {
    id,
    threadId: msg.threadId,
    from:     headers['from'] ?? '',
    subject:  headers['subject'] ?? '',
    body,
  };
}

function extractGmailBody(payload: Record<string, unknown>): string {
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
    const text = extractGmailBody(part as Record<string, unknown>);
    if (text) return text;
  }
  return '';
}

export async function gmailSendReply(
  accessToken: string,
  threadId:    string,
  to:          string,
  subject:     string,
  body:        string,
): Promise<void> {
  const replySubject = subject.startsWith('Re:') ? subject : `Re: ${subject}`;
  const raw = [
    `To: ${to}`,
    `Subject: ${replySubject}`,
    `In-Reply-To: ${threadId}`,
    `References: ${threadId}`,
    'Content-Type: text/plain; charset=utf-8',
    '',
    body,
  ].join('\r\n');

  const encoded = Buffer.from(raw).toString('base64url');
  await fetch('https://www.googleapis.com/gmail/v1/users/me/messages/send', {
    method:  'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body:    JSON.stringify({ raw: encoded, threadId }),
  });
}

export async function gmailMarkRead(accessToken: string, messageId: string): Promise<void> {
  await fetch(`https://www.googleapis.com/gmail/v1/users/me/messages/${messageId}/modify`, {
    method:  'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body:    JSON.stringify({ removeLabelIds: ['UNREAD'] }),
  });
}

export async function gmailSendNew(
  accessToken: string,
  to:          string,
  subject:     string,
  body:        string,
  attachment?: { filename: string; content: Buffer; mimeType: string },
): Promise<void> {
  let raw: string;
  if (attachment) {
    const boundary = `centinelia_${Date.now()}`;
    raw = [
      `MIME-Version: 1.0`,
      `To: ${to}`,
      `Subject: ${subject}`,
      `Content-Type: multipart/mixed; boundary="${boundary}"`,
      ``,
      `--${boundary}`,
      `Content-Type: text/plain; charset=utf-8`,
      ``,
      body,
      ``,
      `--${boundary}`,
      `Content-Type: ${attachment.mimeType}`,
      `Content-Disposition: attachment; filename="${attachment.filename}"`,
      `Content-Transfer-Encoding: base64`,
      ``,
      attachment.content.toString('base64'),
      ``,
      `--${boundary}--`,
    ].join('\r\n');
  } else {
    raw = [`To: ${to}`, `Subject: ${subject}`, 'Content-Type: text/plain; charset=utf-8', '', body].join('\r\n');
  }
  await fetch('https://www.googleapis.com/gmail/v1/users/me/messages/send', {
    method:  'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body:    JSON.stringify({ raw: Buffer.from(raw).toString('base64url') }),
  });
}

export async function gmailDownloadDriveFile(
  accessToken: string,
  fileId:      string,
  mimeType:    string,
): Promise<{ buffer: Buffer; contentType: string } | null> {
  let url: string;
  let contentType: string;
  if (mimeType === 'application/vnd.google-apps.document') {
    url = `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=application/pdf`;
    contentType = 'application/pdf';
  } else if (mimeType === 'application/vnd.google-apps.spreadsheet') {
    url = `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`;
    contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  } else {
    url = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
    contentType = mimeType;
  }
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) return null;
  return { buffer: Buffer.from(await res.arrayBuffer()), contentType };
}

export interface DriveFile {
  id:       string;
  name:     string;
  mimeType: string;
}

export async function gmailSearchDriveFiles(accessToken: string, query: string): Promise<DriveFile[]> {
  const q = encodeURIComponent(`name contains '${query.replace(/'/g, "\\'")}'`);
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name,mimeType)&pageSize=10`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!res.ok) return [];
  const data = await res.json();
  return (data.files ?? []) as DriveFile[];
}

export async function gmailReadDriveFile(accessToken: string, fileId: string, mimeType: string): Promise<string> {
  let url: string;
  if (mimeType === 'application/vnd.google-apps.document') {
    url = `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=text/plain`;
  } else if (mimeType === 'application/vnd.google-apps.spreadsheet') {
    url = `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=text/csv`;
  } else {
    url = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
  }
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) return '';
  return res.text();
}

function callbackUrl(provider: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.centinelia.mx';
  return `${base}/api/auth/email-callback?provider=${provider}`;
}
