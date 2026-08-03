export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';
import { listCivicAttachments, findReportByFolio } from '@/lib/civic/attachments';

interface Params { params: Promise<{ token: string; folio: string }> }

export async function GET(req: NextRequest, { params }: Params) {
  const cookie = req.cookies.get(PORTAL_COOKIE)?.value ?? '';
  const auth   = await verifySession(cookie);
  if (!auth) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const { token, folio } = await params;
  const supabase = createAdminClient();

  // IDOR guard: verify folio belongs to same account as URL token
  const { data: portalAgent } = await supabase
    .from('voice_agents').select('id, portal_email').eq('portal_token', token).single();
  if (!portalAgent) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
  if (auth.portalEmail && portalAgent.portal_email && auth.portalEmail !== portalAgent.portal_email)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

  const report = await findReportByFolio(folio, supabase);
  if (!report) return NextResponse.json({ error: 'Reporte no encontrado' }, { status: 404 });

  const { data: sib } = portalAgent.portal_email
    ? await supabase.from('voice_agents').select('id').eq('portal_email', portalAgent.portal_email)
    : { data: [{ id: portalAgent.id }] };
  const accountAgentIds = new Set((sib ?? []).map((a: any) => a.id as string));
  if (!accountAgentIds.has(report.agent_id)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const attachments = await listCivicAttachments(report.id, supabase);
  return NextResponse.json({ attachments });
}
