export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';

interface Params { params: Promise<{ token: string }> }

async function resolve(token: string) {
  const supabase = createAdminClient();
  const { data: agent } = await supabase
    .from('voice_agents')
    .select('id, portal_email')
    .eq('portal_token', token)
    .single();
  return { supabase, agent };
}

const VALID_CAPABILITIES = ['email', 'files', 'phone', 'calendar', 'crm'] as const;
type Capability = typeof VALID_CAPABILITIES[number];

// GET — return all capability policies for this agent (defaults for missing rows)
export async function GET(_req: NextRequest, { params }: Params) {
  const { token } = await params;
  const cookieStore = await cookies();
  const session = await verifySession(cookieStore.get(PORTAL_COOKIE)?.value ?? '');
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { supabase, agent } = await resolve(token);
  if (!agent) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (session.portalEmail && agent.portal_email && session.portalEmail !== agent.portal_email)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

  const { data: rows } = await supabase
    .from('agent_policies')
    .select('capability, enabled, requires_approval, preferred_provider')
    .eq('agent_id', agent.id);

  const byCapability = Object.fromEntries((rows ?? []).map(r => [r.capability, r]));

  const policies = VALID_CAPABILITIES.map(cap => ({
    capability:         cap,
    enabled:            byCapability[cap]?.enabled            ?? true,
    requires_approval:  byCapability[cap]?.requires_approval  ?? false,
    preferred_provider: (byCapability[cap]?.preferred_provider as string | null) ?? null,
  }));

  // Last 20 audit entries for this agent
  const { data: audit } = await supabase
    .from('policy_audit_log')
    .select('id, capability, action, status, created_at')
    .eq('agent_id', agent.id)
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
  };

  if (!VALID_CAPABILITIES.includes(body.capability as Capability))
    return NextResponse.json({ error: 'Invalid capability' }, { status: 400 });

  const { supabase, agent } = await resolve(token);
  if (!agent) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (session.portalEmail && agent.portal_email && session.portalEmail !== agent.portal_email)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

  const row: Record<string, unknown> = { agent_id: agent.id, capability: body.capability };
  if (body.enabled !== undefined)           row.enabled           = body.enabled;
  if (body.requires_approval !== undefined) row.requires_approval = body.requires_approval;

  const { error } = await supabase
    .from('agent_policies')
    .upsert(row, { onConflict: 'agent_id,capability' });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
