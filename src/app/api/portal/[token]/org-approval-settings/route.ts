import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';
import { getPrimaryAgentFromToken } from '@/lib/portal/org-token';

export const dynamic = 'force-dynamic';

interface Params { params: Promise<{ token: string }> }

async function resolvePortalEmail(token: string, cookieValue: string): Promise<string | null> {
  const auth = await verifySession(cookieValue);
  if (!auth) return null;
  const supabase = createAdminClient();
  const data = await getPrimaryAgentFromToken<{ portal_email: string | null }>(token, 'portal_email', supabase);
  if (!data?.portal_email) return null;
  if (auth.portalEmail && auth.portalEmail !== data.portal_email) return null;
  return data.portal_email as string;
}

/**
 * GET/PATCH aceptan `agent_id` opcional en query.
 * - Si viene agent_id → lee/escribe `always_approve_delegations` e
 *   `instant_processing_enabled` de `voice_agents` (per-empleado).
 * - Sin agent_id (legacy) → cae a `organizations`.
 * - `auto_approve_task_plans` SIEMPRE se maneja a nivel org (flag interno de
 *   soporte, no expuesto per-empleado).
 */
export async function GET(req: NextRequest, { params }: Params) {
  const { token } = await params;
  const cookieStore = await cookies();
  const portalEmail = await resolvePortalEmail(token, cookieStore.get(PORTAL_COOKIE)?.value ?? '');
  if (!portalEmail) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const agentId = req.nextUrl.searchParams.get('agent_id');
  const supabase = createAdminClient();

  const { data: orgRow } = await supabase
    .from('organizations')
    .select('auto_approve_task_plans')
    .eq('portal_email', portalEmail)
    .maybeSingle();

  let alwaysApprove = false;
  let instantEnabled = true;
  if (agentId) {
    const { data: agentRow } = await supabase
      .from('voice_agents')
      .select('always_approve_delegations, instant_processing_enabled, portal_email')
      .eq('id', agentId)
      .maybeSingle();
    if (!agentRow || agentRow.portal_email !== portalEmail) {
      return NextResponse.json({ error: 'agent not found in this org' }, { status: 404 });
    }
    alwaysApprove  = !!agentRow.always_approve_delegations;
    instantEnabled = agentRow.instant_processing_enabled !== false;
  } else {
    const { data: orgFallback } = await supabase
      .from('organizations')
      .select('always_approve_delegations, instant_processing_enabled')
      .eq('portal_email', portalEmail)
      .maybeSingle();
    alwaysApprove  = !!orgFallback?.always_approve_delegations;
    instantEnabled = orgFallback?.instant_processing_enabled !== false;
  }

  return NextResponse.json({
    always_approve_delegations: alwaysApprove,
    auto_approve_task_plans:    !!(orgRow?.auto_approve_task_plans),
    instant_processing_enabled: instantEnabled,
  });
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const { token } = await params;
  const cookieStore = await cookies();
  const portalEmail = await resolvePortalEmail(token, cookieStore.get(PORTAL_COOKIE)?.value ?? '');
  if (!portalEmail) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const agentId = req.nextUrl.searchParams.get('agent_id');

  const body = await req.json() as {
    always_approve_delegations?: boolean;
    auto_approve_task_plans?:    boolean;
    instant_processing_enabled?: boolean;
  };

  const supabase = createAdminClient();

  // Precedence guard: si el caller envía ambos true, always gana.
  let alwaysApproveNext = body.always_approve_delegations;
  let autoApproveNext   = body.auto_approve_task_plans;
  if (alwaysApproveNext === true && autoApproveNext === true) {
    autoApproveNext = false;
  }

  // 1. auto_approve_task_plans siempre a org (flag interno).
  if (typeof autoApproveNext === 'boolean') {
    const { error } = await supabase
      .from('organizations')
      .update({ auto_approve_task_plans: autoApproveNext })
      .eq('portal_email', portalEmail);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // 2. always_approve + instant_processing per-empleado si viene agent_id, si no org.
  const perAgentUpdate: Record<string, unknown> = {};
  if (typeof alwaysApproveNext === 'boolean') perAgentUpdate.always_approve_delegations = alwaysApproveNext;
  if (typeof body.instant_processing_enabled === 'boolean') perAgentUpdate.instant_processing_enabled = body.instant_processing_enabled;

  if (Object.keys(perAgentUpdate).length > 0) {
    if (agentId) {
      const { data: agentCheck } = await supabase
        .from('voice_agents').select('portal_email').eq('id', agentId).maybeSingle();
      if (!agentCheck || agentCheck.portal_email !== portalEmail) {
        return NextResponse.json({ error: 'agent not found in this org' }, { status: 404 });
      }
      const { error } = await supabase.from('voice_agents').update(perAgentUpdate).eq('id', agentId);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    } else {
      const { error } = await supabase.from('organizations').update(perAgentUpdate).eq('portal_email', portalEmail);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  if (typeof body.instant_processing_enabled === 'boolean') {
    const { clearInstantProcessingCache } = await import('@/lib/ops/instant-processing');
    if (agentId) clearInstantProcessingCache(agentId);
    else clearInstantProcessingCache();
  }

  return NextResponse.json({ ok: true });
}
