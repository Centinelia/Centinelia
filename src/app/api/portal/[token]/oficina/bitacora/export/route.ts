import { NextRequest, NextResponse } from 'next/server';
import { loadBitacoraData } from '@/app/portal/[token]/oficina/bitacora/loadBitacoraData';
import { buildBitacoraExcelForAgent, sanitizeBusinessName } from '@/lib/bitacora/build-excel';
import { createAdminClient } from '@/lib/supabase/admin';
import { resolveOrgFromToken } from '@/lib/portal/org-token';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const week    = req.nextUrl.searchParams.get('week')     ?? undefined;
  const month   = req.nextUrl.searchParams.get('month')    ?? undefined;
  // agent_id opcional — si no viene, usa el primary del org (compat con Nelia
  // como único empleado con bitácora hoy). Cuando llegue Noah/Nala con bitácora
  // propia, el UI pasará ?agent_id=X explícito.
  const agentIdParam = req.nextUrl.searchParams.get('agent_id');
  const mode = month ? 'monthly' : 'weekly';
  const data = await loadBitacoraData(token, month ?? week, mode);

  if (!data || !data.enabled) {
    return NextResponse.json({ error: 'not available' }, { status: 404 });
  }

  const resolved = await resolveOrgFromToken(token);
  const supabase = createAdminClient();

  let targetAgentId = agentIdParam ?? data.agent.id;
  if (agentIdParam) {
    // Verify ownership
    const { data: check } = await supabase
      .from('voice_agents')
      .select('id')
      .eq('id', agentIdParam)
      .eq('portal_email', resolved!.portalEmail)
      .maybeSingle();
    if (!check) return NextResponse.json({ error: 'agent not in org' }, { status: 404 });
    targetAgentId = agentIdParam;
  }

  const buffer = await buildBitacoraExcelForAgent(supabase, targetAgentId, {
    incidents:     data.incidents,
    businessName:  data.agent.business_name,
    rangeStartISO: data.weekStart,
    mode:          data.mode,
  });

  const sanitizedBusiness = sanitizeBusinessName(data.agent.business_name);
  const suffix = mode === 'monthly' ? data.weekStart.slice(0, 7) : data.weekStart.slice(0, 10);
  const filename = `bitacora-${sanitizedBusiness}-${suffix}.xlsx`;

  return new NextResponse(buffer as any, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}
