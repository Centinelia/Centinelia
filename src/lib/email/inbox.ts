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

// ── Incident reply tokens (Nash) ─────────────────────────────────────────────
// Cuando Nash envía correo al cliente afectado (ACK de creación o notificación
// de resolución), el Reply-To apunta a esta dirección. Si el cliente responde,
// el webhook de /api/email/inbound detecta el patrón y reabre el incidente.
//
// Diseño: token = UUID sin guiones (32 hex chars). Longitud discriminante vs
// agent (12) y handoff (16). Lookup O(1) por eq(id, uuid) con índice.

export function incidentReplyTokenFor(incidentId: string): string {
  return incidentId.replace(/-/g, '').toLowerCase();
}

export function incidentReplyAddressFor(incidentId: string): string {
  return `${incidentReplyTokenFor(incidentId)}@${INBOX_DOMAIN}`;
}

export interface IncidentReplyMatch {
  incidentId:          string;
  affectedAgentId:     string | null;
  affectedPortalEmail: string | null;
  title:               string;
  status:              string;
}

export async function resolveIncidentFromToken(token: string): Promise<IncidentReplyMatch | null> {
  if (token.length !== 32) return null;
  // Reconstruye UUID canónico: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
  const uuid = `${token.slice(0,8)}-${token.slice(8,12)}-${token.slice(12,16)}-${token.slice(16,20)}-${token.slice(20,32)}`;
  const supabase = createAdminClient();
  const { data } = await supabase
    .from('platform_incidents')
    .select('id, affected_agent_id, affected_portal_email, title, status')
    .eq('id', uuid)
    .maybeSingle();
  if (!data) return null;
  return {
    incidentId:          data.id as string,
    affectedAgentId:     (data.affected_agent_id     as string | null) ?? null,
    affectedPortalEmail: (data.affected_portal_email as string | null) ?? null,
    title:               (data.title                 as string) ?? '',
    status:              (data.status                as string) ?? '',
  };
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
