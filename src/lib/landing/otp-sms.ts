// Envío y verificación de OTP via Twilio Verify API para callback de landing.
//
// Twilio Verify es un servicio dedicado de OTP: maneja envío, retries, TTL,
// rate limiting y bloqueo de fraude. No usamos hash local ni tabla — Twilio
// mantiene el estado del código.
//
// Requisitos en env:
//   - TWILIO_ACCOUNT_SID
//   - TWILIO_AUTH_TOKEN
//   - TWILIO_VERIFY_SERVICE_SID (crear en console.twilio.com → Verify → Services)
//
// Bypass para E2E:
//   LANDING_OTP_MOCK_CODE=999999 → verifyOtp acepta ese código sin llamar a Twilio.
//   En prod NO se configura.

import twilio from 'twilio';
import { markOtpVerified } from './callback-store';

function twilioClient() {
  const sid   = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token) throw new Error('twilio env missing: TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN');
  return twilio(sid, token);
}

function verifyServiceSid(): string {
  const sid = process.env.TWILIO_VERIFY_SERVICE_SID;
  if (!sid) throw new Error('twilio env missing: TWILIO_VERIFY_SERVICE_SID');
  return sid;
}

/**
 * Envía un OTP por SMS al número MX del prospect via Twilio Verify.
 * Twilio Verify:
 *  - Genera el código (6 dígitos, TTL default 10 min)
 *  - Envía SMS desde sender pool (alfanumérico si posible, ej. "VERIFY" o "Centinelia")
 *  - Formatea el SMS con Web OTP API compatible para auto-fill en iOS/Android
 *  - Maneja rate limiting propio + fraud detection
 *
 * requestId no se usa aquí (Twilio maneja el estado por `to`), pero se conserva
 * en la firma para compatibilidad con el resto del pipeline.
 */
export async function sendOtp(
  _requestId: string,
  phone:      string,
): Promise<{ ok: boolean }> {
  await twilioClient()
    .verify.v2.services(verifyServiceSid())
    .verifications.create({
      to:      `+52${phone}`,
      channel: 'sms',
    });
  return { ok: true };
}

/**
 * Verifica el OTP contra Twilio Verify.
 *
 * Orden:
 * 1. Mock bypass (solo si LANDING_OTP_MOCK_CODE está seteado y coincide).
 * 2. Consulta a Twilio Verify vía verificationChecks.
 * 3. Si Twilio dice `approved` → marca en DB y retorna ok.
 * 4. Si Twilio devuelve error o status distinto → mapea a razón.
 */
export async function verifyOtp(
  requestId:     string,
  submittedCode: string,
): Promise<{ ok: boolean; reason?: 'expired' | 'too_many_attempts' | 'wrong_code' }> {
  // Bypass para tests E2E — nunca activo en prod
  const mockCode = process.env.LANDING_OTP_MOCK_CODE;
  if (mockCode && submittedCode === mockCode) {
    await markOtpVerified(requestId).catch(() => {});
    return { ok: true };
  }

  const { phone } = await getPhoneForRequest(requestId);
  if (!phone) {
    return { ok: false, reason: 'wrong_code' };
  }

  try {
    const check = await twilioClient()
      .verify.v2.services(verifyServiceSid())
      .verificationChecks.create({
        to:   `+52${phone}`,
        code: submittedCode,
      });

    if (check.status === 'approved') {
      await markOtpVerified(requestId);
      return { ok: true };
    }

    // Twilio devuelve 'pending' cuando el código no coincide (siempre que la
    // verificación no haya expirado o alcanzado el máximo de intentos).
    return { ok: false, reason: 'wrong_code' };
  } catch (err) {
    // Twilio devuelve HTTP 404 con code 20404 cuando la verificación expiró
    // o no existe (agotó max_attempts o pasó max_age, default 10 min).
    const e = err as Error & { code?: number; status?: number };
    if (e.code === 20404 || e.status === 404) {
      return { ok: false, reason: 'expired' };
    }
    // Rate limit / demasiados intentos.
    if (e.code === 60202 || e.code === 60203) {
      return { ok: false, reason: 'too_many_attempts' };
    }
    console.error('[verifyOtp] Twilio Verify error:', e.code, e.message);
    return { ok: false, reason: 'wrong_code' };
  }
}

// Helper: lee solo el phone de la solicitud (evita cargar la row completa).
async function getPhoneForRequest(requestId: string): Promise<{ phone: string | null }> {
  const { getById } = await import('./callback-store');
  const req = await getById(requestId);
  return { phone: req?.phone ?? null };
}
