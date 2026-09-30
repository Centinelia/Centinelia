export interface EmailMeta {
  from:    string;
  subject: string;
  snippet: string;
}

export interface EmailSample {
  subject: string;
  body:    string;
  snippet: string;
}

// Quita firmas, quote replies, "Sent from iPhone", disclaimers legales y otros
// boilerplates del cuerpo antes de pasarlo a extractBrandVoice. Sin esto, la
// guía extraída queda contaminada con patrones que no son del tono del negocio.
// Exportado para tests.
export function stripEmailBoilerplate(raw: string): string {
  if (!raw) return '';
  let text = raw;

  // 1. Quote replies antes de recortar por longitud — si el correo termina
  // con "El 25 de septiembre... escribió:" seguido de un thread completo,
  // ese thread NO es tono del negocio (es el interlocutor).
  const quotePatterns = [
    /\n\s*El\s+.{0,80}\s+escribi[oó]:[\s\S]*$/i,
    /\n\s*On\s+.{0,80}\s+wrote:[\s\S]*$/i,
    /\n\s*De:\s+.{0,200}[\s\S]*$/i,       // Outlook classic forwards
    /\n\s*From:\s+.{0,200}[\s\S]*$/i,     // Outlook English
    /\n\s*-{3,}\s*Mensaje\s+original\s*-{3,}[\s\S]*$/i,
    /\n\s*-{3,}\s*Original\s+Message\s*-{3,}[\s\S]*$/i,
    /(\n\s*>\s.+){2,}[\s\S]*$/,           // 2+ líneas prefijadas con "> "
  ];
  for (const re of quotePatterns) {
    text = text.replace(re, '');
  }

  // 2. Firmas móviles / "Sent from" — cortan todo lo que sigue.
  const mobileSigPatterns = [
    /\n\s*Sent\s+from\s+my\s+.{0,40}$/im,
    /\n\s*Enviado\s+desde\s+mi\s+.{0,40}$/im,
    /\n\s*Get\s+Outlook\s+for\s+(iOS|Android).*$/im,
    /\n\s*Obt[eé]n\s+Outlook\s+para\s+(iOS|Android).*$/im,
  ];
  for (const re of mobileSigPatterns) {
    text = text.replace(re, '');
  }

  // 3. Separadores clásicos de firma "--", "___", "===" en una línea sola.
  // Todo lo que va después es la firma con nombre/rol/tel/redes.
  text = text.replace(/\n\s*(?:-{2,}|_{3,}|={3,})\s*\n[\s\S]*$/, '');

  // 4. Disclaimers legales típicos ("Este correo es confidencial...",
  // "This email contains confidential..."). Cortan al final del cuerpo.
  const legalPatterns = [
    /\n\s*(?:Este|El)\s+(?:correo|mensaje)\s+(?:es|puede\s+contener|contiene)[\s\S]{0,600}$/i,
    /\n\s*This\s+(?:e-?mail|message)\s+(?:is|may\s+contain|contains)[\s\S]{0,600}$/i,
    /\n\s*AVISO\s+DE\s+CONFIDENCIALIDAD[\s\S]*$/i,
    /\n\s*CONFIDENTIALITY\s+NOTICE[\s\S]*$/i,
  ];
  for (const re of legalPatterns) {
    text = text.replace(re, '');
  }

  return text.replace(/\s+/g, ' ').trim();
}

// Decodifica base64url de Gmail y colapsa whitespace. Prefiere text/plain
// sobre text/html; si solo hay html, strip tags simple. Exportado para tests.
export function extractBodyFromGmailPayload(payload: unknown): string {
  const p = payload as { mimeType?: string; body?: { data?: string }; parts?: unknown[] } | undefined;
  if (!p) return '';

  const decode = (data: string): string => {
    try {
      const b64 = data.replace(/-/g, '+').replace(/_/g, '/');
      return Buffer.from(b64, 'base64').toString('utf-8');
    } catch { return ''; }
  };

  const walk = (node: { mimeType?: string; body?: { data?: string }; parts?: unknown[] } | undefined, want: string): string => {
    if (!node) return '';
    if (node.mimeType === want && node.body?.data) return decode(node.body.data);
    for (const part of (node.parts ?? []) as { mimeType?: string; body?: { data?: string }; parts?: unknown[] }[]) {
      const found = walk(part, want);
      if (found) return found;
    }
    return '';
  };

  const plain = walk(p, 'text/plain');
  if (plain) return plain.replace(/\s+/g, ' ').trim();

  const html = walk(p, 'text/html');
  if (html) {
    return html
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&quot;/gi, '"')
      .replace(/\s+/g, ' ')
      .trim();
  }

  return '';
}

export async function fetchRecentGmail(
  accessToken: string,
  since: Date,
): Promise<EmailMeta[]> {
  const after    = Math.floor(since.getTime() / 1000);
  const query    = `in:inbox after:${after}`;
  const listRes  = await fetch(
    `https://www.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(query)}&maxResults=60`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!listRes.ok) return [];

  const list = await listRes.json();
  const ids: string[] = (list.messages ?? []).map((m: { id: string }) => m.id);
  if (!ids.length) return [];

  const settled = await Promise.allSettled(
    ids.slice(0, 60).map(async id => {
      const res = await fetch(
        `https://www.googleapis.com/gmail/v1/users/me/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
      if (!res.ok) return null;
      const msg = await res.json();
      const hdrs: Record<string, string> = {};
      for (const h of msg.payload?.headers ?? []) hdrs[h.name.toLowerCase()] = h.value;
      return {
        from:    hdrs['from']    ?? '',
        subject: hdrs['subject'] ?? '',
        snippet: (msg.snippet ?? '') as string,
      };
    }),
  );

  return settled
    .filter(r => r.status === 'fulfilled' && r.value !== null)
    .map(r => (r as PromiseFulfilledResult<EmailMeta>).value);
}

export async function fetchRecentOutlook(
  accessToken: string,
  since: Date,
): Promise<EmailMeta[]> {
  const filter = `receivedDateTime ge ${since.toISOString()}`;
  const res = await fetch(
    `https://graph.microsoft.com/v1.0/me/messages?$filter=${encodeURIComponent(filter)}&$top=60&$select=from,subject,bodyPreview`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!res.ok) return [];
  const data = await res.json();
  return (data.value ?? []).map((m: {
    from?: { emailAddress?: { address?: string } };
    subject?: string;
    bodyPreview?: string;
  }) => ({
    from:    m.from?.emailAddress?.address ?? '',
    subject: m.subject ?? '',
    snippet: m.bodyPreview ?? '',
  }));
}

// ─── Enviados con body — extracción de tono de marca ──────────────────────────
// Lee correos ENVIADOS por el negocio (in:sent Gmail / SentItems Outlook) con
// body completo, para alimentar extractBrandVoice(). Diferente de fetchRecent*
// que solo trae metadata de recibidos (in:inbox) para autotag/role-learning.

export async function fetchSentGmailForVoice(
  accessToken: string,
  since:       Date,
  maxEmails:   number = 20,
): Promise<EmailSample[]> {
  const after = Math.floor(since.getTime() / 1000);
  const query = `in:sent after:${after}`;
  const listRes = await fetch(
    `https://www.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(query)}&maxResults=${maxEmails}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!listRes.ok) return [];

  const list = await listRes.json();
  const ids: string[] = (list.messages ?? []).map((m: { id: string }) => m.id);
  if (!ids.length) return [];

  const settled = await Promise.allSettled(
    ids.slice(0, maxEmails).map(async id => {
      const res = await fetch(
        `https://www.googleapis.com/gmail/v1/users/me/messages/${id}?format=full`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
      if (!res.ok) return null;
      const msg     = await res.json();
      const hdrs: Record<string, string> = {};
      for (const h of msg.payload?.headers ?? []) hdrs[h.name.toLowerCase()] = h.value;
      const rawBody = extractBodyFromGmailPayload(msg.payload);
      const body    = stripEmailBoilerplate(rawBody);
      const snippet = (msg.snippet ?? '') as string;
      return {
        subject: hdrs['subject'] ?? '',
        body,
        snippet,
      };
    }),
  );

  return settled
    .filter((r): r is PromiseFulfilledResult<EmailSample> =>
      r.status === 'fulfilled' && r.value !== null && r.value.body.length > 0,
    )
    .map(r => r.value);
}

export async function fetchSentOutlookForVoice(
  accessToken: string,
  since:       Date,
  maxEmails:   number = 20,
): Promise<EmailSample[]> {
  const filter = `sentDateTime ge ${since.toISOString()}`;
  const res = await fetch(
    `https://graph.microsoft.com/v1.0/me/mailFolders/SentItems/messages?$filter=${encodeURIComponent(filter)}&$top=${maxEmails}&$select=subject,body,bodyPreview`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!res.ok) return [];
  const data = await res.json();
  return ((data.value ?? []) as Array<{
    subject?:     string;
    body?:        { contentType?: string; content?: string };
    bodyPreview?: string;
  }>)
    .map(m => {
      const raw     = m.body?.content ?? '';
      const isHtml  = (m.body?.contentType ?? '').toLowerCase() === 'html';
      // Strip HTML preservando saltos de línea (para que stripEmailBoilerplate
      // detecte separadores "--" y quote replies que están en líneas propias).
      const rawText = isHtml
        ? raw
            .replace(/<style[\s\S]*?<\/style>/gi, ' ')
            .replace(/<script[\s\S]*?<\/script>/gi, ' ')
            .replace(/<br\s*\/?>/gi, '\n')
            .replace(/<\/(p|div|li|h[1-6])>/gi, '\n')
            .replace(/<[^>]+>/g, ' ')
            .replace(/&nbsp;/gi, ' ')
            .replace(/&amp;/gi, '&')
            .replace(/&lt;/gi, '<')
            .replace(/&gt;/gi, '>')
            .replace(/&quot;/gi, '"')
        : raw;
      const body = stripEmailBoilerplate(rawText);
      return {
        subject: m.subject ?? '',
        body,
        snippet: m.bodyPreview ?? '',
      };
    })
    .filter(s => s.body.length > 0);
}
