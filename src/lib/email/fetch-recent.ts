export interface EmailMeta {
  from:    string;
  subject: string;
  snippet: string;
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
