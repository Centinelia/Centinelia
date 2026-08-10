import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';
import { getPrimaryAgentFromToken } from '@/lib/portal/org-token';

export const dynamic = 'force-dynamic';

interface Params { params: Promise<{ token: string }> }

export async function GET(req: NextRequest, { params }: Params) {
  const cookie = req.cookies.get(PORTAL_COOKIE)?.value ?? '';
  const auth   = await verifySession(cookie);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { token } = await params;
  const supabase  = createAdminClient();

  const agent = await getPrimaryAgentFromToken<{
    id: string;
    portal_email: string | null;
    agent_name: string | null;
  }>(token, 'id, portal_email, agent_name', supabase);
  if (!agent) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (agent.portal_email && auth.portalEmail && agent.portal_email !== auth.portalEmail) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Show account-wide (all siblings) para que Martha vea todas las solicitudes de la org.
  const { data: siblings } = agent.portal_email
    ? await supabase.from('voice_agents').select('id, agent_name').eq('portal_email', agent.portal_email)
    : { data: [{ id: agent.id, agent_name: agent.agent_name }] };
  const list = siblings ?? [{ id: agent.id, agent_name: agent.agent_name }];
  const agentIds   = list.map(a => a.id as string);
  const agentNames = Object.fromEntries(list.map(a => [a.id, (a.agent_name as string | null) ?? null]));

  const { data: rows } = await supabase
    .from('factura_requests')
    .select('id, agent_id, cliente_nombre, cliente_rfc, cliente_email, uso_cfdi, forma_pago, metodo_pago, subtotal, iva, total, currency, status, requested_at, resolved_at, resolved_by, issued_uuid, issued_folio, notes')
    .in('agent_id', agentIds)
    .order('requested_at', { ascending: false })
    .limit(200);

  return NextResponse.json({ requests: rows ?? [], agentNames });
}
