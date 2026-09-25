// Portal Agent Missions — POST execute (manual trigger).
//
// POST /api/portal/[token]/agent-missions/[id]/execute
//   Dispara manualmente la ejecución de una misión programada.
//   Retorna 202 Accepted con { runId } una vez iniciada la ejecución async.
//
// Seguridad PAC-1:
// - IDOR check: task.portal_email debe coincidir con el portal del token.

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';
import { resolveOrgFromToken } from '@/lib/portal/org-token';
import { executeTask } from '@/lib/agent-tasks/executor';

interface Params { params: Promise<{ token: string; id: string }> }

// ─── POST /execute ────────────────────────────────────────────────────────────
export async function POST(_req: NextRequest, { params }: Params) {
  const { token, id } = await params;
  const cookieStore = await cookies();
  const session = await verifySession(cookieStore.get(PORTAL_COOKIE)?.value ?? '');
  if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const resolved = await resolveOrgFromToken(token);
  if (!resolved) return NextResponse.json({ error: 'Portal no encontrado' }, { status: 404 });
  if (session.portalEmail !== resolved.portalEmail) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }

  // IDOR check: verificar que la misión pertenece a este portal
  const supabase = createAdminClient();
  const { data: taskRow } = await supabase
    .from('agent_tasks')
    .select('portal_email')
    .eq('id', id)
    .maybeSingle();

  if (!taskRow) return NextResponse.json({ error: 'Misión no encontrada' }, { status: 404 });
  if ((taskRow.portal_email as string) !== resolved.portalEmail) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }

  try {
    const result = await executeTask({ taskId: id, triggerSource: 'manual' });
    return NextResponse.json({ runId: result.runId, status: result.status }, { status: 202 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Error al ejecutar la misión: ${msg}` }, { status: 500 });
  }
}
