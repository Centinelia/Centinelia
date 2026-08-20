export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';
import { resolveOrgFromToken } from '@/lib/portal/org-token';
import { parseToolOverrides } from '@/lib/tools/tool-overrides';

interface Params { params: Promise<{ token: string; agentId: string }> }

async function guard(req: NextRequest, token: string, agentId: string) {
  const cookie  = req.cookies.get(PORTAL_COOKIE)?.value ?? '';
  const session = await verifySession(cookie);
  if (!session) return { error: 'Unauthorized', status: 401 as const, agent: null, supabase: null };

  const resolved = await resolveOrgFromToken(token);
  if (!resolved?.portalEmail) return { error: 'Not found', status: 404 as const, agent: null, supabase: null };
  if (session.portalEmail && resolved.portalEmail !== session.portalEmail) {
    return { error: 'Forbidden', status: 403 as const, agent: null, supabase: null };
  }

  const supabase = createAdminClient();
  const { data: agent } = await supabase
    .from('voice_agents')
    .select('id, portal_email, tool_overrides')
    .eq('id', agentId)
    .maybeSingle();
  if (!agent) return { error: 'Not found', status: 404 as const, agent: null, supabase: null };
  if (agent.portal_email !== resolved.portalEmail) {
    return { error: 'Forbidden', status: 403 as const, agent: null, supabase: null };
  }

  return { error: null, status: 200 as const, agent, supabase };
}

// GET /api/portal/[token]/agentes/[agentId]/tool-overrides
// Retorna { overrides: { disabled: string[], enabled: string[] } }
export async function GET(req: NextRequest, { params }: Params) {
  const { token, agentId } = await params;
  const g = await guard(req, token, agentId);
  if (g.error) return NextResponse.json({ error: g.error }, { status: g.status });

  const overrides = parseToolOverrides(g.agent!.tool_overrides);
  return NextResponse.json({ overrides });
}

// PATCH /api/portal/[token]/agentes/[agentId]/tool-overrides
// Body: { disabled?: string[], enabled?: string[] } (replaza el jsonb completo)
// Retorna { ok: true, overrides }
export async function PATCH(req: NextRequest, { params }: Params) {
  const { token, agentId } = await params;
  const g = await guard(req, token, agentId);
  if (g.error) return NextResponse.json({ error: g.error }, { status: g.status });

  const body = await req.json().catch(() => ({} as unknown));
  const parsed = parseToolOverrides(body);

  const { error } = await g.supabase!
    .from('voice_agents')
    .update({ tool_overrides: parsed })
    .eq('id', agentId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, overrides: parsed });
}
