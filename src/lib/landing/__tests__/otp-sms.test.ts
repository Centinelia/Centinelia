/**
 * otp-sms unit tests — Twilio Verify API + bypass mock.
 *
 * El OTP real lo maneja Twilio Verify (ni hash local ni tabla propia).
 * verifyOtp consulta `verifications.create` para enviar y
 * `verificationChecks.create` para verificar. Reescrito 2026-10-04 cuando
 * el test anterior quedó obsoleto tras migrar de Messages API a Verify API.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ─── Mock Twilio Verify ───────────────────────────────────────────────────────

const mockVerificationsCreate      = vi.fn().mockResolvedValue({ status: 'pending' });
const mockVerificationChecksCreate = vi.fn().mockResolvedValue({ status: 'approved' });

vi.mock('twilio', () => ({
  default: () => ({
    verify: {
      v2: {
        services: (_sid: string) => ({
          verifications:      { create: mockVerificationsCreate },
          verificationChecks: { create: mockVerificationChecksCreate },
        }),
      },
    },
  }),
}));

// ─── Mock callback-store ──────────────────────────────────────────────────────
// otp-sms importa markOtpVerified + lee phone del store via getPhoneForRequest.
// getPhoneForRequest está en el mismo módulo y usa createAdminClient — mockeamos
// el admin client para evitar network.

// otp-sms importa estáticamente `markOtpVerified` y dinámicamente `getById`
// (dentro de getPhoneForRequest). Ambos deben estar en el mock.
const mockMarkOtpVerified = vi.fn().mockResolvedValue(undefined);
const mockGetById         = vi.fn().mockResolvedValue({ phone: '8112345678' });

vi.mock('../callback-store', () => ({
  markOtpVerified: (...args: unknown[]) => mockMarkOtpVerified(...args),
  getById:         (...args: unknown[]) => mockGetById(...args),
}));

import { sendOtp, verifyOtp } from '../otp-sms';

describe('sendOtp', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.LANDING_OTP_MOCK_CODE;
    process.env.TWILIO_ACCOUNT_SID       = 'ACtest';
    process.env.TWILIO_AUTH_TOKEN        = 'token-test';
    process.env.TWILIO_VERIFY_SERVICE_SID = 'VAtest';
  });

  afterEach(() => {
    delete process.env.TWILIO_ACCOUNT_SID;
    delete process.env.TWILIO_AUTH_TOKEN;
    delete process.env.TWILIO_VERIFY_SERVICE_SID;
  });

  it('envia verification via Twilio con numero MX (+52) y channel sms', async () => {
    const res = await sendOtp('req-1', '8112345678');
    expect(res.ok).toBe(true);
    expect(mockVerificationsCreate).toHaveBeenCalledWith({
      to:      '+528112345678',
      channel: 'sms',
    });
  });

  it('lanza si falta TWILIO_ACCOUNT_SID', async () => {
    delete process.env.TWILIO_ACCOUNT_SID;
    await expect(sendOtp('req-2', '8112345678')).rejects.toThrow(/TWILIO_ACCOUNT_SID/);
  });

  it('lanza si falta TWILIO_VERIFY_SERVICE_SID', async () => {
    delete process.env.TWILIO_VERIFY_SERVICE_SID;
    await expect(sendOtp('req-3', '8112345678')).rejects.toThrow(/TWILIO_VERIFY_SERVICE_SID/);
  });
});

describe('verifyOtp', () => {
  const REQUEST_ID = 'req-verify';

  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.LANDING_OTP_MOCK_CODE;
    process.env.TWILIO_ACCOUNT_SID       = 'ACtest';
    process.env.TWILIO_AUTH_TOKEN        = 'token-test';
    process.env.TWILIO_VERIFY_SERVICE_SID = 'VAtest';
    mockGetById.mockResolvedValue({ phone: '8112345678' });
  });

  afterEach(() => {
    delete process.env.TWILIO_ACCOUNT_SID;
    delete process.env.TWILIO_AUTH_TOKEN;
    delete process.env.TWILIO_VERIFY_SERVICE_SID;
    delete process.env.LANDING_OTP_MOCK_CODE;
  });

  it('acepta cuando Twilio Verify responde status=approved', async () => {
    mockVerificationChecksCreate.mockResolvedValueOnce({ status: 'approved' });
    const res = await verifyOtp(REQUEST_ID, '123456');
    expect(res.ok).toBe(true);
    expect(mockMarkOtpVerified).toHaveBeenCalledWith(REQUEST_ID);
  });

  it('rechaza con wrong_code cuando Twilio devuelve status=pending', async () => {
    mockVerificationChecksCreate.mockResolvedValueOnce({ status: 'pending' });
    const res = await verifyOtp(REQUEST_ID, '000000');
    expect(res.ok).toBe(false);
    expect(res.reason).toBe('wrong_code');
    expect(mockMarkOtpVerified).not.toHaveBeenCalled();
  });

  it('rechaza con wrong_code si no hay phone para el request', async () => {
    mockGetById.mockResolvedValueOnce(null);
    const res = await verifyOtp(REQUEST_ID, '123456');
    expect(res.ok).toBe(false);
    expect(res.reason).toBe('wrong_code');
    expect(mockVerificationChecksCreate).not.toHaveBeenCalled();
  });

  it('LANDING_OTP_MOCK_CODE permite bypass sin consultar Twilio', async () => {
    process.env.LANDING_OTP_MOCK_CODE = '999999';
    const res = await verifyOtp(REQUEST_ID, '999999');
    expect(res.ok).toBe(true);
    expect(mockVerificationChecksCreate).not.toHaveBeenCalled();
  });

  it('bypass solo activa si el código submitted coincide con el mock', async () => {
    process.env.LANDING_OTP_MOCK_CODE = '999999';
    mockVerificationChecksCreate.mockResolvedValueOnce({ status: 'pending' });
    const res = await verifyOtp(REQUEST_ID, '000000');
    expect(res.ok).toBe(false);
    expect(mockVerificationChecksCreate).toHaveBeenCalled();
  });
});
