import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';
import { getPrimaryAgentFromToken } from '@/lib/portal/org-token';
import { executeAgentTool } from '@/lib/tools/executor';

interface Params { params: Promise<{ token: string }> }

export async function POST(req: NextRequest, { params }: Params) {
  const cookie = req.cookies.get(PORTAL_COOKIE)?.value ?? '';
  const auth   = await verifySession(cookie);
  if (!auth) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const { token } = await params;
  const supabase  = createAdminClient();

  // IDOR guard: verify this portal token belongs to the authenticated session
  const acct = await getPrimaryAgentFromToken<{ portal_email: string | null }>(token, 'portal_email', supabase);
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

  // Probe primero: ¿hay algo que reportar? Son solo queries a DB, cero costo LLM.
  // Evita cobrar 5 tareas por un brief vacío (bug reportado 2026-08-10).
  const { collectBriefData } = await import('@/lib/nox/brief-collector');
  const { data: orgAgents } = await supabase
    .from('voice_agents').select('id').eq('portal_email', acct.portal_email);
  const orgAgentIds = (orgAgents ?? []).map(a => a.id as string);
  const tz = (nox.timezone as string | null) ?? 'America/Monterrey';
  const briefData = await collectBriefData(orgAgentIds, acct.portal_email, tz, supabase);
  const totalItems =
    briefData.urgentEmails.items.length +
    briefData.upcomingEvents.items.length +
    briefData.pendingTasks.items.length +
    briefData.unresolvedEscalations.items.length +
    briefData.pendingContractDrafts.items.length;

  if (totalItems === 0) {
    // No hay data para brief — no cobrar, devolver estado 'empty' al front
    return NextResponse.json({
      ok:    true,
      empty: true,
      message: 'Sin pendientes que reportar por ahora. No se consumieron tareas.',
    });
  }

  const { consumeAiOp } = await import('@/lib/ai/ops-guard');
  const opsResult = await consumeAiOp(nox.id, 5, { source: 'nox_brief_manual', reference_id: `${nox.id as string}:${new Date().toISOString().slice(0, 10)}`, label: 'Brief del día bajo demanda' });
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
