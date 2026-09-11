import { getMeefiUser, type MeefiUser } from '../fixtures/meefi-users';

// Semántica ok=true con outcome vs ok=false: ver comment en meefi-search-help-center.ts.
// "usuario no encontrado" es respuesta legítima, no error técnico.
export async function executeMeefiLookupUserAccount(
  _ctx: any,
  input: { email: string },
): Promise<
  | { ok: true; outcome: 'found'; user: MeefiUser }
  | { ok: true; outcome: 'user_not_found'; email: string }
> {
  const user = getMeefiUser(input.email);
  if (!user) return { ok: true, outcome: 'user_not_found', email: input.email };
  return { ok: true, outcome: 'found', user };
}
