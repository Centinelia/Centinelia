import { NextRequest, NextResponse } from 'next/server';
import { renderToBuffer } from '@react-pdf/renderer';
import { createElement } from 'react';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAgentForPdf, pdfResponse } from '../../_auth';
import { OrdenPdf } from '@/lib/pdf/orden';

interface Params { params: Promise<{ token: string; orderId: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  const { token, orderId } = await params;

  const ctx = await getAgentForPdf(token);
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = createAdminClient();
  const { data: orden } = await supabase
    .from('orders_voice')
    .select('id, nombre, telefono, items, tipo, direccion, notas, status, created_at')
    .eq('id', orderId)
    .eq('agent_id', ctx.agent.id as string)
    .single();

  if (!orden) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const buffer = await renderToBuffer(createElement(OrdenPdf, { brand: ctx.brand, orden }) as any);
  const date   = new Date(orden.created_at).toISOString().slice(0, 10);
  return pdfResponse(buffer, `orden-${date}.pdf`);
}
