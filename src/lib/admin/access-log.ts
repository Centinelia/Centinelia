// Helper para registrar accesos admin a datos sensibles del cliente.
// Fix T12 audit 2026-08-10 — LFPDPPP art. 30. Nunca debe throw ni bloquear.

import type { createAdminClient } from '@/lib/supabase/admin';

export interface AdminAccessLogEntry {
  adminEmail:           string;
  endpoint:             string;
  method:               string;                             // GET | POST | PUT | DELETE
  affectedPortalEmail?: string | null;
  affectedAgentId?:     string | null;
  queryType?:           'view' | 'export_csv' | 'modify' | 'delete';
  rowsReturned?:        number;
  filters?:             Record<string, unknown> | null;
  ipAddress?:           string | null;
  userAgent?:           string | null;
}

export async function logAdminAccess(
  supabase: ReturnType<typeof createAdminClient>,
  entry: AdminAccessLogEntry,
): Promise<void> {
  try {
    await supabase.from('admin_access_log').insert({
      admin_email:           entry.adminEmail,
      endpoint:              entry.endpoint,
      method:                entry.method,
      affected_portal_email: entry.affectedPortalEmail ?? null,
      affected_agent_id:     entry.affectedAgentId ?? null,
      query_type:            entry.queryType ?? 'view',
      rows_returned:         entry.rowsReturned ?? null,
      filters:               entry.filters ?? null,
      ip_address:            entry.ipAddress ?? null,
      user_agent:            entry.userAgent ?? null,
    });
  } catch (err) {
    // Best-effort. Nunca bloquear el request por el log.
    console.error('[admin/access-log] insert failed', err);
  }
}
