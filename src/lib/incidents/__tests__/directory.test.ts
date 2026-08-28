import { describe, it, expect } from 'vitest';
import { resolveIncidentRecipient } from '../directory';
import type { DirectoryPerson } from '../../helpdesk/folio';

describe('resolveIncidentRecipient', () => {
  it('returns null when directory is empty', () => {
    expect(resolveIncidentRecipient([])).toBeNull();
  });

  it('returns null when no person has flag', () => {
    const dir: DirectoryPerson[] = [
      { id: '1', name: 'Alice', phone: '+521', email: 'a@x.com', is_operations_contact: true },
    ];
    expect(resolveIncidentRecipient(dir)).toBeNull();
  });

  it('returns null when flagged person has no email', () => {
    const dir: DirectoryPerson[] = [
      { id: '1', name: 'Bob', phone: '+521', receives_incident_reports: true },
    ];
    expect(resolveIncidentRecipient(dir)).toBeNull();
  });

  it('returns first person with flag+email', () => {
    const dir: DirectoryPerson[] = [
      { id: '1', name: 'Alice', phone: '+521', email: 'a@x.com' },
      { id: '2', name: 'Bob', phone: '+522', email: 'b@x.com', receives_incident_reports: true },
      { id: '3', name: 'Carol', phone: '+523', email: 'c@x.com', receives_incident_reports: true },
    ];
    expect(resolveIncidentRecipient(dir)).toEqual({ email: 'b@x.com', name: 'Bob' });
  });
});
