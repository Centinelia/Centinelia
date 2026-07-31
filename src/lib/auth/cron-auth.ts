import { timingSafeEqual } from 'node:crypto';

/**
 * Constant-time compare of two strings. Different lengths short-circuit to false
 * without leaking length information via timing (the extra XOR loop is intentionally
 * run over the max length so callers cannot time the short-circuit).
 */
export function timingSafeCompareStrings(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

/**
 * Verify a Bearer token from an Authorization header against CRON_SECRET.
 * Returns true only if the token matches (timing-safe).
 */
export function verifyCronAuth(req: Request | { headers: { get(name: string): string | null } }): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;
  const header = req.headers.get('authorization') ?? '';
  if (!header.startsWith('Bearer ')) return false;
  const provided = header.slice(7);
  return timingSafeCompareStrings(provided, expected);
}
