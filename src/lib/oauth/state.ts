/**
 * D-Q4: random state nonce en cookie httpOnly para OAuth flows.
 *
 * Defense-in-depth contra el escenario:
 *   1. User A inicia OAuth (QB/Gmail/Outlook/etc) desde su portal.
 *   2. Attacker persuade a User A (via phishing, tabnabbing) a hacer click en
 *      un link fabricado /api/qb-oauth/callback?code=<attacker>&state=<userA>.
 *   3. Sin nonce check: callback intercambia el code del ATTACKER por tokens
 *      → guarda credentials QB del attacker en la cuenta de User A.
 *   4. Con nonce check: callback verifica cookie oauth_state matches el nonce
 *      del state URL. Si no matchea (attacker no pasó por initiate), rechaza.
 *
 * Complementa el session-match gate añadido en F17 (que protege contra
 * attacker CON solo el portal_token pero SIN sesión activa). Este nonce cubre
 * el caso donde la sesión sí existe pero el initiate no ocurrió legítimamente.
 *
 * Diseño:
 *   - initiate: generar nonce random (24-byte base64url), setear cookie
 *     httpOnly `oauth_state=${provider}:${nonce}` TTL 15min, retornar
 *     `${portalToken}.${nonce}` para incluir en state URL.
 *   - callback: extraer nonce del state, comparar contra cookie. Si no
 *     coincide → rechazo. Cookie se limpia post-verify (single-use).
 *
 * Compat backwards: si `state` no tiene `.nonce` (formato viejo), aceptamos
 * (rollout gradual — logueamos warning). Después de N días con métricas
 * cero, hacer enforce estricto.
 */
import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'crypto';

const COOKIE_NAME = 'oauth_state';
const TTL_SECONDS = 15 * 60;

export function issueOAuthState(
  res:         NextResponse,
  provider:    string,
  portalToken: string,
): string {
  const nonce = randomBytes(24).toString('base64url');
  res.cookies.set(COOKIE_NAME, `${provider}:${nonce}`, {
    httpOnly: true,
    secure:   process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path:     '/',
    maxAge:   TTL_SECONDS,
  });
  return `${portalToken}.${nonce}`;
}

export interface VerifyResult {
  ok:          boolean;
  portalToken: string | null;
  reason?:     'no_cookie' | 'nonce_mismatch' | 'malformed_state';
  legacy?:     boolean;  // true si state no tiene formato .nonce (aceptado durante rollout)
}

export function verifyOAuthState(
  req:      NextRequest,
  provider: string,
  received: string,
): VerifyResult {
  // Formato viejo (backward compat): state = portal_token (sin .nonce).
  // Aceptamos + marcamos legacy=true (log warning en el caller).
  if (!received.includes('.')) {
    return { ok: true, portalToken: received, legacy: true };
  }

  const [portalToken, receivedNonce] = received.split('.');
  if (!portalToken || !receivedNonce) {
    return { ok: false, portalToken: null, reason: 'malformed_state' };
  }

  const cookieVal = req.cookies.get(COOKIE_NAME)?.value ?? '';
  if (!cookieVal) {
    return { ok: false, portalToken, reason: 'no_cookie' };
  }

  const [cookieProvider, cookieNonce] = cookieVal.split(':');
  if (cookieProvider !== provider || cookieNonce !== receivedNonce) {
    return { ok: false, portalToken, reason: 'nonce_mismatch' };
  }

  return { ok: true, portalToken };
}

export function clearOAuthState(res: NextResponse): void {
  res.cookies.set(COOKIE_NAME, '', { path: '/', maxAge: 0 });
}
