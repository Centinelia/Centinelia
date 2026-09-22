/**
 * Tests del sender Meta Cloud API. Mocks global fetch para verificar shape
 * del POST + parse de respuestas ok/error.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { sendMetaText } from '../meta-send';

let fetchSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  process.env.META_WA_ACCESS_TOKEN = 'test-token';
  delete process.env.META_WA_API_VERSION;
  fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
    ok: true,
    json: async () => ({
      messages: [{ id: 'wamid.abc123' }],
      contacts: [{ wa_id: '528112803360' }],
    }),
  } as unknown as Response);
});

afterEach(() => {
  fetchSpy.mockRestore();
  delete process.env.META_WA_ACCESS_TOKEN;
});

describe('sendMetaText — happy path', () => {
  it('regresa ok:true con wamid y contactWaId parseados', async () => {
    const r = await sendMetaText({
      phoneNumberId: '111222333',
      to:            '+528112803360',
      body:          'Hola cliente',
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.wamid).toBe('wamid.abc123');
    expect(r.contactWaId).toBe('528112803360');
  });

  it('POSTea al endpoint Meta v20.0 por default con el phoneNumberId en el path', async () => {
    await sendMetaText({ phoneNumberId: '111222333', to: '+52811', body: 'x' });
    const url = fetchSpy.mock.calls[0][0] as string;
    expect(url).toBe('https://graph.facebook.com/v20.0/111222333/messages');
  });

  it('honra META_WA_API_VERSION si esta seteado', async () => {
    process.env.META_WA_API_VERSION = 'v21.0';
    await sendMetaText({ phoneNumberId: '111222333', to: '+52811', body: 'x' });
    const url = fetchSpy.mock.calls[0][0] as string;
    expect(url).toContain('/v21.0/');
  });

  it('manda el body con shape correcto Meta (messaging_product, type text, body)', async () => {
    await sendMetaText({ phoneNumberId: '111222333', to: '+528112803360', body: 'Hola cliente' });
    const init = fetchSpy.mock.calls[0][1] as RequestInit;
    const payload = JSON.parse(init.body as string);
    expect(payload.messaging_product).toBe('whatsapp');
    expect(payload.recipient_type).toBe('individual');
    expect(payload.to).toBe('528112803360');  // sin el +
    expect(payload.type).toBe('text');
    expect(payload.text.body).toBe('Hola cliente');
    expect(payload.text.preview_url).toBe(false);
  });

  it('agrega el Bearer token al Authorization header', async () => {
    await sendMetaText({ phoneNumberId: '111222333', to: '+52811', body: 'x' });
    const init = fetchSpy.mock.calls[0][1] as RequestInit;
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer test-token');
  });

  it('acepta accessToken override para multi-tenant sin tocar env', async () => {
    delete process.env.META_WA_ACCESS_TOKEN;
    await sendMetaText({ phoneNumberId: '111222333', to: '+52811', body: 'x', accessToken: 'other-token' });
    const init = fetchSpy.mock.calls[0][1] as RequestInit;
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer other-token');
  });

  it('normaliza numeros con espacios/guiones al formato E.164 sin +', async () => {
    await sendMetaText({ phoneNumberId: '111222333', to: '+52 811-280-3360', body: 'x' });
    const init = fetchSpy.mock.calls[0][1] as RequestInit;
    const payload = JSON.parse(init.body as string);
    expect(payload.to).toBe('528112803360');
  });
});

describe('sendMetaText — error path', () => {
  it('regresa ok:false si META_WA_ACCESS_TOKEN falta y no se pasa override', async () => {
    delete process.env.META_WA_ACCESS_TOKEN;
    const r = await sendMetaText({ phoneNumberId: '111222333', to: '+52811', body: 'x' });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toContain('META_WA_ACCESS_TOKEN');
  });

  it('regresa ok:false con statusCode + metaErrorCode cuando Meta rechaza', async () => {
    fetchSpy.mockResolvedValueOnce({
      ok:     false,
      status: 400,
      json:   async () => ({ error: { message: 'Recipient not in 24h window', code: 131047 } }),
    } as unknown as Response);
    const r = await sendMetaText({ phoneNumberId: '111222333', to: '+52811', body: 'x' });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.statusCode).toBe(400);
    expect(r.metaErrorCode).toBe(131047);
    expect(r.error).toContain('24h window');
  });

  it('regresa ok:false con HTTP fallback si el body de error no parsea', async () => {
    fetchSpy.mockResolvedValueOnce({
      ok:     false,
      status: 500,
      json:   async () => { throw new Error('bad json'); },
    } as unknown as Response);
    const r = await sendMetaText({ phoneNumberId: '111222333', to: '+52811', body: 'x' });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.statusCode).toBe(500);
    expect(r.error).toBe('HTTP 500');
  });
});
