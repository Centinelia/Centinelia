export const PORTAL_COOKIE = 'Centinelia_portal';
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export interface SessionResult {
  portalEmail: string;
  isSubUser:   boolean;
  userId?:     string;
  modules?:    string[];  // undefined = owner (all access)
}

// ── Base64url helpers (Edge-compatible, no Buffer) ────────────────────────

function u8ToB64url(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlToU8(str: string): Uint8Array {
  const pad    = str.replace(/-/g, '+').replace(/_/g, '/');
  const padded = pad + '=='.slice(0, (4 - pad.length % 4) % 4);
  const bin    = atob(padded);
  return Uint8Array.from(bin, c => c.charCodeAt(0));
}

// ── Password hashing (PBKDF2 · 100k iterations · SHA-256) ────────────────

export async function hashPassword(password: string): Promise<string> {
  const salt   = crypto.getRandomValues(new Uint8Array(16));
  const keyMat = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits   = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: salt as unknown as ArrayBuffer, iterations: 100_000, hash: 'SHA-256' }, keyMat, 256);
  return `${u8ToB64url(salt)}.${u8ToB64url(new Uint8Array(bits))}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  try {
    const [saltB64, hashB64] = stored.split('.');
    const salt   = b64urlToU8(saltB64);
    const keyMat = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
    const bits   = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: salt as unknown as ArrayBuffer, iterations: 100_000, hash: 'SHA-256' }, keyMat, 256);
    return u8ToB64url(new Uint8Array(bits)) === hashB64;
  } catch {
    return false;
  }
}

// ── Session cookie (HMAC-SHA256 signed) ──────────────────────────────────

function secret() {
  const s = process.env.PORTAL_SESSION_SECRET;
  if (!s) throw new Error('PORTAL_SESSION_SECRET not set');
  return s;
}

async function hmacKey(use: 'sign' | 'verify') {
  return crypto.subtle.importKey('raw', new TextEncoder().encode(secret()), { name: 'HMAC', hash: 'SHA-256' }, false, [use]);
}

export async function createSession(portalEmail: string): Promise<string> {
  const exp  = Date.now() + SESSION_TTL_MS;
  const data = `${portalEmail}|${exp}`;
  const key  = await hmacKey('sign');
  const sig  = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data)));
  return `${data}.${u8ToB64url(sig)}`;
}

export async function createSubUserSession(portalEmail: string, userId: string, modules: string[]): Promise<string> {
  const exp     = Date.now() + SESSION_TTL_MS;
  const payload = JSON.stringify({ portalEmail, userId, modules, exp });
  const data    = `su:${u8ToB64url(new TextEncoder().encode(payload))}`;
  const key     = await hmacKey('sign');
  const sig     = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data)));
  return `${data}.${u8ToB64url(sig)}`;
}

async function verifySessionStrict(cookie: string): Promise<SessionResult | null> {
  try {
    const dot   = cookie.lastIndexOf('.');
    const data  = cookie.slice(0, dot);
    const sig   = b64urlToU8(cookie.slice(dot + 1));
    const key   = await hmacKey('verify');
    const valid = await crypto.subtle.verify('HMAC', key, sig as unknown as ArrayBuffer, new TextEncoder().encode(data));
    if (!valid) return null;

    if (data.startsWith('su:')) {
      const bytes   = b64urlToU8(data.slice(3));
      const parsed  = JSON.parse(new TextDecoder().decode(bytes)) as {
        portalEmail: string; userId: string; modules: string[]; exp: number;
      };
      if (parsed.exp < Date.now()) return null;
      return { portalEmail: parsed.portalEmail, isSubUser: true, userId: parsed.userId, modules: parsed.modules };
    }

    // Owner session (legacy format: portalEmail|exp)
    const [portalEmail, expStr] = data.split('|');
    if (parseInt(expStr) < Date.now()) return null;
    return { portalEmail, isSubUser: false };
  } catch {
    return null;
  }
}

/**
 * Verify portal session cookie.
 *
 * En producción: retorna null si el cookie no es válido (fuerza login).
 *
 * En desarrollo: si no hay sesión válida, devuelve una "sesión dev" para que
 * las API routes locales funcionen sin re-login cada 7 días. Empareja el
 * bypass del middleware (`proxy.ts` línea 47).
 *
 * El `portalEmail` de la dev session viene de `DEV_PORTAL_EMAIL` en
 * `.env.local` (setéalo al org que uses típicamente para desarrollo, ej.
 * `DEV_PORTAL_EMAIL=studio@pneumastudio.mx`). Con eso las Category B routes
 * (`.eq('portal_email', session.portalEmail)`) funcionan correctamente.
 * Sin la env, cae a `''` — los IDOR checks pattern
 * `if (session.portalEmail && agent.portal_email && session.portalEmail !== agent.portal_email)`
 * se saltan (short-circuit) pero los queries filtrados por portal_email
 * devuelven vacío.
 *
 * SEGURIDAD: nunca activo en producción — depende de NODE_ENV.
 */
export async function verifySession(cookie: string): Promise<SessionResult | null> {
  const strict = await verifySessionStrict(cookie);
  if (strict) return strict;
  if (process.env.NODE_ENV === 'development') {
    return {
      portalEmail: process.env.DEV_PORTAL_EMAIL ?? '',
      isSubUser:   false,
    };
  }
  return null;
}
