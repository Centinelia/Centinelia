// Portal Agent Rules — GET (list) + POST (create).
//
// GET  /api/portal/[token]/agent-rules
//   Lista las reglas de operación del org. Opcionalmente filtra activas con ?active=true.
//   Requiere sesión de portal autenticada.
//
// POST /api/portal/[token]/agent-rules
//   Crea una nueva regla. Body JSON: { regla, detalles?, applies_to? }.
//   Cobra 1 op al agente primario del org (ledger reason: rule_setup).
//
// Seguridad PAC-1:
// - session.portalEmail debe coincidir con resolved.portalEmail (IDOR check).
// - No expone datos de otros orgs.

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';
import { resolveOrgFromToken } from '@/lib/portal/org-token';
import { listRulesForOrg, createRule } from '@/lib/agent-rules/service';

interface Params { params: Promise<{ token: string }> }

// ─── GET ─────────────────────────────────────────────────────────────────────
export async function GET(req: NextRequest, { params }: Params) {
  const { token } = await params;
  const cookieStore = await cookies();
  const session = await verifySession(cookieStore.get(PORTAL_COOKIE)?.value ?? '');
  if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const resolved = await resolveOrgFromToken(token);
  if (!resolved) return NextResponse.json({ error: 'Portal no encontrado' }, { status: 404 });
  if (session.portalEmail !== resolved.portalEmail) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }

  const activeOnly = req.nextUrl.searchParams.get('active') === 'true';

  try {
    const rules = await listRulesForOrg(resolved.portalEmail, { activeOnly });
    return NextResponse.json({ rules });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Error al listar reglas: ${msg}` }, { status: 500 });
  }
}

// ─── POST ────────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest, { params }: Params) {
  const { token } = await params;
  const cookieStore = await cookies();
  const session = await verifySession(cookieStore.get(PORTAL_COOKIE)?.value ?? '');
  if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const resolved = await resolveOrgFromToken(token);
  if (!resolved) return NextResponse.json({ error: 'Portal no encontrado' }, { status: 404 });
  if (session.portalEmail !== resolved.portalEmail) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'JSON inválido en el cuerpo de la solicitud' }, { status: 400 });
  }

  const regla      = typeof body.regla === 'string' ? body.regla : undefined;
  const detalles   = typeof body.detalles === 'string' ? body.detalles : undefined;
  const appliesTo  = Array.isArray(body.applies_to) ? (body.applies_to as string[]) : [];

  if (!regla) {
    return NextResponse.json({ error: 'El campo "regla" es obligatorio' }, { status: 400 });
  }

  try {
    const rule = await createRule({
      portalEmail: resolved.portalEmail,
      regla,
      detalles,
      applies_to:  appliesTo,
      created_by:  session.portalEmail,
    });
    return NextResponse.json({ rule }, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // Errores de validación son 400; errores de DB son 500
    const isValidationError = /no puede|no válido|caracteres/i.test(msg);
    return NextResponse.json(
      { error: msg },
      { status: isValidationError ? 400 : 500 },
    );
  }
}
