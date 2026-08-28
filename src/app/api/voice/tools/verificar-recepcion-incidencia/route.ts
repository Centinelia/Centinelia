import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verificarRecepcionIncidencia } from '@/lib/tools/executors/verificar-recepcion-incidencia';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const url = new URL(req.url);
  const agentId = url.searchParams.get('agent_id');
  if (!agentId) return NextResponse.json({ error: 'agent_id required' }, { status: 400 });

  const body = await req.json();
  const toolCall = body?.message?.toolCallList?.[0] ?? body?.message?.toolCalls?.[0];
  const toolCallId = toolCall?.id ?? toolCall?.toolCallId;
  const rawArgs = toolCall?.function?.arguments ?? toolCall?.arguments ?? {};
  const args = typeof rawArgs === 'string' ? JSON.parse(rawArgs) : rawArgs;

  const supabase = createAdminClient();
  const { data: agent } = await supabase.from('voice_agents').select('*').eq('id', agentId).single();
  if (!agent) return NextResponse.json({ error: 'agent not found' }, { status: 404 });

  try {
    const result = await verificarRecepcionIncidencia({ supabase, agent }, args);
    return NextResponse.json({ results: [{ toolCallId, result }] });
  } catch (err: any) {
    return NextResponse.json({
      results: [{ toolCallId, result: { error: err.message } }],
    });
  }
}
