import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';
import { resolveOrgFromToken } from '@/lib/portal/org-token';

interface Params { params: Promise<{ token: string }> }

export async function GET(req: NextRequest, { params }: Params) {
  const cookie = req.cookies.get(PORTAL_COOKIE)?.value ?? '';
  const auth   = await verifySession(cookie);
  if (!auth) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const { token } = await params;
  const supabase  = createAdminClient();

  const resolved = await resolveOrgFromToken(token);
  if (!resolved?.portalEmail) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
  const acct = { portal_email: resolved.portalEmail };
  if (auth.portalEmail !== acct.portal_email)
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });

  // Defense-in-depth: además de portal_email match, restringimos a agent_ids
  // que pertenecen explícitamente al portal (evita cualquier fuga si un row
  // quedara mal-atribuido con un agent_id de otro tenant).
  const { data: portalAgents } = await supabase
    .from('voice_agents').select('id').eq('portal_email', acct.portal_email);
  const agentIds = (portalAgents ?? []).map(a => a.id as string);
  if (agentIds.length === 0) return NextResponse.json({ runs: [] });

  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400_000).toISOString();

  const { data: runs } = await supabase
    .from('heartbeat_runs')
    .select('id, agent_id, ran_at, frequency, subject, content_md, read_at')
    .eq('portal_email', acct.portal_email)
    .in('agent_id', agentIds)
    .gte('ran_at', thirtyDaysAgo)
    .order('ran_at', { ascending: false })
    .limit(100);

  return NextResponse.json({ runs: runs ?? [] });
}
