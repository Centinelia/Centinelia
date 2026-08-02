// Admin auth helper compartido. Encapsula el patrón de cookie Centinelia_admin
// + timingSafeEqual vs ADMIN_SECRET para no duplicarlo en cada route.

import { cookies } from 'next/headers';
import { timingSafeEqual } from 'crypto';

export async function isAdminRequest(): Promise<boolean> {
  const store = await cookies();
  const secret = store.get('Centinelia_admin')?.value;
  const expected = process.env.ADMIN_SECRET;
  if (!secret || !expected) return false;
  const a = Buffer.from(secret);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

// Retorna el email del admin activo (para audit/created_by). Por ahora fijo,
// eventualmente se puede leer de la sesión si migramos a multi-admin.
export function adminActor(): string {
  return process.env.ADMIN_ACTOR_EMAIL ?? 'admin@centinelia.mx';
}
