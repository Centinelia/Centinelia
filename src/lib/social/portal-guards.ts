/**
 * Guard compartido para endpoints /api/portal/[token]/social/**.
 *
 * Valida en una sola llamada:
 *   1. Sesión autenticada (cookie PORTAL_COOKIE → verifySession)
 *   2. Resolución de org desde token (resolveOrgFromToken)
 *   3. IDOR: session.portalEmail === resolved.portalEmail
 *   4. Feature flag: requireSocialFeature → 403 si enabled === false
 *
 * Retorna PortalSocialGuardResult si todo está OK, o NextResponse de error.
 */
import { NextRequest, NextResponse } from 'next/server';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';
import { resolveOrgFromToken } from '@/lib/portal/org-token';
import { requireSocialFeature } from '@/lib/feature-flags/social-publishing';
import { createAdminClient } from '@/lib/supabase/admin';
import type { SupabaseClient } from '@supabase/supabase-js';

export interface PortalSocialGuardResult {
  resolved: { portalEmail: string; orgToken: string; legacy: boolean };
  session: { portalEmail: string; isSubUser: boolean };
  supabase: SupabaseClient;
  agencyMode: boolean;
}

/**
 * Guard compartido para endpoints /api/portal/[token]/social/**.
 * Valida: sesión, resolución de org, IDOR (session-org match) y feature flag.
 * Retorna los helpers listos o un NextResponse de error.
 */
export async function guardPortalSocialRequest(
  req: NextRequest,
  token: string,
): Promise<PortalSocialGuardResult | NextResponse> {
  const cookie  = req.cookies.get(PORTAL_COOKIE)?.value ?? '';
  const session = await verifySession(cookie);
  if (!session) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  }

  const resolved = await resolveOrgFromToken(token);
  if (!resolved) {
    return NextResponse.json({ error: 'Portal no encontrado' }, { status: 404 });
  }

  if (session.portalEmail !== resolved.portalEmail) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }

  const feat = await requireSocialFeature(resolved.portalEmail);
  if (!feat.enabled) {
    return NextResponse.json(
      { error: 'Feature social publishing no habilitado para esta org' },
      { status: 403 },
    );
  }

  return {
    resolved,
    session,
    supabase:    createAdminClient(),
    agencyMode:  feat.agencyMode,
  };
}

/**
 * Type guard para distinguir NextResponse de error de PortalSocialGuardResult.
 */
export function isNextResponse(x: unknown): x is NextResponse {
  return x instanceof NextResponse;
}
