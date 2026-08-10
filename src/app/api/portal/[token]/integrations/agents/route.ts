export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse }     from 'next/server';
import { cookies }                       from 'next/headers';
import { createAdminClient }            from '@/lib/supabase/admin';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';
import { resolveOrgFromToken } from '@/lib/portal/org-token';

interface Params { params: Promise<{ token: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  const { token }   = await params;
  const cookieStore = await cookies();
  const session     = await verifySession(cookieStore.get(PORTAL_COOKIE)?.value ?? '');
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = createAdminClient();

  const resolved = await resolveOrgFromToken(token);
  if (!resolved?.portalEmail) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const anchor = { portal_email: resolved.portalEmail };
  if (session.portalEmail && anchor.portal_email !== session.portalEmail)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

  // Notion es org-level (compartido) — se checa una sola vez y todos los
  // agentes de la cuenta lo comparten.
  const [{ data: agents }, { data: orgNotion }] = await Promise.all([
    supabase
      .from('voice_agents')
      .select('id, agent_name, role, portal_token, features')
      .eq('portal_email', anchor.portal_email)
      .order('created_at', { ascending: true }),
    supabase
      .from('organizations')
      .select('notion_access_token')
      .eq('portal_email', anchor.portal_email)
      .maybeSingle(),
  ]);

  if (!agents?.length) return NextResponse.json({ agents: [] });

  const notionConnected = !!orgNotion?.notion_access_token;
  const agentIds = agents.map(a => a.id);

  const { data: emailConns } = await supabase
    .from('email_integrations')
    .select('agent_id, provider, email, last_sync_at, needs_reauth, send_as_email')
    .in('agent_id', agentIds);

  const byAgent: Record<string, typeof emailConns> = {};
  for (const c of emailConns ?? []) {
    (byAgent[c.agent_id] ??= []).push(c);
  }

  return NextResponse.json({
    agents: agents.map(a => ({
      id:              a.id,
      agent_name:      a.agent_name,
      role:            (a as any).role ?? '',
      portal_token:    a.portal_token,
      role_color:      ((a.features ?? {}) as Record<string, unknown>).role_color as string | null ?? null,
      connections:     byAgent[a.id] ?? [],
      notion_connected: notionConnected,
    })),
  });
}
