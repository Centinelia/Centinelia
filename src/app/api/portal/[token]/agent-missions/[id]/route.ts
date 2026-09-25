// Portal Agent Missions — GET (single) + PATCH (update) + DELETE.
//
// GET    /api/portal/[token]/agent-missions/[id]
//   Retorna una misión por ID verificando que pertenece al portal del token.
//
// PATCH  /api/portal/[token]/agent-missions/[id]
//   Actualiza campos de la misión. Body JSON: { mission?, trigger_config?,
//   deliverable?, parameters?, active? }.
//   Sin cobro (editar = 0 ops).
//
// DELETE /api/portal/[token]/agent-missions/[id]
//   Elimina la misión. Sin cobro.
//
// Seguridad PAC-1:
// - IDOR check: se verifica que task.portal_email coincida con el org del token.

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';
import { resolveOrgFromToken } from '@/lib/portal/org-token';
import { updateTask, deleteTask } from '@/lib/agent-tasks/service';

interface Params { params: Promise<{ token: string; id: string }> }

// ─── Función auxiliar: verificar ownership de la misión ──────────────────────
async function verifyTaskOwnership(
  taskId: string,
  portalEmail: string,
): Promise<{ owned: boolean; notFound?: boolean }> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('agent_tasks')
    .select('portal_email')
    .eq('id', taskId)
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
    .from('agent_tasks')
    .select('*')
    .eq('id', id)
    .eq('portal_email', resolved.portalEmail) // IDOR guard inline
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data)  return NextResponse.json({ error: 'Misión no encontrada' }, { status: 404 });

  return NextResponse.json({ task: data });
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
  const { owned, notFound } = await verifyTaskOwnership(id, resolved.portalEmail);
  if (notFound) return NextResponse.json({ error: 'Misión no encontrada' }, { status: 404 });
  if (!owned)   return NextResponse.json({ error: 'No autorizado' }, { status: 403 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'JSON inválido en el cuerpo de la solicitud' }, { status: 400 });
  }

  const patch: Record<string, unknown> = {};
  if (typeof body.slug           === 'string')  patch.slug           = body.slug;
  if (typeof body.mission        === 'string')  patch.mission        = body.mission;
  if (typeof body.trigger_config === 'object' && body.trigger_config !== null) patch.trigger_config = body.trigger_config;
  if (typeof body.deliverable    === 'string')  patch.deliverable    = body.deliverable;
  if (typeof body.parameters     === 'string')  patch.parameters     = body.parameters;
  if (body.parameters === null)                 patch.parameters     = null;
  if (typeof body.active         === 'boolean') patch.active         = body.active;

  try {
    const task = await updateTask(id, patch as Parameters<typeof updateTask>[1]);
    return NextResponse.json({ task });
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
  const { owned, notFound } = await verifyTaskOwnership(id, resolved.portalEmail);
  if (notFound) return NextResponse.json({ error: 'Misión no encontrada' }, { status: 404 });
  if (!owned)   return NextResponse.json({ error: 'No autorizado' }, { status: 403 });

  try {
    await deleteTask(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
