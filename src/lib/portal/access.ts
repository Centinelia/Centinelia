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
import { createAdminClient } from '@/lib/supabase/admin';

export interface RequireAccessOpts {
  module?:    string | string[];  // uno o varios módulos (OR)
  ownerOnly?: boolean;             // rechaza sub-users incluso si tienen el módulo
}

export type AccessResult =
  | { ok: true;  session: SessionResult }
  | { ok: false; response: NextResponse };

// Cache in-memory de portal_users freshness. TTL 30s balancea:
//   - JWT stale (owner cambia permisos, se aplica en ≤30s en vez de 7 días)
//   - DELETE sub-user (sesión invalidada en ≤30s)
//   - carga de DB (evita SELECT por request cuando el sub-user hace burst)
// La entrada guarda modules y exists; si el sub-user desapareció, exists=false
// y todas sus requests fallan hasta que TTL expire y confirme (defense in depth).
const SUBUSER_CACHE_TTL_MS = 30_000;
interface SubUserFreshness { modules: string[]; exists: boolean; ts: number }
const subUserFreshCache = new Map<string, SubUserFreshness>();

async function refreshSubUserFromDb(userId: string, portalEmail: string): Promise<SubUserFreshness> {
  const cached = subUserFreshCache.get(userId);
  const now    = Date.now();
  if (cached && now - cached.ts < SUBUSER_CACHE_TTL_MS) return cached;
  const supabase = createAdminClient();
  const { data } = await supabase
    .from('portal_users')
    .select('modules, portal_email')
    .eq('id', userId)
    .maybeSingle();
  const fresh: SubUserFreshness = {
    exists:  !!data && data.portal_email === portalEmail,
    modules: (data?.modules as string[] | null) ?? [],
    ts:      now,
  };
  subUserFreshCache.set(userId, fresh);
  return fresh;
}

export async function requirePortalAccess(
  req:  NextRequest,
  opts: RequireAccessOpts = {},
): Promise<AccessResult> {
  const cookie  = req.cookies.get(PORTAL_COOKIE)?.value ?? '';
  const session = await verifySession(cookie);
  if (!session) {
    return { ok: false, response: NextResponse.json({ error: 'No autenticado' }, { status: 401 }) };
  }

  // JWT freshness re-check (Scope D3 Race R-1 + R-2): sin esto el JWT snapshot
  // de modules queda válido 7 días. Cambio de permisos o DELETE del sub-user
  // no se aplican hasta expiración → ex-empleado retiene acceso 7 días.
  let effectiveSession: SessionResult = session;
  if (session.isSubUser && session.userId) {
    const fresh = await refreshSubUserFromDb(session.userId, session.portalEmail);
    if (!fresh.exists) {
      return { ok: false, response: NextResponse.json({ error: 'Tu cuenta fue removida del equipo. Contacta al dueño.' }, { status: 401 }) };
    }
    effectiveSession = { ...session, modules: fresh.modules };
  }

  if (opts.ownerOnly && effectiveSession.isSubUser) {
    return { ok: false, response: NextResponse.json({ error: 'Solo el dueño de la cuenta puede realizar esta acción.' }, { status: 403 }) };
  }

  if (opts.module && effectiveSession.isSubUser) {
    const required = Array.isArray(opts.module) ? opts.module : [opts.module];
    const mods     = effectiveSession.modules ?? [];
    if (!required.some(m => mods.includes(m))) {
      const nice = required.length === 1 ? `"${required[0]}"` : `[${required.join(', ')}]`;
      return { ok: false, response: NextResponse.json({ error: `Sin acceso al módulo ${nice}. Pide al dueño de la cuenta que te habilite el permiso.` }, { status: 403 }) };
    }
  }

  return { ok: true, session: effectiveSession };
}

/** Invalida el cache de un sub-user tras UPDATE/DELETE de sus permisos.
 *  Llamar desde /users/[id] PATCH y DELETE para que el próximo request refresque. */
export function invalidateSubUserCache(userId: string): void {
  subUserFreshCache.delete(userId);
}
