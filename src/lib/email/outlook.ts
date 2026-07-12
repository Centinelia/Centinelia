const GRAPH_BASE    = 'https://graph.microsoft.com/v1.0';
const TENANT        = 'common';
const AUTH_BASE     = `https://login.microsoftonline.com/${TENANT}/oauth2/v2.0`;
const OUTLOOK_SCOPES = 'Mail.Read Mail.Send Files.Read offline_access User.Read';

export function outlookAuthUrl(state: string): string {
  const p = new URLSearchParams({
    client_id:     process.env.MICROSOFT_CLIENT_ID!,
    response_type: 'code',
    redirect_uri:  callbackUrl('outlook'),
    scope:         OUTLOOK_SCOPES,
    response_mode: 'query',
    state,
  });
  return `${AUTH_BASE}/authorize?${p}`;
}

export async function outlookExchangeCode(code: string): Promise<{
  access_token: string; refresh_token: string; expires_in: number; email: string;
}> {
  const res = await fetch(`${AUTH_BASE}/token`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    new URLSearchParams({
      code,
      client_id:     process.env.MICROSOFT_CLIENT_ID!,
      client_secret: process.env.MICROSOFT_CLIENT_SECRET!,
      redirect_uri:  callbackUrl('outlook'),
      grant_type:    'authorization_code',
      scope:         OUTLOOK_SCOPES,
    }),
  });
  if (!res.ok) throw new Error(`Outlook token exchange failed: ${await res.text()}`);
  const data = await res.json();

  const profileRes = await fetch(`${GRAPH_BASE}/me`, {
    headers: { Authorization: `Bearer ${data.access_token}` },
  });
  const profile = await profileRes.json();

  return {
    access_token:  data.access_token,
    refresh_token: data.refresh_token,
    expires_in:    data.expires_in,
    email:         profile.mail ?? profile.userPrincipalName,
  };
}

export async function outlookRefreshToken(refresh_token: string): Promise<{ access_token: string; expires_in: number }> {
  const res = await fetch(`${AUTH_BASE}/token`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    new URLSearchParams({
      refresh_token,
      client_id:     process.env.MICROSOFT_CLIENT_ID!,
      client_secret: process.env.MICROSOFT_CLIENT_SECRET!,
      grant_type:    'refresh_token',
      scope:         OUTLOOK_SCOPES,
    }),
  });
  if (!res.ok) throw new Error(`Outlook refresh failed: ${await res.text()}`);
  const data = await res.json();
  return { access_token: data.access_token, expires_in: data.expires_in };
}

export interface OutlookMessage {
  id:       string;
  from:     string;
  subject:  string;
  body:     string;
}

export async function outlookFetchUnread(
  accessToken: string,
  since: Date,
): Promise<OutlookMessage[]> {
  const filter = `isRead eq false and receivedDateTime gt ${since.toISOString()}`;
  const select = 'id,subject,from,body,receivedDateTime';
  const url    = `${GRAPH_BASE}/me/mailFolders/inbox/messages?$filter=${encodeURIComponent(filter)}&$select=${select}&$top=20&$orderby=receivedDateTime desc`;

  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
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

export async function outlookSendReply(
  accessToken: string,
  messageId:   string,
  body:        string,
): Promise<void> {
  await fetch(`${GRAPH_BASE}/me/messages/${messageId}/reply`, {
    method:  'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body:    JSON.stringify({ message: {}, comment: body }),
  });
}

export async function outlookMarkRead(accessToken: string, messageId: string): Promise<void> {
  await fetch(`${GRAPH_BASE}/me/messages/${messageId}`, {
    method:  'PATCH',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body:    JSON.stringify({ isRead: true }),
  });
}

export async function outlookSendNew(
  accessToken: string,
  to:          string,
  subject:     string,
  body:        string,
  attachment?: { filename: string; content: Buffer; mimeType: string },
): Promise<void> {
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
  await fetch(`${GRAPH_BASE}/me/sendMail`, {
    method:  'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body:    JSON.stringify({ message }),
  });
}

export async function outlookDownloadFile(
  accessToken: string,
  fileId:      string,
  mimeType:    string,
): Promise<{ buffer: Buffer; contentType: string } | null> {
  const res = await fetch(`${GRAPH_BASE}/me/drive/items/${fileId}/content`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return null;
  const contentType = res.headers.get('content-type') ?? mimeType;
  return { buffer: Buffer.from(await res.arrayBuffer()), contentType };
}

export interface OneDriveFile {
  id:       string;
  name:     string;
  mimeType: string;
}

export async function outlookSearchFiles(accessToken: string, query: string): Promise<OneDriveFile[]> {
  const res = await fetch(
    `${GRAPH_BASE}/me/drive/search(q='${encodeURIComponent(query)}')?$select=id,name,file&$top=10`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!res.ok) return [];
  const data = await res.json();
  return ((data.value ?? []) as any[]).map(f => ({
    id:       f.id,
    name:     f.name,
    mimeType: f.file?.mimeType ?? 'application/octet-stream',
  }));
}

export async function outlookReadFile(accessToken: string, fileId: string): Promise<string> {
  const res = await fetch(`${GRAPH_BASE}/me/drive/items/${fileId}/content`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return '';
  const contentType = res.headers.get('content-type') ?? '';
  if (contentType.includes('text') || contentType.includes('json')) {
    return res.text();
  }
  return '[Archivo binario — no se puede leer como texto]';
}

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

function callbackUrl(provider: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.centinelia.mx';
  return `${base}/api/auth/email-callback?provider=${provider}`;
}
