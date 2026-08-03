import type { createAdminClient } from '@/lib/supabase/admin';
import { usoCfdiLabel } from './cfdi-catalog';

type SupabaseClient = ReturnType<typeof createAdminClient>;

export interface LookupFacturaArgs {
  cliente_rfc?:    string;
  cliente_nombre?: string;
  request_id?:     string;
}

export interface FacturaLookupRow {
  id:             string;
  cliente_nombre: string;
  cliente_rfc:    string;
  total:          number;
  status:         string;
  requested_at:   string;
  resolved_at:    string | null;
  issued_uuid:    string | null;
  issued_folio:   string | null;
  uso_cfdi:       string;
}

export async function lookupFacturas(
  args:      LookupFacturaArgs,
  agentId:   string,
  supabase:  SupabaseClient,
): Promise<{ ok: boolean; message: string; results: FacturaLookupRow[] }> {
  const { cliente_rfc, cliente_nombre, request_id } = args;
  if (!cliente_rfc && !cliente_nombre && !request_id) {
    return { ok: false, message: 'Necesito RFC, nombre del cliente o folio de la solicitud para buscar.', results: [] };
  }

  let q = supabase
    .from('factura_requests')
    .select('id, cliente_nombre, cliente_rfc, total, status, requested_at, resolved_at, issued_uuid, issued_folio, uso_cfdi')
    .eq('agent_id', agentId)
    .order('requested_at', { ascending: false })
    .limit(10);

  if (request_id)     q = q.eq('id', request_id);
  if (cliente_rfc)    q = q.eq('cliente_rfc', cliente_rfc.toUpperCase().replace(/[\s-]/g, ''));
  if (cliente_nombre) q = q.ilike('cliente_nombre', `%${cliente_nombre}%`);

  const { data, error } = await q;
  if (error) return { ok: false, message: `Error al buscar: ${error.message}`, results: [] };

  const rows = (data ?? []) as FacturaLookupRow[];
  if (rows.length === 0) {
    return { ok: true, message: 'No encontré solicitudes de factura con esos datos.', results: [] };
  }

  const lines = rows.map(r => {
    const when   = new Date(r.requested_at).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' });
    const money  = `$${r.total.toLocaleString('es-MX')}`;
    const prefix = `• Solicitud del ${when} — ${money} para ${r.cliente_nombre}:`;
    if (r.status === 'issued') {
      const emitted = r.resolved_at ? new Date(r.resolved_at).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' }) : '?';
      const uuid    = r.issued_uuid ? ` (UUID ${r.issued_uuid.slice(0, 8)}...)` : '';
      return `${prefix} ✅ EMITIDA el ${emitted}${uuid}`;
    }
    if (r.status === 'cancelled') return `${prefix} CANCELADA`;
    if (r.status === 'in_progress') return `${prefix} EN PROCESO de emisión — el equipo de facturación ya la está trabajando (Uso ${usoCfdiLabel(r.uso_cfdi)})`;
    return `${prefix} PENDIENTE de captura — aún no la ha empezado a emitir el equipo de facturación (Uso ${usoCfdiLabel(r.uso_cfdi)})`;
  }).join('\n');

  return { ok: true, message: `Encontré ${rows.length} solicitud(es):\n${lines}`, results: rows };
}
