/**
 * Tests del handler GET del webhook Meta (hub subscription verification).
 * POST handler es integration-heavy (mock supabase + anthropic + sendMetaText)
 * y se cubre con smoke E2E manual en Fase C.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from '../route';

beforeEach(() => {
  process.env.META_WA_VERIFY_TOKEN = 'test-verify-token';
});
afterEach(() => {
  delete process.env.META_WA_VERIFY_TOKEN;
});

function reqUrl(qs: string): NextRequest {
  return new NextRequest(`http://localhost/api/whatsapp/meta/webhook?${qs}`);
}

describe('GET webhook — hub verification', () => {
  it('200 con el challenge en body cuando token matchea + mode=subscribe', async () => {
    const res = await GET(reqUrl('hub.mode=subscribe&hub.verify_token=test-verify-token&hub.challenge=ABC123'));
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toBe('ABC123');
    expect(res.headers.get('content-type')).toContain('text/plain');
  });

  it('403 con token equivocado', async () => {
    const res = await GET(reqUrl('hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=ABC'));
    expect(res.status).toBe(403);
  });

  it('403 sin hub.mode', async () => {
    const res = await GET(reqUrl('hub.verify_token=test-verify-token&hub.challenge=ABC'));
    expect(res.status).toBe(403);
  });

  it('403 sin challenge (evita responder vacio y confirmar subscripcion invalida)', async () => {
    const res = await GET(reqUrl('hub.mode=subscribe&hub.verify_token=test-verify-token'));
    expect(res.status).toBe(403);
  });

  it('403 si META_WA_VERIFY_TOKEN no esta seteado (no confirmar suscripciones a ciegas)', async () => {
    delete process.env.META_WA_VERIFY_TOKEN;
    const res = await GET(reqUrl('hub.mode=subscribe&hub.verify_token=whatever&hub.challenge=ABC'));
    expect(res.status).toBe(403);
  });
});
