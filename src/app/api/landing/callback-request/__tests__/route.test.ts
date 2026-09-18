import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from '../route';

// Mock sendEmail para no necesitar RESEND_API_KEY en tests
vi.mock('@/lib/email/send', () => ({
  sendEmail: vi.fn().mockResolvedValue(true),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('POST /api/landing/callback-request', () => {
  it('rechaza payload sin consent', async () => {
    const req = new Request('http://localhost/api/landing/callback-request', {
      method: 'POST',
      body:   JSON.stringify({ phone: '8112345678', industry: 'otro', consent: false }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.ok).toBe(false);
  });

  it('rechaza telefono no MX (muy corto)', async () => {
    const req = new Request('http://localhost/api/landing/callback-request', {
      method: 'POST',
      body:   JSON.stringify({ phone: '12345', industry: 'otro', consent: true }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.ok).toBe(false);
  });

  it('rechaza telefono con cero inicial (formato equivocado)', async () => {
    const req = new Request('http://localhost/api/landing/callback-request', {
      method: 'POST',
      body:   JSON.stringify({ phone: '0812345678', industry: 'otro', consent: true }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('rechaza industria fuera del catalogo', async () => {
    const req = new Request('http://localhost/api/landing/callback-request', {
      method: 'POST',
      body:   JSON.stringify({ phone: '8112345678', industry: 'farmacia', consent: true }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('rechaza body sin JSON valido', async () => {
    const req = new Request('http://localhost/api/landing/callback-request', {
      method: 'POST',
      body:   'esto no es json',
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('acepta payload valido y responde ok', async () => {
    const req = new Request('http://localhost/api/landing/callback-request', {
      method: 'POST',
      body:   JSON.stringify({ phone: '8112345678', industry: 'tortilleria_abarrotes', consent: true }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  it('acepta industria "construccion"', async () => {
    const req = new Request('http://localhost/api/landing/callback-request', {
      method: 'POST',
      body:   JSON.stringify({ phone: '8112345678', industry: 'construccion', consent: true }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
  });

  it('acepta industria "otro"', async () => {
    const req = new Request('http://localhost/api/landing/callback-request', {
      method: 'POST',
      body:   JSON.stringify({ phone: '8112345678', industry: 'otro', consent: true }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
  });

  it('llama a sendEmail con el telefono y la industria del payload', async () => {
    const { sendEmail } = await import('@/lib/email/send');
    const req = new Request('http://localhost/api/landing/callback-request', {
      method: 'POST',
      body:   JSON.stringify({ phone: '8119876543', industry: 'despacho_contable', consent: true }),
    });
    await POST(req);
    expect(sendEmail).toHaveBeenCalledOnce();
    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to:      'nazre20@gmail.com',
        subject: expect.stringContaining('despacho_contable'),
      }),
    );
  });
});
