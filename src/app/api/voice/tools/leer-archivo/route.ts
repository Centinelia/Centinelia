import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireVapiAuth } from '@/lib/vapi/auth';
import { executeReadFile } from '@/lib/services/connector-tools';
import { traceVoiceCall } from '@/lib/observability/voice-trace';

export const dynamic = 'force-dynamic';

const VOICE_MAX_CHARS = 4_000;

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
    toolName: 'leer_archivo', agentId: agent_id, sessionId, input: args, result, ok, startedAt,
  });

  const { file_id, file_name, mime_type } = args;
  if (!file_id || !file_name) { trace({ error: 'missing_params' }, false); return NextResponse.json({ result: 'Necesito el ID y el nombre del archivo.' }); }

  const supabase = createAdminClient();
  const result   = await executeReadFile(agent_id, file_id, file_name, mime_type ?? '', supabase);

  if (!result.ok) { trace({ error: result.error }, false); return NextResponse.json({ result: result.error }); }

  const content = (result.content as string).slice(0, VOICE_MAX_CHARS);
  const note    = result.truncated ? ' [Contenido parcial — el documento es más largo.]' : '';

  trace({ ok: true, file_name, chars: content.length, truncated: !!result.truncated });
  return NextResponse.json({ result: `Contenido de "${file_name}":${note}\n\n${content}` });
}
