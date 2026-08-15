// src/app/api/portal/[token]/factura-requests/[id]/stamp/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';
import { getPrimaryAgentFromToken } from '@/lib/portal/org-token';
import { emitirFacturaAuto } from '@/lib/invoicing/emitir-factura';

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

  // Fetch all agent IDs for this org so we can scope the IDOR check
  const { data: siblings } = agent.portal_email
    ? await supabase.from('voice_agents').select('id').eq('portal_email', agent.portal_email)
    : { data: [{ id: agent.id }] };
  const agentIds = (siblings ?? [{ id: agent.id }]).map(a => a.id as string);

  // Verify ownership of the factura_request
  const { data: fr } = await supabase
    .from('factura_requests')
    .select('id, status, portal_email')
    .eq('id', id)
    .in('agent_id', agentIds)
    .single();

  if (!fr) return NextResponse.json({ error: 'not found' }, { status: 404 });
  if (fr.status === 'stamped') return NextResponse.json({ error: 'ya emitida' }, { status: 409 });

  // Clear guardrail_reason — humano ya autorizó
  await supabase.from('factura_requests').update({ guardrail_reason: null }).eq('id', id);

  // Stamp bypassing guardrails (human-authorized override)
  const result = await emitirFacturaAuto(id, supabase, { bypassGuardrails: true });

  // Audit log — best-effort
  void supabase.from('admin_access_log').insert({
    admin_email:           auth.portalEmail,
    endpoint:              '/api/portal/[token]/factura-requests/[id]/stamp',
    method:                'POST',
    affected_portal_email: agent.portal_email ?? auth.portalEmail,
    query_type:            'modify',
    filters:               { factura_request_id: id, outcome: result.outcome },
  });

  return NextResponse.json({ ok: true, ...result });
}
