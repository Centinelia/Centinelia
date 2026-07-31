import { cookies } from 'next/headers';
import { timingSafeEqual } from 'node:crypto';

/**
 * Constant-time comparison of the admin cookie against ADMIN_SECRET.
 * Uses timingSafeEqual to avoid the tiny timing side-channel of `===`.
 * Buffers must be same length; different-length inputs short-circuit to false.
 */
export async function isAdmin(): Promise<boolean> {
  const store = await cookies();
  const provided = store.get('Centinelia_admin')?.value;
  const expected = process.env.ADMIN_SECRET;

  if (!provided || !expected) return false;

  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
