import type { DirectoryPerson } from '../helpdesk/folio';

export interface IncidentRecipient { email: string; name: string }

/**
 * Devuelve todos los encargados del directorio marcados con
 * `receives_incident_reports` y con email. Multi-recipient: si el cliente
 * marcó a 2+ personas, todos reciben la notificación (registrar_incidencia,
 * registrar_cliente_nuevo). Array vacío = nadie configurado.
 */
export function resolveIncidentRecipients(
  directory: DirectoryPerson[],
): IncidentRecipient[] {
  const out: IncidentRecipient[] = [];
  for (const p of directory) {
    if (p.receives_incident_reports && p.email) {
      out.push({ email: p.email, name: p.name });
    }
  }
  return out;
}
