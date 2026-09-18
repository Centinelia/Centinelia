import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from '../route';

// Mocks de los helpers
vi.mock('@/lib/landing/otp-sms', () => ({
  verifyOtp: vi.fn(),
}));

vi.mock('@/lib/landing/callback-store', () => ({
  getById: vi.fn(),
}));

vi.mock('@/lib/vapi/landing-demo', () => ({
  triggerLandingDemoCall: vi.fn(),
}));

vi.mock('@/lib/landing/notify-owner', () => ({
  notifyOwnerFallback: vi.fn().mockResolvedValue(undefined),
}));

// Mock de Date.toLocaleString para controlar la hora MX
const realDate = Date;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('POST /api/landing/callback-verify', () => {
  it('rechaza body sin JSON valido', async () => {
    const req = new Request('http://localhost/api/landing/callback-verify', {
      method: 'POST',
      body:   'no es json',
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error).toBe('invalid_json');
  });

  it('rechaza payload incompleto (sin requestId)', async () => {
    const req = new Request('http://localhost/api/landing/callback-verify', {
      method: 'POST',
      body:   JSON.stringify({ code: '123456' }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('invalid_payload');
  });

  it('rechaza payload incompleto (sin code)', async () => {
    const req = new Request('http://localhost/api/landing/callback-verify', {
      method: 'POST',
      body:   JSON.stringify({ requestId: 'some-id' }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('invalid_payload');
  });

  it('rechaza codigo incorrecto (wrong_code)', async () => {
    const { verifyOtp } = await import('@/lib/landing/otp-sms');
    vi.mocked(verifyOtp).mockResolvedValueOnce({ ok: false, reason: 'wrong_code' });

    const req = new Request('http://localhost/api/landing/callback-verify', {
      method: 'POST',
      body:   JSON.stringify({ requestId: 'r-bad', code: '999999' }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error).toBe('wrong_code');
  });

  it('rechaza OTP expirado', async () => {
    const { verifyOtp } = await import('@/lib/landing/otp-sms');
    vi.mocked(verifyOtp).mockResolvedValueOnce({ ok: false, reason: 'expired' });

    const req = new Request('http://localhost/api/landing/callback-verify', {
      method: 'POST',
      body:   JSON.stringify({ requestId: 'r-expired', code: '123456' }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('expired');
  });

  it('rechaza demasiados intentos', async () => {
    const { verifyOtp } = await import('@/lib/landing/otp-sms');
    vi.mocked(verifyOtp).mockResolvedValueOnce({ ok: false, reason: 'too_many_attempts' });

    const req = new Request('http://localhost/api/landing/callback-verify', {
      method: 'POST',
      body:   JSON.stringify({ requestId: 'r-maxed', code: '123456' }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('too_many_attempts');
  });

  it('dispara llamada Vapi en horario laboral y responde dialing', async () => {
    const { verifyOtp } = await import('@/lib/landing/otp-sms');
    const { getById } = await import('@/lib/landing/callback-store');
    const { triggerLandingDemoCall } = await import('@/lib/vapi/landing-demo');

    vi.mocked(verifyOtp).mockResolvedValueOnce({ ok: true });
    vi.mocked(getById).mockResolvedValueOnce({
      id:              'r-ok',
      phone:           '8112345678',
      industry:        'tortilleria_abarrotes',
      ip:              null,
      user_agent:      null,
      consent_at:      new Date().toISOString(),
      otp_hash:        'hash',
      otp_expires_at:  new Date(Date.now() + 60_000).toISOString(),
      otp_attempts:    1,
      otp_verified_at: null,
      vapi_call_id:    null,
      call_status:     'pending',
      call_started_at: null,
      call_ended_at:   null,
      created_at:      new Date().toISOString(),
      updated_at:      new Date().toISOString(),
    });
    vi.mocked(triggerLandingDemoCall).mockResolvedValueOnce({ ok: true, vapiCallId: 'V1' });

    // Forzar hora dentro del horario (14h = 2pm MTY)
    vi.spyOn(Date.prototype, 'toLocaleString').mockReturnValueOnce('14');

    const req = new Request('http://localhost/api/landing/callback-verify', {
      method: 'POST',
      body:   JSON.stringify({ requestId: 'r-ok', code: '123456' }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.callStatus).toBe('dialing');
  });

  it('responde fallback_manual con razon out_of_hours fuera de horario', async () => {
    const { verifyOtp } = await import('@/lib/landing/otp-sms');
    const { getById } = await import('@/lib/landing/callback-store');
    const { notifyOwnerFallback } = await import('@/lib/landing/notify-owner');

    vi.mocked(verifyOtp).mockResolvedValueOnce({ ok: true });
    vi.mocked(getById).mockResolvedValueOnce({
      id:              'r-night',
      phone:           '8112345678',
      industry:        'construccion',
      ip:              null,
      user_agent:      null,
      consent_at:      new Date().toISOString(),
      otp_hash:        'hash',
      otp_expires_at:  new Date(Date.now() + 60_000).toISOString(),
      otp_attempts:    1,
      otp_verified_at: null,
      vapi_call_id:    null,
      call_status:     'pending',
      call_started_at: null,
      call_ended_at:   null,
      created_at:      new Date().toISOString(),
      updated_at:      new Date().toISOString(),
    });

    // Forzar hora fuera de horario (23h = 11pm MTY)
    vi.spyOn(Date.prototype, 'toLocaleString').mockReturnValueOnce('23');

    const req = new Request('http://localhost/api/landing/callback-verify', {
      method: 'POST',
      body:   JSON.stringify({ requestId: 'r-night', code: '123456' }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.callStatus).toBe('fallback_manual');
    expect(body.reason).toBe('out_of_hours');
    expect(notifyOwnerFallback).toHaveBeenCalledWith(
      expect.objectContaining({ reason: 'out_of_hours' }),
    );
  });

  it('responde fallback_manual con razon vapi_fail cuando Vapi falla', async () => {
    const { verifyOtp } = await import('@/lib/landing/otp-sms');
    const { getById } = await import('@/lib/landing/callback-store');
    const { triggerLandingDemoCall } = await import('@/lib/vapi/landing-demo');
    const { notifyOwnerFallback } = await import('@/lib/landing/notify-owner');

    vi.mocked(verifyOtp).mockResolvedValueOnce({ ok: true });
    vi.mocked(getById).mockResolvedValueOnce({
      id:              'r-vapifail',
      phone:           '8112345678',
      industry:        'servicios_profesionales',
      ip:              null,
      user_agent:      null,
      consent_at:      new Date().toISOString(),
      otp_hash:        'hash',
      otp_expires_at:  new Date(Date.now() + 60_000).toISOString(),
      otp_attempts:    1,
      otp_verified_at: null,
      vapi_call_id:    null,
      call_status:     'pending',
      call_started_at: null,
      call_ended_at:   null,
      created_at:      new Date().toISOString(),
      updated_at:      new Date().toISOString(),
    });
    vi.mocked(triggerLandingDemoCall).mockResolvedValueOnce({ ok: false, error: 'timeout' });

    // Hora dentro de horario
    vi.spyOn(Date.prototype, 'toLocaleString').mockReturnValueOnce('10');

    const req = new Request('http://localhost/api/landing/callback-verify', {
      method: 'POST',
      body:   JSON.stringify({ requestId: 'r-vapifail', code: '123456' }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.callStatus).toBe('fallback_manual');
    expect(body.reason).toBe('vapi_fail');
    expect(notifyOwnerFallback).toHaveBeenCalledWith(
      expect.objectContaining({ reason: expect.stringContaining('vapi_fail') }),
    );
  });
});
