import { NextRequest, NextResponse } from 'next/server';
import { renderToBuffer } from '@react-pdf/renderer';
import { createElement } from 'react';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAgentForPdf, pdfResponse } from '../../_auth';
import { LlamadaPdf } from '@/lib/pdf/llamada';

interface Params { params: Promise<{ token: string; callId: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  const { token, callId } = await params;

  const ctx = await getAgentForPdf(token);
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = createAdminClient();
  const { data: call } = await supabase
    .from('voice_calls')
    .select('caller_number, outcome, duration_seconds, created_at, summary, transcript, acciones_pendientes, nivel_interes')
    .eq('id', callId)
    .eq('agent_id', ctx.agent.id as string)
    .single();

  if (!call) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const buffer = await renderToBuffer(createElement(LlamadaPdf, { brand: ctx.brand, call }) as any);
  const date   = new Date(call.created_at).toISOString().slice(0, 10);
  return pdfResponse(buffer, `resumen-llamada-${date}.pdf`);
}
