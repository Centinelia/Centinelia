import { describe, it, expect } from 'vitest';
import { mapSfError } from '../error-mapping';

describe('mapSfError', () => {
  it('200 → ok, no retry', () => {
    expect(mapSfError(200)).toEqual({ retryable: false, action: 'ok' });
  });
  it('301 (XML inválido) → no retry, notifica plataforma (bug builder)', () => {
    expect(mapSfError(301)).toEqual({ retryable: false, action: 'notify_platform' });
  });
  it('500 (server) → retryable', () => {
    expect(mapSfError(500)).toEqual({ retryable: true, action: 'silent' });
  });
  it('601 (auth fail) → no retry, notifica org (creds rotas)', () => {
    expect(mapSfError(601)).toEqual({ retryable: false, action: 'notify_org' });
  });
  it('630 (sin timbres) → no retry, notifica org (comprar más)', () => {
    expect(mapSfError(630)).toEqual({ retryable: false, action: 'notify_org' });
  });
  it('999 (desconocido) → no retry por seguridad, notifica plataforma', () => {
    expect(mapSfError(999)).toEqual({ retryable: false, action: 'notify_platform' });
  });
});
