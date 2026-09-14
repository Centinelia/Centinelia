/**
 * withPortalAuth — helper único para portal API routes.
 *
 * Encapsula el patrón repetido en ~150 rutas de /api/portal:
 *  1. verifySession (con dev bypass preservado).
 *  2. Prod-strict: exige portal_email en session fuera de dev.
 *  3. Gating por rol: `requireOwner: true` rechaza sub-users con 403.
 *  4. Resolve org desde token de URL (scoping='token') o desde session
 *     (scoping='session' para rutas sin token en la URL como /agents/[id]).
 *  5. Cross-check case-insensitive del correo (session vs org).
 *  6. Carga del agente por `agentId` con verificación de pertenencia al org
 *     (defense-in-depth contra IDOR).
 *  7. Rate limit por portalEmail contra el limiter que se pase.
 *  8. Errores genéricos hacia afuera + log server-side.
 *
 * Uso:
 *
 *   export const PATCH = withPortalAuth(
 *     async (req, { agent, supabase, org, agentId }) => {
 *       const body = await req.json().catch(() => null);
 *       // ... lógica de la ruta
 *       return NextResponse.json({ ok: true });
 *     },
 *     {
 *       requireOwner: true,
 *       rateLimit:    'configWrite',
 *       loadAgent:    true,
 *       agentSelect:  'id, portal_email, features',
 *     },
 *   );
 *
 * Para rutas /api/portal/agents/[id]/... (sin `[token]`), usa:
 *   withPortalAuth(handler, { scoping: 'session', loadAgent: true, agentIdParam: 'id' })
 */

import { NextRequest, NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';
import { resolveOrgFromToken, type ResolvedOrg } from '@/lib/portal/org-token';
import { limiters, rateLimit } from '@/lib/ratelimit';

export interface PortalAuthSession {
  portalEmail: string;
  isSubUser:   boolean;
  userId?:     string;
  modules?:    string[];
}

export interface PortalAuthContext<TAgent = Record<string, unknown>> {
  session:  PortalAuthSession;
  supabase: SupabaseClient;
  /** Org resuelto — solo presente cuando scoping='token'. Con scoping='session'
   *  es sintético: portalEmail viene de la sesión, sin resolveOrgFromToken. */
  org:      { portalEmail: string; orgToken: string | null; legacy: boolean };
  agent:    TAgent | null;
  token:    string | null;
  agentId:  string | null;
}

export interface WithPortalAuthOptions {
  /**
   * 'token'   — Se espera `params.token`. Resuelve org via resolveOrgFromToken.
   * 'session' — No hay token en URL. El scoping viene de session.portalEmail.
   * Default: 'token'.
   */
  scoping?:         'token' | 'session';

  /** Bloquea sub-users con 403. Default false. */
  requireOwner?:    boolean;

  /** Nombre del limiter en `limiters`. Si se omite, no aplica rate limit. */
  rateLimit?:       keyof typeof limiters;

  /** Prefijo del key de rate limit (concatena `${prefix}:${portalEmail}`). */
  rateLimitPrefix?: string;

  /** Carga el agente identificado por `params[agentIdParam]`. */
  loadAgent?:       boolean;

  /** Columnas para `select()` al cargar el agente. Default '*'. */
  agentSelect?:     string;

  /** Nombre del param donde vive el agent id. Default 'agentId'. */
  agentIdParam?:    'agentId' | 'id';
}

type ParamsShape = { token?: string; agentId?: string; id?: string };

export function withPortalAuth<TAgent = Record<string, unknown>>(
  handler: (
    req: NextRequest,
    ctx: PortalAuthContext<TAgent>,
  ) => Promise<NextResponse> | NextResponse,
  opts: WithPortalAuthOptions = {},
) {
  const {
    scoping         = 'token',
    requireOwner    = false,
    rateLimit: rlKey,
    rateLimitPrefix = 'portal',
    loadAgent       = false,
    agentSelect     = '*',
    agentIdParam    = 'agentId',
  } = opts;

  return async function wrapped(
    req: NextRequest,
    { params }: { params: Promise<ParamsShape> },
  ): Promise<NextResponse> {
    try {
      const resolvedParams = await params;
      const token   = resolvedParams.token ?? null;
      const agentId = resolvedParams[agentIdParam] ?? null;

      // 1. Session
      const cookie  = req.cookies.get(PORTAL_COOKIE)?.value ?? '';
      const session = await verifySession(cookie);
      if (!session) {
        return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
      }

      // 2. Prod-strict
      if (!session.portalEmail && process.env.NODE_ENV !== 'development') {
        return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
      }

      // 3. Rol
      if (requireOwner && session.isSubUser) {
        return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
      }

      // 4. Resolve org
      const supabase = createAdminClient();
      let org: PortalAuthContext<TAgent>['org'];

      if (scoping === 'token') {
        if (!token) {
          return NextResponse.json({ error: 'Token faltante' }, { status: 400 });
        }
        const resolved: ResolvedOrg | null = await resolveOrgFromToken(token);
        if (!resolved?.portalEmail) {
          return NextResponse.json({ error: 'No encontrado' }, { status: 404 });
        }
        // 5. Cross-check case-insensitive
        if (
          session.portalEmail &&
          resolved.portalEmail.toLowerCase() !== session.portalEmail.toLowerCase()
        ) {
          return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
        }
        org = {
          portalEmail: resolved.portalEmail,
          orgToken:    resolved.orgToken,
          legacy:      resolved.legacy,
        };
      } else {
        // scoping='session' — el portalEmail viene de la sesión.
        if (!session.portalEmail && process.env.NODE_ENV !== 'development') {
          return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
        }
        org = {
          portalEmail: session.portalEmail,
          orgToken:    null,
          legacy:      false,
        };
      }

      // 6. Load agent (defense-in-depth por portal_email)
      let agent: TAgent | null = null;
      if (loadAgent) {
        if (!agentId) {
          return NextResponse.json({ error: 'agent_id faltante' }, { status: 400 });
        }

        let query = supabase.from('voice_agents').select(agentSelect).eq('id', agentId);

        // En scoping='session' con sesión sin portalEmail (dev bypass), no
        // filtramos — ver [[feedback-dev-bypass]]. En prod session.portalEmail
        // ya está garantizado por el step 2.
        if (org.portalEmail) {
          query = query.eq('portal_email', org.portalEmail);
        }

        const { data, error } = await query.maybeSingle() as {
          data: TAgent & { portal_email?: string } | null;
          error: unknown;
        };

        if (error) {
          console.error('[withPortalAuth] load agent failed:', error);
          return NextResponse.json({ error: 'Error al cargar' }, { status: 500 });
        }
        if (!data) {
          return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
        }
        // Extra check por si agentSelect no incluye portal_email pero tenemos org:
        // si el select lo trae y no matchea case-insensitive, es forbidden.
        const dataEmail = (data as { portal_email?: string }).portal_email;
        if (
          org.portalEmail &&
          dataEmail &&
          dataEmail.toLowerCase() !== org.portalEmail.toLowerCase()
        ) {
          return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
        }

        agent = data as TAgent;
      }

      // 7. Rate limit (después de auth para no dar señales a atacantes)
      if (rlKey) {
        const limiter = limiters[rlKey];
        const key = `${rateLimitPrefix}:${org.portalEmail || 'dev'}`;
        const rl = await rateLimit(req, limiter, key);
        if (rl) return rl;
      }

      // 8. Delegar al handler
      return await handler(req, {
        session:  session as PortalAuthSession,
        supabase,
        org,
        agent,
        token,
        agentId,
      });
    } catch (err) {
      console.error('[withPortalAuth] unhandled error:', err);
      return NextResponse.json({ error: 'Error inesperado' }, { status: 500 });
    }
  };
}
