// src/app/api/portal/[token]/factura-requests/[id]/mark-manual/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';
import { getPrimaryAgentFromToken } from '@/lib/portal/org-token';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, ctx: { params: Promise<{ token: string; id: string }> }) {
  const cookie = req.cookies.get(PORTAL_COOKIE)?.value ?? '';
  const auth   = await verifySession(cookie);
  if (!auth) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { token, id } = await ctx.params;
  const supabase = createAdminClient();

  // Resolve org from token and verify IDOR via portal_email match
  const agent = await getPrimaryAgentFromToken<{ id: string; portal_email: string | null }>(
    token, 'id, portal_email', supabase,
  );
  if (!agent) return NextResponse.json({ error: 'not found' }, { status: 404 });
  if (agent.portal_email && auth.portalEmail && agent.portal_email !== auth.portalEmail) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({} as { notes?: string })) as { notes?: string };

  // Fetch all agent IDs for this org so we can scope the IDOR check
  const { data: siblings } = agent.portal_email
    ? await supabase.from('voice_agents').select('id').eq('portal_email', agent.portal_email)
    : { data: [{ id: agent.id }] };
  const agentIds = (siblings ?? [{ id: agent.id }]).map(a => a.id as string);

  const { error } = await supabase
    .from('factura_requests')
    .update({
      status: 'marked_manual',
      notes:  body.notes ?? null,
    })
    .eq('id', id)
    .in('agent_id', agentIds);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
