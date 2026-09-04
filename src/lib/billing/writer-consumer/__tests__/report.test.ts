import { describe, it, expect } from 'vitest';
import { parseWriterReport, isBatchReport, isFatalReport } from '../report';

describe('parseWriterReport', () => {
  it('parses a BatchReport shape', () => {
    const raw = JSON.stringify({
      sourceFile: 'a.xml',
      processedAt: '2026-09-04T00:00:00Z',
      allOk: false,
      results: [
        {
          index: 0, rfc: 'RFC1', ok: true, serie: 'A', folio: 1,
          uuid: '00000000-abc', timbradoPath: 'a_A1.xml',
          kind: 'other', humanMessage: null, error: null,
        },
      ],
    });
    const parsed = parseWriterReport(raw);
    expect(parsed).not.toBeNull();
    expect(isBatchReport(parsed)).toBe(true);
    expect(isFatalReport(parsed)).toBe(false);
  });

  it('parses a FatalReport shape', () => {
    const raw = JSON.stringify({
      sourceFile: 'malformed.xml',
      processedAt: '2026-09-04T00:00:00Z',
      fatalKind: 'invalidData',
      fatalMessage: 'schema no cumple',
      fatalError: 'InvalidDataException: ...',
    });
    const parsed = parseWriterReport(raw);
    expect(parsed).not.toBeNull();
    expect(isFatalReport(parsed)).toBe(true);
    expect(isBatchReport(parsed)).toBe(false);
  });

  it('returns null for garbage JSON', () => {
    expect(parseWriterReport('{{not json')).toBeNull();
  });

  it('returns null for shapes that match neither type', () => {
    expect(parseWriterReport('{"foo":"bar"}')).toBeNull();
  });
});
