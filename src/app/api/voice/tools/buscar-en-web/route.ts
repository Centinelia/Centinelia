import { NextRequest, NextResponse } from 'next/server';
import { requireVapiAuth } from '@/lib/vapi/auth';
import { searchWeb } from '@/lib/search/web';
import { traceVoiceCall } from '@/lib/observability/voice-trace';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  if (!requireVapiAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const agent_id = searchParams.get('agent_id');
  if (!agent_id) return NextResponse.json({ result: 'Error: agent_id requerido.' });

  const body    = await req.json() as Record<string, unknown>;
  const call    = (((body.message as Record<string, unknown> | undefined)?.toolCallList ?? body.toolCallList) as Record<string, unknown>[])?.[0];
  const rawArgs = (call?.function as Record<string, unknown>)?.arguments ?? body;
  const args    = typeof rawArgs === 'string' ? JSON.parse(rawArgs) : rawArgs as Record<string, string>;
  const startedAt = Date.now();
  const sessionId = (((body.message as Record<string, unknown> | undefined)?.call as Record<string, unknown> | undefined)?.id as string) ?? null;
  const trace = (result: unknown, ok = true) => traceVoiceCall({
    toolName: 'buscar_en_web', agentId: agent_id, sessionId, input: args, result, ok, startedAt,
  });

  const { query } = args;
  if (!query) { trace({ error: 'missing_query' }, false); return NextResponse.json({ result: 'Necesito una consulta de búsqueda.' }); }

  if (!process.env.BRAVE_SEARCH_API_KEY) {
    trace({ error: 'brave_not_configured' }, false);
    return NextResponse.json({ result: 'La búsqueda web no está configurada en este momento.' });
  }

  const results = await searchWeb(query, 5);
  if (!results.length) {
    trace({ ok: true, results_count: 0 });
    return NextResponse.json({ result: `No encontré resultados para: "${query}". Intenta con otras palabras.` });
  }

  const summary = results
    .map((r, i) => `${i + 1}. ${r.title}: ${r.description}`)
    .join('\n');
  trace({ ok: true, results_count: results.length, top_titles: results.slice(0, 3).map(r => r.title) });
  return NextResponse.json({ result: `Resultados para "${query}":\n\n${summary}` });
}
