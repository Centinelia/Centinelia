/**
 * Tests del verifier Meta WA (HMAC-SHA256 con META_WA_APP_SECRET).
 * Meta firma cada POST con `x-hub-signature-256: sha256=<hex>`.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createHmac } from 'crypto';
import { NextRequest } from 'next/server';
import { metaWaVerifier } from '../providers';

function signBody(body: string, secret: string): string {
  return 'sha256=' + createHmac('sha256', secret).update(body).digest('hex');
}

function reqWith(sig: string | null): NextRequest {
  const headers = new Headers();
  if (sig !== null) headers.set('x-hub-signature-256', sig);
  return new NextRequest('http://localhost/api/whatsapp/meta/webhook', { method: 'POST', headers });
}

const SAMPLE_BODY = JSON.stringify({
  object: 'whatsapp_business_account',
  entry: [{
    id: 'waba-123',
    changes: [{
      field: 'messages',
      value: {
        messaging_product: 'whatsapp',
        metadata: { display_phone_number: '5218112803360', phone_number_id: '111222333' },
        contacts: [{ profile: { name: 'Nazre' }, wa_id: '528112803360' }],
        messages: [{ from: '528112803360', id: 'wamid.msg1', timestamp: '1000', type: 'text', text: { body: 'hola' } }],
      },
    }],
  }],
});

beforeEach(() => {
  process.env.META_WA_APP_SECRET = 'test-secret';
});
afterEach(() => {
  delete process.env.META_WA_APP_SECRET;
});

describe('metaWaVerifier — happy path', () => {
  it('ok con firma valida + extrae eventId=messageId', async () => {
    const sig = signBody(SAMPLE_BODY, 'test-secret');
    const r = await metaWaVerifier.verify(reqWith(sig), SAMPLE_BODY);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.eventId).toBe('wamid.msg1');
    expect(r.eventType).toBe('message');
    expect(r.event.object).toBe('whatsapp_business_account');
  });

  it('extrae eventType=status cuando el payload es un status update', async () => {
    const statusBody = JSON.stringify({
      object: 'whatsapp_business_account',
      entry: [{ changes: [{ value: { statuses: [{ id: 'wamid.status1', status: 'delivered', timestamp: '1000' }] } }] }],
    });
    const sig = signBody(statusBody, 'test-secret');
    const r = await metaWaVerifier.verify(reqWith(sig), statusBody);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.eventId).toBe('wamid.status1');
    expect(r.eventType).toBe('delivered');
  });
});

describe('metaWaVerifier — rechazos', () => {
  it('503 si META_WA_APP_SECRET no esta configurado', async () => {
    delete process.env.META_WA_APP_SECRET;
    const r = await metaWaVerifier.verify(reqWith('sha256=deadbeef'), SAMPLE_BODY);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.status).toBe(503);
  });

  it('400 si el header x-hub-signature-256 falta', async () => {
    const r = await metaWaVerifier.verify(reqWith(null), SAMPLE_BODY);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.status).toBe(400);
    expect(r.error).toBe('missing_signature');
  });

  it('400 si el header no tiene el prefijo sha256=', async () => {
    const r = await metaWaVerifier.verify(reqWith('md5=abc'), SAMPLE_BODY);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.status).toBe(400);
  });

  it('401 si la firma no matchea (secret erroneo)', async () => {
    const sig = signBody(SAMPLE_BODY, 'wrong-secret');
    const r = await metaWaVerifier.verify(reqWith(sig), SAMPLE_BODY);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.status).toBe(401);
    expect(r.error).toBe('invalid_signature');
  });

  it('400 si el body no es JSON valido', async () => {
    const brokenBody = 'not-json';
    const sig = signBody(brokenBody, 'test-secret');
    const r = await metaWaVerifier.verify(reqWith(sig), brokenBody);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.status).toBe(400);
    expect(r.error).toBe('invalid_json');
  });
});
