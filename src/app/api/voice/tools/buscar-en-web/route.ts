import { NextRequest, NextResponse } from 'next/server';
import { requireVapiAuth } from '@/lib/vapi/auth';
import { searchWeb } from '@/lib/search/web';
import { traceVoiceCall } from '@/lib/observability/voice-trace';
import { consumeAiOp } from '@/lib/ai/ops-guard';
import { extractToolCall, toolResponse } from '@/lib/voice/tool-response';

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

  const results = await searchWeb(query, 5);
  // Cost-based charge: Brave cobra por query, sin importar si hay resultados.
  await consumeAiOp(agent_id, 1, {
    source: 'web_search',
    label:  'Búsqueda web (Brave)',
  });
  if (!results.length) {
    trace({ ok: true, results_count: 0 });
    return toolResponse(toolCallId, `No encontré resultados para: "${query}". Intenta con otras palabras.`);
  }

  const summary = results
    .map((r, i) => `${i + 1}. ${r.title}: ${r.description}`)
    .join('\n');
  trace({ ok: true, results_count: results.length, top_titles: results.slice(0, 3).map(r => r.title) });
  return toolResponse(toolCallId, `Resultados para "${query}":\n\n${summary}`);
}
