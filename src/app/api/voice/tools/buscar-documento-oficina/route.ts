/**
 * Voice tool: buscar_documento_oficina — busca en ops_documents del portal.
 * Devuelve lista compacta (título, tipo, cliente, monto, fecha) para que el
 * meerkat identifique el doc antes de reutilizarlo.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireVapiAuth } from '@/lib/vapi/auth';
import { searchOfficeDocuments, formatDocsForAgent } from '@/lib/documents/ops-docs-search';

export async function POST(req: NextRequest) {
  if (!requireVapiAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const agent_id = new URL(req.url).searchParams.get('agent_id');
  if (!agent_id) return NextResponse.json({ result: 'Error: agent_id requerido' });

  const body = await req.json();
  const args = (body.message?.toolCallList ?? body.toolCallList)?.[0]?.function?.arguments ?? body;
  const toolCallId = (body.message?.toolCallList ?? body.toolCallList)?.[0]?.id ?? 'call_1';

  const { query, kind, cliente, limit } = (typeof args === 'string' ? JSON.parse(args) : args) as {
    query?: string; kind?: string; cliente?: string; limit?: number;
  };

  const supabase = createAdminClient();
  const { data: agent } = await supabase
    .from('voice_agents').select('portal_email').eq('id', agent_id).single();
  if (!agent?.portal_email) return NextResponse.json({ results: [{ toolCallId, result: 'Error: cuenta no encontrada.' }] });

  const docs = await searchOfficeDocuments({
    supabase, portalEmail: agent.portal_email as string,
    query: query ?? null, kind: kind ?? null, clientName: cliente ?? null, limit: limit ?? 10,
  });

  return NextResponse.json({
    results: [{ toolCallId, result: formatDocsForAgent(docs) }],
  });
}
