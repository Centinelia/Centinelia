import { getMeefiUser, type MeefiUser } from '../fixtures/meefi-users';

export async function executeMeefiLookupUserAccount(
  _ctx: any,
  input: { email: string },
): Promise<{ ok: true; user: MeefiUser } | { ok: false; reason: string; email: string }> {
  const user = getMeefiUser(input.email);
  if (!user) return { ok: false, reason: 'user_not_found', email: input.email };
  return { ok: true, user };
}
