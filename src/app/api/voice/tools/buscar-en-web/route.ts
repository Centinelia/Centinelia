import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireVapiAuth } from '@/lib/vapi/auth';
import { searchWeb } from '@/lib/search/web';
import { traceVoiceCall } from '@/lib/observability/voice-trace';
import { consumeAiOp } from '@/lib/ai/ops-guard';
import { extractToolCall, toolResponse } from '@/lib/voice/tool-response';
import { dedupLookup, dedupStore } from '@/lib/tools/dedup/with-dedup';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  if (!requireVapiAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const agent_id = searchParams.get('agent_id');

  const body = await req.json();
  const { toolCallId, args, sessionId } = extractToolCall(body);
  if (!agent_id) return toolResponse(toolCallId, 'Error: agent_id requerido.');

  const startedAt = Date.now();
  const trace = (result: unknown, ok = true) => traceVoiceCall({
    toolName: 'buscar_en_web', agentId: agent_id, sessionId, input: args, result, ok, startedAt,
  });

  const query = typeof args.query === 'string' ? args.query : '';
  if (!query) { trace({ error: 'missing_query' }, false); return toolResponse(toolCallId, 'Necesito una consulta de búsqueda.'); }

  if (!process.env.BRAVE_SEARCH_API_KEY) {
    trace({ error: 'brave_not_configured' }, false);
    return toolResponse(toolCallId, 'La búsqueda web no está configurada en este momento.');
  }

  // Fetch agent portal_email para dedup middleware.
  const supabase = createAdminClient();
  const { data: agent } = await supabase
    .from('voice_agents')
    .select('portal_email')
    .eq('id', agent_id)
    .maybeSingle();

  const dedupCtx = {
    agentId:     agent_id,
    portalEmail: (agent as { portal_email?: string } | null)?.portal_email ?? '',
    toolName:    'buscar_en_web',
    args:        args as Record<string, unknown>,
    channel:     'voice' as const,
    toolCallId,
  };
  const cached = await dedupLookup<{ msg: string }>(dedupCtx);
  if (cached) {
    trace({ ok: true, cached: true });
    return toolResponse(toolCallId, cached.msg);
  }

  const results = await searchWeb(query, 5);
  // Cost-based charge: Brave cobra por query, sin importar si hay resultados.
  await consumeAiOp(agent_id, 1, {
    source: 'web_search',
    label:  'Búsqueda web (Brave)',
  });
  if (!results.length) {
    trace({ ok: true, results_count: 0 });
    const emptyMsg = `No encontré resultados para: "${query}". Intenta con otras palabras.`;
    await dedupStore(dedupCtx, { msg: emptyMsg });
    return toolResponse(toolCallId, emptyMsg);
  }

  const summary = results
    .map((r, i) => `${i + 1}. ${r.title}: ${r.description}`)
    .join('\n');
  trace({ ok: true, results_count: results.length, top_titles: results.slice(0, 3).map(r => r.title) });
  const finalMsg = `Resultados para "${query}":\n\n${summary}`;
  await dedupStore(dedupCtx, { msg: finalMsg });
  return toolResponse(toolCallId, finalMsg);
}
