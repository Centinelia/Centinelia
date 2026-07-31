import crypto from 'crypto';
import { createAdminClient } from '@/lib/supabase/admin';

const INBOX_DOMAIN = process.env.EMAIL_INBOX_DOMAIN ?? 'inbox.centinelia.mx';

export function inboxTokenFor(portalEmail: string): string {
  return crypto.createHash('sha256').update(portalEmail.toLowerCase().trim()).digest('hex').slice(0, 12);
}

export function inboxAddressFor(portalEmail: string): string {
  return `${inboxTokenFor(portalEmail)}@${INBOX_DOMAIN}`;
}

export function agentInboxTokenFor(agentId: string): string {
  return crypto.createHash('sha256').update(`agt:${agentId}`).digest('hex').slice(0, 12);
}

export function agentInboxAddressFor(agentId: string): string {
  return `${agentInboxTokenFor(agentId)}@${INBOX_DOMAIN}`;
}

export async function resolveAgentFromToken(token: string): Promise<{ agentId: string; portalEmail: string } | null> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from('voice_agents')
    .select('id, portal_email')
    .not('portal_email', 'is', null);

  for (const row of data ?? []) {
    if (agentInboxTokenFor(row.id) === token) {
      return { agentId: row.id, portalEmail: row.portal_email as string };
    }
  }
  return null;
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

export interface HandoffRequestMatch {
  id:            string;
  status:        string;
  agent_id:      string;
  target_email:  string;
  title:         string;
}

/**
 * Resuelve un token de 16 hex chars a la human_request correspondiente.
 * Early exit por longitud: agent tokens y inbox tokens son 12 chars, reply
 * tokens son 16. Cero riesgo de colisión.
 */
export async function resolveHumanRequestFromToken(token: string): Promise<HandoffRequestMatch | null> {
  if (token.length !== 16) return null;
  const supabase = createAdminClient();
  const { data } = await supabase
    .from('human_requests')
    .select('id, status, agent_id, target_email, title')
    .eq('reply_token', token)
    .maybeSingle();
  if (!data) return null;
  return {
    id:           data.id as string,
    status:       data.status as string,
    agent_id:     data.agent_id as string,
    target_email: data.target_email as string,
    title:        data.title as string,
  };
}
