import { cookies } from 'next/headers';

export async function isAdmin(): Promise<boolean> {
  const store = await cookies();
  return store.get('Centinelia_admin')?.value === process.env.ADMIN_SECRET;
}
