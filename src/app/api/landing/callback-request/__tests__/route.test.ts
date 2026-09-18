import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from '../route';

// Mocks de los helpers de landing
vi.mock('@/lib/landing/callback-throttle', () => ({
  checkThrottle: vi.fn().mockResolvedValue({ allowed: true }),
}));

vi.mock('@/lib/landing/callback-store', () => ({
  createRequest: vi.fn().mockResolvedValue({ id: 'test-request-id' }),
}));

vi.mock('@/lib/landing/otp-sms', () => ({
  sendOtp: vi.fn().mockResolvedValue({ ok: true }),
}));

vi.mock('@/lib/landing/notify-owner', () => ({
  notifyOwnerNewLead: vi.fn().mockResolvedValue(undefined),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('POST /api/landing/callback-request Phase 2', () => {
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

  it('responde con requestId y no llama a Vapi todavia (solo OTP)', async () => {
    const req = new Request('http://localhost/api/landing/callback-request', {
      method: 'POST',
      body:   JSON.stringify({ phone: '8112345678', industry: 'tortilleria_abarrotes', consent: true }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.requestId).toBeTruthy();
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

  it('llama a sendOtp con el requestId y el telefono', async () => {
    const { sendOtp } = await import('@/lib/landing/otp-sms');
    const req = new Request('http://localhost/api/landing/callback-request', {
      method: 'POST',
      body:   JSON.stringify({ phone: '8119876543', industry: 'despacho_contable', consent: true }),
    });
    await POST(req);
    expect(sendOtp).toHaveBeenCalledOnce();
    expect(sendOtp).toHaveBeenCalledWith('test-request-id', '8119876543');
  });

  it('llama a notifyOwnerNewLead con los datos del lead', async () => {
    const { notifyOwnerNewLead } = await import('@/lib/landing/notify-owner');
    const req = new Request('http://localhost/api/landing/callback-request', {
      method: 'POST',
      body:   JSON.stringify({ phone: '8119876543', industry: 'despacho_contable', consent: true }),
    });
    await POST(req);
    expect(notifyOwnerNewLead).toHaveBeenCalledOnce();
    expect(notifyOwnerNewLead).toHaveBeenCalledWith(
      expect.objectContaining({
        phone:    '8119876543',
        industry: 'despacho_contable',
      }),
    );
  });

  it('responde 429 en ip_rate_limit', async () => {
    const { checkThrottle } = await import('@/lib/landing/callback-throttle');
    vi.mocked(checkThrottle).mockResolvedValueOnce({ allowed: false, reason: 'ip_rate_limit' });
    const req = new Request('http://localhost/api/landing/callback-request', {
      method:  'POST',
      headers: { 'x-forwarded-for': '10.0.0.99' },
      body:    JSON.stringify({ phone: '8199999999', industry: 'otro', consent: true }),
    });
    const res = await POST(req);
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.error).toBe('ip_rate_limit');
  });

  it('responde 429 en phone_rate_limit', async () => {
    const { checkThrottle } = await import('@/lib/landing/callback-throttle');
    vi.mocked(checkThrottle).mockResolvedValueOnce({ allowed: false, reason: 'phone_rate_limit' });
    const req = new Request('http://localhost/api/landing/callback-request', {
      method: 'POST',
      body:   JSON.stringify({ phone: '8112345678', industry: 'otro', consent: true }),
    });
    const res = await POST(req);
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.error).toBe('phone_rate_limit');
  });
});
