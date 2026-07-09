import crypto from 'crypto';
import { createAdminClient } from '@/lib/supabase/admin';

const INBOX_DOMAIN = process.env.EMAIL_INBOX_DOMAIN ?? 'inbox.centinelia.mx';

export function inboxTokenFor(portalEmail: string): string {
  return crypto.createHash('sha256').update(portalEmail.toLowerCase().trim()).digest('hex').slice(0, 12);
}

export function inboxAddressFor(portalEmail: string): string {
  return `${inboxTokenFor(portalEmail)}@${INBOX_DOMAIN}`;
}

// Reverse lookup: enumerate all accounts and find matching hash (fine for small scale)
export async function resolveInboxToken(token: string): Promise<string | null> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from('voice_agents')
    .select('portal_email')
    .not('portal_email', 'is', null);

  const seen = new Set<string>();
  for (const row of data ?? []) {
    const email = row.portal_email as string;
    if (!email || seen.has(email)) continue;
    seen.add(email);
    if (inboxTokenFor(email) === token) return email;
  }
  return null;
}

export function parseSenderName(from: string): string {
  const match = from.match(/^(.+?)\s*</);
  if (match) return match[1].trim().replace(/^["']|["']$/g, '');
  return from.split('@')[0];
}

export function parseToToken(toHeader: string): string {
  // Extract local part from headers like "Name <token@domain>" or "token@domain, ..."
  const match = toHeader.match(/<([^>]+)>/) ?? toHeader.match(/([^\s,]+@[^\s,]+)/);
  const addr  = match ? match[1] : toHeader;
  return addr.split('@')[0].replace(/[^a-f0-9]/g, '');
}
