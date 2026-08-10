import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';

export const dynamic = 'force-dynamic';

interface Params { params: Promise<{ token: string }> }

export async function GET(req: NextRequest, { params: _params }: Params) {
  const session = await verifySession(req.cookies.get(PORTAL_COOKIE)?.value ?? '');
  if (!session?.portalEmail) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const q            = searchParams.get('q')?.trim() ?? '';
  const dest         = searchParams.get('to')?.trim() ?? '';
  const dias         = Math.min(365, Math.max(1, Number(searchParams.get('dias') ?? '60')));
  const limitN       = Math.min(100, Math.max(1, Number(searchParams.get('limit') ?? '50')));
  const sinceIso     = new Date(Date.now() - dias * 86_400_000).toISOString();

  const supabase = createAdminClient();
  let qb = supabase
    .from('outbound_emails')
    .select('id, agent_id, to_email, cc_email, subject, body, provider, ok, created_at')
    .eq('portal_email', session.portalEmail)
    .gte('created_at', sinceIso)
    .order('created_at', { ascending: false })
    .limit(limitN);

  if (dest) qb = qb.ilike('to_email', `%${dest}%`);
  if (q)    qb = qb.or(`subject.ilike.%${q}%,body.ilike.%${q}%`);

  const { data: rows, error } = await qb;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const agentIds = Array.from(new Set((rows ?? []).map(r => r.agent_id as string | null).filter(Boolean))) as string[];
  const agentMap = new Map<string, string>();
  if (agentIds.length > 0) {
    const { data: agents } = await supabase
      .from('voice_agents')
      .select('id, agent_name')
      .in('id', agentIds);
    for (const a of agents ?? []) agentMap.set(a.id as string, (a.agent_name as string | null) ?? 'Empleado');
  }

  const enriched = (rows ?? []).map(r => ({
    id:          r.id,
    enviado_por: r.agent_id ? (agentMap.get(r.agent_id as string) ?? 'Empleado') : 'Sistema',
    to:          r.to_email,
    cc:          r.cc_email ?? null,
    subject:     r.subject,
    body:        r.body,
    provider:    r.provider,
    ok:          r.ok,
    sent_at:     r.created_at,
  }));

  return NextResponse.json({ items: enriched, count: enriched.length });
}
