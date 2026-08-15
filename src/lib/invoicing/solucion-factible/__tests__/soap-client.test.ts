import { describe, it, expect } from 'vitest';
import { buildTimbrarEnvelope, buildCancelarEnvelope } from '../soap-client';

describe('SOAP envelope builders', () => {
  it('buildTimbrarEnvelope incluye cfdiBase64 y creds', () => {
    const env = buildTimbrarEnvelope('user@x', 'pw', '<xml/>');
    expect(env).toContain('<usuario>user@x</usuario>');
    expect(env).toContain('<password>pw</password>');
    expect(env).toContain('<cfdi>');
    expect(env).toContain(Buffer.from('<xml/>').toString('base64'));
    expect(env).toContain('<zip>false</zip>');
  });

  it('buildCancelarEnvelope incluye motivo y sustituto opcional', () => {
    const env = buildCancelarEnvelope('u', 'p', 'AAA-BBB', '01', 'CCC-DDD');
    expect(env).toContain('<uuid>AAA-BBB</uuid>');
    expect(env).toContain('<motivo>01</motivo>');
    expect(env).toContain('<uuidSustituto>CCC-DDD</uuidSustituto>');
  });

  it('buildCancelarEnvelope omite sustituto si null', () => {
    const env = buildCancelarEnvelope('u', 'p', 'AAA-BBB', '02', null);
    expect(env).not.toContain('uuidSustituto');
  });
});
