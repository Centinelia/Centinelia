import { NextRequest, NextResponse } from 'next/server';
import { renderToBuffer } from '@react-pdf/renderer';
import { createElement } from 'react';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAgentForPdf, pdfResponse } from '../../_auth';
import { OrdenPdf } from '@/lib/pdf/orden';
import { getOrgAgentIds } from '@/lib/portal/roster';

interface Params { params: Promise<{ token: string; orderId: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  const { token, orderId } = await params;

  const ctx = await getAgentForPdf(token);
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = createAdminClient();
  // Org-scoped: cualquier orden del org puede generar PDF desde cualquier meerkat.
  // Ver [[handoff-peer-discrimination-fix]] audit 2026-08-18.
  const roster = await getOrgAgentIds(supabase, ctx.agent.portal_email as string | null, ctx.agent.id as string);
  const { data: orden } = await supabase
    .from('orders_voice')
    .select('id, nombre, telefono, items, tipo, direccion, notas, status, created_at')
    .eq('id', orderId)
    .in('agent_id', roster)
    .single();

  if (!orden) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const buffer = await renderToBuffer(createElement(OrdenPdf, { brand: ctx.brand, orden }) as any);
  const date   = new Date(orden.created_at).toISOString().slice(0, 10);
  return pdfResponse(buffer, `orden-${date}.pdf`);
}
