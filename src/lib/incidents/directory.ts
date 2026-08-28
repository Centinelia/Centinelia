import type { DirectoryPerson } from '../helpdesk/folio';

export function resolveIncidentRecipient(
  directory: DirectoryPerson[],
): { email: string; name: string } | null {
  for (const p of directory) {
    if (p.receives_incident_reports && p.email) {
      return { email: p.email, name: p.name };
    }
  }
  return null;
}
