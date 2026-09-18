// Envio y verificacion de OTP via SMS (Twilio) para callback de landing.
// sendOtp genera un codigo de 6 digitos, lo hashea con HMAC-SHA256 y lo guarda.
// verifyOtp compara el hash y gestiona TTL + max intentos.
//
// Bypass para E2E (Task 24):
//   LANDING_OTP_MOCK_CODE=999999 → verifyOtp acepta ese codigo sin validar hash.
//   En prod NO se configura esta variable.

import twilio from 'twilio';
import crypto from 'crypto';
import { setOtpHash, incrementOtpAttempts, markOtpVerified, getById } from './callback-store';

const OTP_TTL_MIN      = 5;
const OTP_MAX_ATTEMPTS = 5;

/** Hashea un codigo con HMAC-SHA256 usando el requestId como clave. */
function hashCode(code: string, requestId: string): string {
  return crypto.createHmac('sha256', requestId).update(code).digest('hex');
}

/** Genera un entero aleatorio de 6 digitos (100000–999999). */
function sixDigitCode(): string {
  return String(crypto.randomInt(100_000, 1_000_000));
}

function twilioClient() {
  const sid   = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token) throw new Error('twilio env missing: TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN');
  return twilio(sid, token);
}

/**
 * Genera y envia un OTP de 6 digitos al numero de telefono MX.
 * Asume que `phone` es un numero local (10 digitos) — prefija +52.
 */
export async function sendOtp(
  requestId: string,
  phone:     string,
): Promise<{ ok: boolean }> {
  const code      = sixDigitCode();
  const hash      = hashCode(code, requestId);
  const expiresAt = new Date(Date.now() + OTP_TTL_MIN * 60_000);

  await setOtpHash(requestId, hash, expiresAt);

  await twilioClient().messages.create({
    to:   `+52${phone}`,
    from: process.env.TWILIO_FROM_NUMBER!,
    body: `Tu código Centinelia: ${code}. Válido ${OTP_TTL_MIN} minutos.`,
  });

  return { ok: true };
}

/**
 * Verifica el OTP enviado al usuario.
 *
 * Orden de validacion:
 * 1. Mock bypass (solo si LANDING_OTP_MOCK_CODE esta seteado y coincide).
 * 2. Hash ausente → wrong_code.
 * 3. Expirado → expired.
 * 4. Demasiados intentos (ya en limite sin incrementar) → too_many_attempts.
 * 5. Incrementa atomicamente; si supera el limite → too_many_attempts.
 * 6. Compara hash → wrong_code o marca verificado.
 */
export async function verifyOtp(
  requestId:     string,
  submittedCode: string,
): Promise<{ ok: boolean; reason?: 'expired' | 'too_many_attempts' | 'wrong_code' }> {
  // Bypass para tests E2E — nunca activo en prod
  const mockCode = process.env.LANDING_OTP_MOCK_CODE;
  if (mockCode && submittedCode === mockCode) {
    return { ok: true };
  }

  const req = await getById(requestId);
  if (!req?.otp_hash || !req.otp_expires_at) {
    return { ok: false, reason: 'wrong_code' };
  }

  if (new Date(req.otp_expires_at) < new Date()) {
    return { ok: false, reason: 'expired' };
  }

  if (req.otp_attempts >= OTP_MAX_ATTEMPTS) {
    return { ok: false, reason: 'too_many_attempts' };
  }

  // Incrementa atomicamente antes de comparar para evitar race conditions
  const newAttempts = await incrementOtpAttempts(requestId);
  if (newAttempts > OTP_MAX_ATTEMPTS) {
    return { ok: false, reason: 'too_many_attempts' };
  }

  const expectedHash = hashCode(submittedCode, requestId);
  if (expectedHash !== req.otp_hash) {
    return { ok: false, reason: 'wrong_code' };
  }

  await markOtpVerified(requestId);
  return { ok: true };
}
