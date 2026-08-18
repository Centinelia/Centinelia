export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';
import { getAgentAccess } from '@/lib/portal/agent-access';

interface Params { params: Promise<{ token: string }> }

const VALID_CAPABILITIES = ['email', 'files', 'phone', 'calendar', 'crm'] as const;
type Capability = typeof VALID_CAPABILITIES[number];

// GET — return all capability policies for agents accessible in this org (defaults for missing rows)
export async function GET(_req: NextRequest, { params }: Params) {
  const { token } = await params;
  const cookieStore = await cookies();
  const session = await verifySession(cookieStore.get(PORTAL_COOKIE)?.value ?? '');
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const access = await getAgentAccess(token, _req);
  if (!access) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (session.portalEmail && access.portalEmail && session.portalEmail !== access.portalEmail)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

  const supabase = createAdminClient();

  const { data: rows } = await supabase
    .from('agent_policies')
    .select('capability, enabled, requires_approval, preferred_provider')
    .in('agent_id', access.ids);

  const byCapability = Object.fromEntries((rows ?? []).map(r => [r.capability, r]));

  const policies = VALID_CAPABILITIES.map(cap => ({
    capability:         cap,
    enabled:            byCapability[cap]?.enabled            ?? true,
    requires_approval:  byCapability[cap]?.requires_approval  ?? false,
    preferred_provider: (byCapability[cap]?.preferred_provider as string | null) ?? null,
  }));

  // Last 20 audit entries for all accessible agents
  const { data: audit } = await supabase
    .from('policy_audit_log')
    .select('id, capability, action, status, created_at')
    .in('agent_id', access.ids)
    .order('created_at', { ascending: false })
    .limit(20);

  return NextResponse.json({ policies, audit: audit ?? [] });
}

// PATCH — upsert one capability policy
export async function PATCH(req: NextRequest, { params }: Params) {
  const { token } = await params;
  const cookieStore = await cookies();
  const session = await verifySession(cookieStore.get(PORTAL_COOKIE)?.value ?? '');
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json() as {
    capability: string;
    enabled?: boolean;
    requires_approval?: boolean;
    agentId?: string;
  };

  if (!VALID_CAPABILITIES.includes(body.capability as Capability))
    return NextResponse.json({ error: 'Invalid capability' }, { status: 400 });

  const access = await getAgentAccess(token, req);
  if (!access) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (session.portalEmail && access.portalEmail && session.portalEmail !== access.portalEmail)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

  // Caller may specify which peer to write for; default to primary.
  const targetAgentId = (body.agentId as string | undefined) ?? access.primaryId;
  if (!access.ids.includes(targetAgentId)) {
    return NextResponse.json({ error: 'Empleado no válido para este portal' }, { status: 403 });
  }

  const supabase = createAdminClient();

  const row: Record<string, unknown> = { agent_id: targetAgentId, capability: body.capability };
  if (body.enabled !== undefined)           row.enabled           = body.enabled;
  if (body.requires_approval !== undefined) row.requires_approval = body.requires_approval;

  const { error } = await supabase
    .from('agent_policies')
    .upsert(row, { onConflict: 'agent_id,capability' });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
