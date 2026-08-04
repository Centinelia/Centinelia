import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';
import { executeAgentTool } from '@/lib/tools/executor';

interface Params { params: Promise<{ token: string }> }

export async function POST(req: NextRequest, { params }: Params) {
  const cookie = req.cookies.get(PORTAL_COOKIE)?.value ?? '';
  const auth   = await verifySession(cookie);
  if (!auth) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const { token } = await params;
  const supabase  = createAdminClient();

  // IDOR guard: verify this portal token belongs to the authenticated session
  const { data: acct } = await supabase
    .from('voice_agents')
    .select('portal_email')
    .eq('portal_token', token)
    .single();
  if (!acct?.portal_email) return NextResponse.json({ error: 'Token inválido' }, { status: 401 });
  if (auth.portalEmail !== acct.portal_email)
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });

  // Find the active Nox agent for this org
  const { data: nox } = await supabase
    .from('voice_agents')
    .select('*')
    .eq('portal_email', acct.portal_email)
    .eq('active', true)
    .filter('features->>meerkat_role_id', 'eq', 'nox')
    .maybeSingle();

  if (!nox) return NextResponse.json({ error: 'no_nox_agent' }, { status: 404 });

  const { consumeAiOp } = await import('@/lib/ai/ops-guard');
  const opsResult = await consumeAiOp(nox.id, 5);
  if (!opsResult.ok) {
    return NextResponse.json({ ok: false, error: 'Sin operaciones disponibles este mes. Compra más o espera al ciclo siguiente.' }, { status: 429 });
  }

  const result = await executeAgentTool('preparar_brief_del_dia', {}, {
    agentId:      nox.id as string,
    portalEmail:  acct.portal_email,
    agentName:    (nox.agent_name as string | null) ?? 'Nox',
    businessName: nox.business_name as string,
    portalToken:  token,
    agent:        nox as Record<string, unknown>,
    supabase,
    channel:      'chat',
  });

  return NextResponse.json(result);
}
