/**
 * Portal API access guard. Reemplaza el patrón anti-DRY de
 *   const session = await verifySession(cookie);
 *   if (!session) return 401;
 *   if (session.isSubUser && !session.modules?.includes('X')) return 403;
 *
 * Motivación (Scope D3): solo 11 de 143 rutas API replicaban el gate por
 * módulo. Cualquier sub-user con módulos mínimos podía fabricar `fetch` desde
 * devtools console y escalar privilegios (cambiar plan del owner, editar
 * prompts de empleados, lanzar campañas salientes que vacían el pool, etc.).
 *
 * Uso:
 *   const gate = await requirePortalAccess(req, { module: 'cuenta' });
 *   if (!gate.ok) return gate.response;
 *   const { session } = gate;
 *   // session.portalEmail, session.isSubUser, etc.
 *
 * Owner-only para operaciones destructivas irreversibles con la tarjeta
 * del owner (change-plan, buy-minutes, buy-ops, auto-refill):
 *   await requirePortalAccess(req, { ownerOnly: true })
 */
import { NextRequest, NextResponse } from 'next/server';
import { PORTAL_COOKIE, verifySession, type SessionResult } from './auth';

export interface RequireAccessOpts {
  module?:    string | string[];  // uno o varios módulos (OR)
  ownerOnly?: boolean;             // rechaza sub-users incluso si tienen el módulo
}

export type AccessResult =
  | { ok: true;  session: SessionResult }
  | { ok: false; response: NextResponse };

export async function requirePortalAccess(
  req:  NextRequest,
  opts: RequireAccessOpts = {},
): Promise<AccessResult> {
  const cookie  = req.cookies.get(PORTAL_COOKIE)?.value ?? '';
  const session = await verifySession(cookie);
  if (!session) {
    return { ok: false, response: NextResponse.json({ error: 'No autenticado' }, { status: 401 }) };
  }

  if (opts.ownerOnly && session.isSubUser) {
    return { ok: false, response: NextResponse.json({ error: 'Solo el dueño de la cuenta puede realizar esta acción.' }, { status: 403 }) };
  }

  if (opts.module && session.isSubUser) {
    const required = Array.isArray(opts.module) ? opts.module : [opts.module];
    const mods     = session.modules ?? [];
    if (!required.some(m => mods.includes(m))) {
      const nice = required.length === 1 ? `"${required[0]}"` : `[${required.join(', ')}]`;
      return { ok: false, response: NextResponse.json({ error: `Sin acceso al módulo ${nice}. Pide al dueño de la cuenta que te habilite el permiso.` }, { status: 403 }) };
    }
  }

  return { ok: true, session };
}
