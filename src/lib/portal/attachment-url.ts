/**
 * Resuelve el href de un attachment de ops_inbox para el portal.
 *
 * email-sync.ts guarda los attachments con URL `gmail:MSG_ID/ATT_ID` (formato
 * interno de la API de Gmail, no un URL público). Este helper detecta ese
 * formato y lo reescribe al proxy `/api/portal/[token]/email-attachment` que
 * descarga el binario via el connector OAuth de la org.
 *
 * URLs http/https se devuelven tal cual (attachments subidos a Supabase
 * Storage, links a Drive, etc.).
 */
export function resolveAttachmentHref(
  url:      string,
  token:    string,
  agentId:  string,
  name:     string,
  mime:     string,
): string {
  if (!url) return '#';
  if (!url.startsWith('gmail:')) return url;

  const rest  = url.slice('gmail:'.length);
  const slash = rest.indexOf('/');
  if (slash < 0) return '#';
  const msgId = rest.slice(0, slash);
  const attId = rest.slice(slash + 1);
  if (!msgId || !attId) return '#';

  const qs = new URLSearchParams({
    agent: agentId,
    msg:   msgId,
    att:   attId,
    name,
    mime,
  });
  return `/api/portal/${token}/email-attachment?${qs.toString()}`;
}
