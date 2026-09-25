// Portal Agent Missions — GET (list per portal) + POST (create).
//
// GET  /api/portal/[token]/agent-missions
//   Lista las tareas programadas (misiones) del portal.
//   Parámetros opcionales:
//     ?active=true     — solo activas
//     ?agent_id=<uuid> — filtrar por agente específico
//
// POST /api/portal/[token]/agent-missions
//   Crea una nueva misión. Body JSON: { ownerAgentId, slug, mission, trigger_type,
//   trigger_config, deliverable, parameters? }.
//   Cobra 1 op al owner agent (ledger reason: task_setup).
//
// Seguridad PAC-1:
// - session.portalEmail debe coincidir con resolved.portalEmail (IDOR check).
// - owner_agent_id se verifica contra el portal del token.

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';
import { resolveOrgFromToken } from '@/lib/portal/org-token';
import { listTasksForPortal, listTasksForAgent, createTask } from '@/lib/agent-tasks/service';

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
  const agentId    = req.nextUrl.searchParams.get('agent_id');

  try {
    const tasks = agentId
      ? await listTasksForAgent(agentId, { activeOnly })
      : await listTasksForPortal(resolved.portalEmail, { activeOnly });

    return NextResponse.json({ tasks });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Error al listar misiones: ${msg}` }, { status: 500 });
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

  const ownerAgentId  = typeof body.ownerAgentId   === 'string' ? body.ownerAgentId   : undefined;
  const slug          = typeof body.slug            === 'string' ? body.slug            : undefined;
  const mission       = typeof body.mission         === 'string' ? body.mission         : undefined;
  const triggerType   = typeof body.trigger_type    === 'string' ? body.trigger_type    : undefined;
  const triggerConfig = typeof body.trigger_config  === 'object' && body.trigger_config !== null
    ? (body.trigger_config as Record<string, unknown>) : {};
  const deliverable   = typeof body.deliverable     === 'string' ? body.deliverable     : undefined;
  const parameters    = typeof body.parameters      === 'string' ? body.parameters      : undefined;

  if (!ownerAgentId) return NextResponse.json({ error: 'El campo "ownerAgentId" es obligatorio' }, { status: 400 });
  if (!slug)         return NextResponse.json({ error: 'El campo "slug" es obligatorio' }, { status: 400 });
  if (!mission)      return NextResponse.json({ error: 'El campo "mission" es obligatorio' }, { status: 400 });
  if (!triggerType)  return NextResponse.json({ error: 'El campo "trigger_type" es obligatorio' }, { status: 400 });
  if (!['cron', 'manual', 'phrase'].includes(triggerType)) {
    return NextResponse.json({ error: 'trigger_type debe ser cron, manual o phrase' }, { status: 400 });
  }
  if (!deliverable) return NextResponse.json({ error: 'El campo "deliverable" es obligatorio' }, { status: 400 });

  try {
    const task = await createTask({
      portalEmail:    resolved.portalEmail,
      ownerAgentId,
      slug,
      mission,
      trigger_type:   triggerType as 'cron' | 'manual' | 'phrase',
      trigger_config: triggerConfig,
      deliverable,
      parameters,
      created_by:     session.portalEmail,
    });
    return NextResponse.json({ task }, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const isValidationError = /no puede|no válido|inválid|obligatorio|slug|misión|entregable|caracteres|cron|phrases/i.test(msg);
    return NextResponse.json({ error: msg }, { status: isValidationError ? 400 : 500 });
  }
}
