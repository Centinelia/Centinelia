/**
 * otp-sms unit tests — mock Twilio y Supabase
 *
 * Verifica que sendOtp genera el hash y setea la expiracion,
 * y que verifyOtp distingue entre codigo correcto, incorrecto,
 * expirado, y demasiados intentos.
 *
 * Incluye bypass de mock-code via LANDING_OTP_MOCK_CODE para E2E (Task 24).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ─── Mock Twilio ──────────────────────────────────────────────────────────────

const mockMessagesCreate = vi.fn().mockResolvedValue({ sid: 'MOCK_SID' });

vi.mock('twilio', () => ({
  default: () => ({
    messages: { create: mockMessagesCreate },
  }),
}));

// ─── Mock callback-store ──────────────────────────────────────────────────────

const mockSetOtpHash         = vi.fn().mockResolvedValue(undefined);
const mockIncrementOtpAttempts = vi.fn().mockResolvedValue(1);
const mockMarkOtpVerified    = vi.fn().mockResolvedValue(undefined);
const mockGetById            = vi.fn();

vi.mock('../callback-store', () => ({
  setOtpHash:            (...args: unknown[]) => mockSetOtpHash(...args),
  incrementOtpAttempts:  (...args: unknown[]) => mockIncrementOtpAttempts(...args),
  markOtpVerified:       (...args: unknown[]) => mockMarkOtpVerified(...args),
  getById:               (...args: unknown[]) => mockGetById(...args),
}));

import { sendOtp, verifyOtp } from '../otp-sms';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Llama sendOtp y captura el hash + expiry de la llamada a setOtpHash */
async function sendAndCaptureHash(requestId: string, phone: string) {
  mockSetOtpHash.mockClear();
  const res = await sendOtp(requestId, phone);
  const [, capturedHash, capturedExpiry] = mockSetOtpHash.mock.calls[0] as [string, string, Date];
  return { res, capturedHash, capturedExpiry };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('sendOtp', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Asegurar que LANDING_OTP_MOCK_CODE no interfiere en estos tests
    delete process.env.LANDING_OTP_MOCK_CODE;
    process.env.TWILIO_ACCOUNT_SID  = 'ACtest';
    process.env.TWILIO_AUTH_TOKEN   = 'token-test';
    process.env.TWILIO_FROM_NUMBER  = '+15005550006';
  });

  afterEach(() => {
    delete process.env.TWILIO_ACCOUNT_SID;
    delete process.env.TWILIO_AUTH_TOKEN;
    delete process.env.TWILIO_FROM_NUMBER;
  });

  it('retorna ok:true y llama setOtpHash con hash + expiry en el futuro', async () => {
    const { res, capturedHash, capturedExpiry } = await sendAndCaptureHash('req-send-1', '8112345678');
    expect(res.ok).toBe(true);
    expect(typeof capturedHash).toBe('string');
    expect(capturedHash.length).toBeGreaterThan(10);
    expect(capturedExpiry.getTime()).toBeGreaterThan(Date.now());
  });

  it('envia SMS via Twilio con numero MX (+52)', async () => {
    await sendOtp('req-send-2', '8112345678');
    expect(mockMessagesCreate).toHaveBeenCalledWith(expect.objectContaining({
      to: '+528112345678',
    }));
  });

  it('lanza si falta TWILIO_ACCOUNT_SID', async () => {
    delete process.env.TWILIO_ACCOUNT_SID;
    await expect(sendOtp('req-send-3', '8112345678')).rejects.toThrow();
  });
});

describe('verifyOtp', () => {
  const REQUEST_ID = 'req-verify-1';

  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.LANDING_OTP_MOCK_CODE;
    process.env.TWILIO_ACCOUNT_SID = 'ACtest';
    process.env.TWILIO_AUTH_TOKEN  = 'token-test';
    process.env.TWILIO_FROM_NUMBER = '+15005550006';
  });

  afterEach(() => {
    delete process.env.TWILIO_ACCOUNT_SID;
    delete process.env.TWILIO_AUTH_TOKEN;
    delete process.env.TWILIO_FROM_NUMBER;
    delete process.env.LANDING_OTP_MOCK_CODE;
  });

  it('acepta el codigo correcto y llama markOtpVerified', async () => {
    // Primero enviar para capturar el hash real
    mockSetOtpHash.mockClear();
    await sendOtp(REQUEST_ID, '8112345678');
    const [, capturedHash, capturedExpiry] = mockSetOtpHash.mock.calls[0] as [string, string, Date];

    mockGetById.mockResolvedValue({
      otp_hash:       capturedHash,
      otp_expires_at: capturedExpiry.toISOString(),
      otp_attempts:   0,
    });
    mockIncrementOtpAttempts.mockResolvedValue(1);

    // Extraemos el codigo del SMS enviado
    const smsBody: string = mockMessagesCreate.mock.calls[0][0].body;
    const match = smsBody.match(/:\s*(\d{6})\./);
    expect(match).toBeTruthy();
    const code = match![1];

    const res = await verifyOtp(REQUEST_ID, code);
    expect(res.ok).toBe(true);
    expect(mockMarkOtpVerified).toHaveBeenCalledWith(REQUEST_ID);
  });

  it('rechaza codigo incorrecto con reason wrong_code', async () => {
    mockGetById.mockResolvedValue({
      otp_hash:       'hash-invalido',
      otp_expires_at: new Date(Date.now() + 5 * 60_000).toISOString(),
      otp_attempts:   0,
    });
    mockIncrementOtpAttempts.mockResolvedValue(1);

    const res = await verifyOtp(REQUEST_ID, '000000');
    expect(res.ok).toBe(false);
    expect(res.reason).toBe('wrong_code');
  });

  it('rechaza si otp_hash es null', async () => {
    mockGetById.mockResolvedValue({
      otp_hash:       null,
      otp_expires_at: null,
      otp_attempts:   0,
    });

    const res = await verifyOtp(REQUEST_ID, '123456');
    expect(res.ok).toBe(false);
    expect(res.reason).toBe('wrong_code');
  });

  it('rechaza si el OTP esta expirado', async () => {
    mockGetById.mockResolvedValue({
      otp_hash:       'cualquier-hash',
      otp_expires_at: new Date(Date.now() - 1000).toISOString(), // ya expiró
      otp_attempts:   0,
    });

    const res = await verifyOtp(REQUEST_ID, '123456');
    expect(res.ok).toBe(false);
    expect(res.reason).toBe('expired');
  });

  it('rechaza si ya se superaron los intentos maximos', async () => {
    mockGetById.mockResolvedValue({
      otp_hash:       'cualquier-hash',
      otp_expires_at: new Date(Date.now() + 5 * 60_000).toISOString(),
      otp_attempts:   5, // ya en el maximo
    });

    const res = await verifyOtp(REQUEST_ID, '123456');
    expect(res.ok).toBe(false);
    expect(res.reason).toBe('too_many_attempts');
  });

  it('LANDING_OTP_MOCK_CODE permite bypass sin verificar hash', async () => {
    process.env.LANDING_OTP_MOCK_CODE = '999999';
    // getById no necesita retornar hash valido
    mockGetById.mockResolvedValue({
      otp_hash:       'hash-no-importa',
      otp_expires_at: new Date(Date.now() + 5 * 60_000).toISOString(),
      otp_attempts:   0,
    });

    const res = await verifyOtp(REQUEST_ID, '999999');
    expect(res.ok).toBe(true);
    // No debe llamar markOtpVerified en bypass (o si lo hace, ok igual)
  });

  it('LANDING_OTP_MOCK_CODE no hace bypass si el codigo no coincide', async () => {
    process.env.LANDING_OTP_MOCK_CODE = '999999';
    mockGetById.mockResolvedValue({
      otp_hash:       'hash-invalido',
      otp_expires_at: new Date(Date.now() + 5 * 60_000).toISOString(),
      otp_attempts:   0,
    });
    mockIncrementOtpAttempts.mockResolvedValue(1);

    const res = await verifyOtp(REQUEST_ID, '111111'); // distinto al mock code
    expect(res.ok).toBe(false);
  });
});
