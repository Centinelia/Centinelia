import { describe, it, expect } from 'vitest';
import { resolveIncidentRecipients } from '../directory';
import type { DirectoryPerson } from '../../helpdesk/folio';

describe('resolveIncidentRecipients', () => {
  it('returns empty array when directory is empty', () => {
    expect(resolveIncidentRecipients([])).toEqual([]);
  });

  it('returns empty array when no person has flag', () => {
    const dir: DirectoryPerson[] = [
      { id: '1', name: 'Alice', phone: '+521', email: 'a@x.com', is_operations_contact: true },
    ];
    expect(resolveIncidentRecipients(dir)).toEqual([]);
  });

  it('skips flagged person without email', () => {
    const dir: DirectoryPerson[] = [
      { id: '1', name: 'Bob', phone: '+521', receives_incident_reports: true },
    ];
    expect(resolveIncidentRecipients(dir)).toEqual([]);
  });

  it('returns ALL persons with flag+email (multi-recipient)', () => {
    const dir: DirectoryPerson[] = [
      { id: '1', name: 'Alice', phone: '+521', email: 'a@x.com' },
      { id: '2', name: 'Bob', phone: '+522', email: 'b@x.com', receives_incident_reports: true },
      { id: '3', name: 'Carol', phone: '+523', email: 'c@x.com', receives_incident_reports: true },
    ];
    expect(resolveIncidentRecipients(dir)).toEqual([
      { email: 'b@x.com', name: 'Bob' },
      { email: 'c@x.com', name: 'Carol' },
    ]);
  });
});
