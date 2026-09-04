import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';
import { getPrimaryAgentFromToken } from '@/lib/portal/org-token';

export const dynamic = 'force-dynamic';

interface Params { params: Promise<{ token: string }> }

async function resolveSession(token: string, cookieValue: string): Promise<{ portalEmail: string; isSubUser: boolean } | null> {
  const auth = await verifySession(cookieValue);
  if (!auth) return null;
  const supabase = createAdminClient();
  const data = await getPrimaryAgentFromToken<{ portal_email: string | null }>(token, 'portal_email', supabase);
  if (!data?.portal_email) return null;
  if (!auth.portalEmail || auth.portalEmail !== data.portal_email) return null;
  return { portalEmail: data.portal_email as string, isSubUser: auth.isSubUser };
}

/**
 * GET/PATCH per-empleado. Requiere `agent_id` en query.
 * - `always_approve_delegations` e `instant_processing_enabled` viven en
 *   voice_agents (per-empleado).
 * - `auto_approve_task_plans` sigue en organizations (flag interno de soporte,
 *   no expuesto per-empleado).
 *
 * Solo owners pueden leer/escribir. Sub-users reciben 403.
 */
export async function GET(req: NextRequest, { params }: Params) {
  const { token } = await params;
  const cookieStore = await cookies();
  const session = await resolveSession(token, cookieStore.get(PORTAL_COOKIE)?.value ?? '');
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.isSubUser) return NextResponse.json({ error: 'only_owner' }, { status: 403 });

  const agentId = req.nextUrl.searchParams.get('agent_id');
  if (!agentId) return NextResponse.json({ error: 'agent_id required' }, { status: 400 });

  const supabase = createAdminClient();

  const { data: orgRow } = await supabase
    .from('organizations')
    .select('auto_approve_task_plans')
    .eq('portal_email', session.portalEmail)
    .maybeSingle();

  const { data: agentRow } = await supabase
    .from('voice_agents')
    .select('always_approve_delegations, instant_processing_enabled, portal_email')
    .eq('id', agentId)
    .maybeSingle();
  if (!agentRow || agentRow.portal_email !== session.portalEmail) {
    return NextResponse.json({ error: 'agent not found in this org' }, { status: 404 });
  }

  return NextResponse.json({
    always_approve_delegations: !!agentRow.always_approve_delegations,
    auto_approve_task_plans:    !!(orgRow?.auto_approve_task_plans),
    instant_processing_enabled: agentRow.instant_processing_enabled !== false,
  });
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const { token } = await params;
  const cookieStore = await cookies();
  const session = await resolveSession(token, cookieStore.get(PORTAL_COOKIE)?.value ?? '');
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.isSubUser) return NextResponse.json({ error: 'only_owner' }, { status: 403 });

  const agentId = req.nextUrl.searchParams.get('agent_id');
  if (!agentId) return NextResponse.json({ error: 'agent_id required' }, { status: 400 });

  const body = await req.json() as {
    always_approve_delegations?: boolean;
    auto_approve_task_plans?:    boolean;
    instant_processing_enabled?: boolean;
  };

  const supabase = createAdminClient();

  // Verifica IDOR: el agent debe pertenecer a la org del session
  const { data: agentCheck } = await supabase
    .from('voice_agents').select('portal_email').eq('id', agentId).maybeSingle();
  if (!agentCheck || agentCheck.portal_email !== session.portalEmail) {
    return NextResponse.json({ error: 'agent not found in this org' }, { status: 404 });
  }

  // Precedence guard: si el caller envía ambos true, always gana.
  let alwaysApproveNext = body.always_approve_delegations;
  let autoApproveNext   = body.auto_approve_task_plans;
  if (alwaysApproveNext === true && autoApproveNext === true) {
    autoApproveNext = false;
  }

  if (typeof autoApproveNext === 'boolean') {
    const { error } = await supabase
      .from('organizations')
      .update({ auto_approve_task_plans: autoApproveNext })
      .eq('portal_email', session.portalEmail);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const perAgentUpdate: Record<string, unknown> = {};
  if (typeof alwaysApproveNext === 'boolean')                perAgentUpdate.always_approve_delegations = alwaysApproveNext;
  if (typeof body.instant_processing_enabled === 'boolean')  perAgentUpdate.instant_processing_enabled = body.instant_processing_enabled;

  if (Object.keys(perAgentUpdate).length > 0) {
    const { error } = await supabase.from('voice_agents').update(perAgentUpdate).eq('id', agentId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (typeof body.instant_processing_enabled === 'boolean') {
    const { clearInstantProcessingCache } = await import('@/lib/ops/instant-processing');
    clearInstantProcessingCache(agentId);
  }

  return NextResponse.json({ ok: true });
}
