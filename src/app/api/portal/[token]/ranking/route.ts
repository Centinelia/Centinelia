import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';
import { getPrimaryAgentFromToken } from '@/lib/portal/org-token';

const COLORS = ['#6C3BFF', '#9B6DFF', '#3b82f6', '#f59e0b', '#22c55e', '#a855f7', '#ef4444', '#06b6d4'];
function agentColor(id: string) {
  const hash = id.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return COLORS[hash % COLORS.length];
}

function periodStart(periodo: string): Date {
  const now = new Date();
  if (periodo === 'semana') {
    const d = new Date(now);
    d.setDate(now.getDate() - now.getDay());
    d.setHours(0, 0, 0, 0);
    return d;
  }
  if (periodo === 'año') {
    return new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0);
  }
  // mes (default)
  return new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const session = await verifySession(req.cookies.get(PORTAL_COOKIE)?.value ?? '');
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { token }  = await params;
  const periodo    = req.nextUrl.searchParams.get('periodo') ?? 'mes';
  const since      = periodStart(periodo).toISOString();
  const supabase   = createAdminClient();

  // Resolve account
  const base = await getPrimaryAgentFromToken<{ portal_email: string | null }>(token, 'portal_email', supabase);
  if (!base?.portal_email) return NextResponse.json({ agents: [] });
  if (session.portalEmail && base.portal_email !== session.portalEmail)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

  // All agents in the account
  const { data: agents } = await supabase
    .from('voice_agents')
    .select('id, agent_name, business_name, role, features')
    .eq('portal_email', base.portal_email);
  if (!agents?.length) return NextResponse.json({ agents: [] });

  const agentIds = agents.map(a => a.id);

  // Minutes per agent — sum duration_seconds from voice_calls
  const { data: callRows } = await supabase
    .from('voice_calls')
    .select('agent_id, duration_seconds')
    .in('agent_id', agentIds)
    .gte('created_at', since);

  const minutesMap: Record<string, number> = {};
  for (const row of callRows ?? []) {
    const mins = Math.ceil(((row.duration_seconds as number) ?? 0) / 60) || 1;
    minutesMap[row.agent_id] = (minutesMap[row.agent_id] ?? 0) + mins;
  }

  // Ops per agent — count rows in ai_ops_log
  const { data: opsRows } = await supabase
    .from('ai_ops_log')
    .select('agent_id')
    .in('agent_id', agentIds)
    .gte('created_at', since);

  const opsMap: Record<string, number> = {};
  for (const row of opsRows ?? []) {
    opsMap[row.agent_id] = (opsMap[row.agent_id] ?? 0) + 1;
  }

  const result = agents.map(a => {
    const features  = (a.features ?? {}) as Record<string, unknown>;
    const roleColor = (features.role_color as string | null) || '#6C3BFF';
    const avatarSrc = (features.avatar    as string | null) || null;
    const name      = (a.agent_name as string | null)?.trim() || (a.business_name as string);
    return {
      id:        a.id,
      name,
      role:      (a.role as string | null) || null,
      roleColor,
      avatarSrc,
      initial:   name.charAt(0).toUpperCase(),
      color:     agentColor(a.id),
      minutes:   minutesMap[a.id] ?? 0,
      ops:       opsMap[a.id]     ?? 0,
    };
  });

  return NextResponse.json({ agents: result });
}
