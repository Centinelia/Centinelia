import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';
import { resolveOrgFromToken } from '@/lib/portal/org-token';

export const dynamic = 'force-dynamic';

interface Params { params: Promise<{ token: string }> }

export async function GET(req: NextRequest, { params }: Params) {
  const cookie = req.cookies.get(PORTAL_COOKIE)?.value ?? '';
  const auth   = await verifySession(cookie);
  if (!auth) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const { token } = await params;
  const supabase = createAdminClient();

  const resolved = await resolveOrgFromToken(token);
  if (!resolved?.portalEmail) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const acct = { portal_email: resolved.portalEmail };
  if (!auth.portalEmail || auth.portalEmail !== acct.portal_email)
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });

  const statusParam   = req.nextUrl.searchParams.get('status') ?? 'awaiting_plan_approval';
  const statusesParam = req.nextUrl.searchParams.get('statuses');
  const statuses = statusesParam
    ? statusesParam.split(',').map(s => s.trim()).filter(Boolean)
    : [statusParam];

  const { data: tasks } = await supabase
    .from('agent_tasks')
    .select('id, title, description, assigned_to, created_by, created_at, plan, plan_approval_token, status, started_at, completed_at, success_criteria, current_iteration, max_iterations, goal_met, eval_notes, result, trigger_type')
    .eq('portal_email', acct.portal_email)
    .in('status', statuses)
    .order('created_at', { ascending: false })
    .limit(50);

  // Hidrata nombre del empleado asignado
  const assignedIds = Array.from(new Set((tasks ?? []).map(t => t.assigned_to as string | null).filter(Boolean))) as string[];
  const nameMap = new Map<string, string>();
  if (assignedIds.length) {
    const { data: agents } = await supabase
      .from('voice_agents')
      .select('id, agent_name')
      .in('id', assignedIds);
    for (const a of agents ?? []) nameMap.set(a.id as string, (a.agent_name as string | null) ?? '');
  }

  const items = (tasks ?? []).map(t => ({
    ...t,
    assigned_agent_name: t.assigned_to ? (nameMap.get(t.assigned_to as string) || null) : null,
  }));

  return NextResponse.json({ items });
}
