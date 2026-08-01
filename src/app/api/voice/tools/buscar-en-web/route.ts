import { NextRequest, NextResponse } from 'next/server';
import { requireVapiAuth } from '@/lib/vapi/auth';
import { searchWeb } from '@/lib/search/web';

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

  const { query } = args;
  if (!query) return NextResponse.json({ result: 'Necesito una consulta de búsqueda.' });

  if (!process.env.BRAVE_SEARCH_API_KEY) {
    return NextResponse.json({ result: 'La búsqueda web no está configurada en este momento.' });
  }

  const results = await searchWeb(query, 5);
  if (!results.length) {
    return NextResponse.json({ result: `No encontré resultados para: "${query}". Intenta con otras palabras.` });
  }

  const summary = results
    .map((r, i) => `${i + 1}. ${r.title}: ${r.description}`)
    .join('\n');

  return NextResponse.json({ result: `Resultados para "${query}":\n\n${summary}` });
}
