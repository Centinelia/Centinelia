// Portal Agent Rules — GET (single) + PATCH (update) + DELETE.
//
// GET    /api/portal/[token]/agent-rules/[id]
//   Retorna una regla por ID verificando que pertenece al org del token.
//
// PATCH  /api/portal/[token]/agent-rules/[id]
//   Actualiza campos de la regla. Body JSON: { regla?, detalles?, applies_to?, active? }.
//   Sin cobro (editar = 0 ops, ver spec 8.3).
//
// DELETE /api/portal/[token]/agent-rules/[id]
//   Elimina la regla. Sin cobro.
//
// Seguridad PAC-1:
// - IDOR check: se verifica que la regla.portal_email coincida con el org del token.
// - Nunca se expone ni modifica la regla si el portal_email no coincide.

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';
import { resolveOrgFromToken } from '@/lib/portal/org-token';
import { updateRule, deleteRule } from '@/lib/agent-rules/service';

interface Params { params: Promise<{ token: string; id: string }> }

// ─── Función auxiliar: verificar ownership de la regla ────────────────────────
async function verifyRuleOwnership(
  ruleId: string,
  portalEmail: string,
): Promise<{ owned: boolean; notFound?: boolean }> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('agent_rules')
    .select('portal_email')
    .eq('id', ruleId)
    .maybeSingle();

  if (error) return { owned: false };
  if (!data) return { owned: false, notFound: true };
  return { owned: (data.portal_email as string) === portalEmail };
}

// ─── GET ─────────────────────────────────────────────────────────────────────
export async function GET(_req: NextRequest, { params }: Params) {
  const { token, id } = await params;
  const cookieStore = await cookies();
  const session = await verifySession(cookieStore.get(PORTAL_COOKIE)?.value ?? '');
  if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const resolved = await resolveOrgFromToken(token);
  if (!resolved) return NextResponse.json({ error: 'Portal no encontrado' }, { status: 404 });
  if (session.portalEmail !== resolved.portalEmail) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('agent_rules')
    .select('*')
    .eq('id', id)
    .eq('portal_email', resolved.portalEmail) // IDOR guard inline
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data)  return NextResponse.json({ error: 'Regla no encontrada' }, { status: 404 });

  return NextResponse.json({ rule: data });
}

// ─── PATCH ───────────────────────────────────────────────────────────────────
export async function PATCH(req: NextRequest, { params }: Params) {
  const { token, id } = await params;
  const cookieStore = await cookies();
  const session = await verifySession(cookieStore.get(PORTAL_COOKIE)?.value ?? '');
  if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const resolved = await resolveOrgFromToken(token);
  if (!resolved) return NextResponse.json({ error: 'Portal no encontrado' }, { status: 404 });
  if (session.portalEmail !== resolved.portalEmail) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }

  // IDOR check antes de modificar
  const { owned, notFound } = await verifyRuleOwnership(id, resolved.portalEmail);
  if (notFound) return NextResponse.json({ error: 'Regla no encontrada' }, { status: 404 });
  if (!owned)   return NextResponse.json({ error: 'No autorizado' }, { status: 403 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'JSON inválido en el cuerpo de la solicitud' }, { status: 400 });
  }

  const patch: Record<string, unknown> = {};
  if (typeof body.regla      === 'string')  patch.regla      = body.regla;
  if (typeof body.detalles   === 'string')  patch.detalles   = body.detalles;
  if (body.detalles === null)               patch.detalles   = null;
  if (Array.isArray(body.applies_to))       patch.applies_to = body.applies_to as string[];
  if (typeof body.active     === 'boolean') patch.active     = body.active;

  try {
    const rule = await updateRule(id, patch as Parameters<typeof updateRule>[1]);
    return NextResponse.json({ rule });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// ─── DELETE ───────────────────────────────────────────────────────────────────
export async function DELETE(_req: NextRequest, { params }: Params) {
  const { token, id } = await params;
  const cookieStore = await cookies();
  const session = await verifySession(cookieStore.get(PORTAL_COOKIE)?.value ?? '');
  if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const resolved = await resolveOrgFromToken(token);
  if (!resolved) return NextResponse.json({ error: 'Portal no encontrado' }, { status: 404 });
  if (session.portalEmail !== resolved.portalEmail) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }

  // IDOR check antes de borrar
  const { owned, notFound } = await verifyRuleOwnership(id, resolved.portalEmail);
  if (notFound) return NextResponse.json({ error: 'Regla no encontrada' }, { status: 404 });
  if (!owned)   return NextResponse.json({ error: 'No autorizado' }, { status: 403 });

  try {
    await deleteRule(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
