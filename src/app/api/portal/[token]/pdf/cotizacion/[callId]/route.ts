import { NextRequest, NextResponse } from 'next/server';
import { renderToBuffer } from '@react-pdf/renderer';
import { createElement } from 'react';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAgentForPdf, pdfResponse } from '../../_auth';
import { CotizacionPdf } from '@/lib/pdf/cotizacion';
import { getOrgAgentIds } from '@/lib/portal/roster';

interface Params { params: Promise<{ token: string; callId: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  const { token, callId } = await params;

  const ctx = await getAgentForPdf(token);
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = createAdminClient();

  // Org-scoped: cualquier call/lead del org puede generar PDF desde cualquier meerkat.
  // Ver [[handoff-peer-discrimination-fix]] audit 2026-08-18.
  const roster = await getOrgAgentIds(supabase, ctx.agent.portal_email as string | null, ctx.agent.id as string);

  // Pull call + associated lead in parallel
  const [callRes, leadRes] = await Promise.all([
    supabase.from('voice_calls')
      .select('caller_number, summary, created_at')
      .eq('id', callId).in('agent_id', roster).single(),
    supabase.from('leads_voice')
      .select('nombre, whatsapp, telefono, email, servicio, presupuesto')
      .in('agent_id', roster)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (!callRes.data) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const call = callRes.data;
  const lead = leadRes.data;

  const data = {
    clientName:  lead?.nombre      ?? null,
    phone:       lead?.telefono ?? lead?.whatsapp ?? call.caller_number ?? null,
    email:       lead?.email       ?? null,
    servicio:    lead?.servicio    ?? null,
    presupuesto: lead?.presupuesto ?? null,
    notas:       call.summary      ?? null,
  };

  const buffer = await renderToBuffer(createElement(CotizacionPdf, { brand: ctx.brand, data }) as any);
  const date   = new Date(call.created_at).toISOString().slice(0, 10);
  return pdfResponse(buffer, `cotizacion-${date}.pdf`);
}
