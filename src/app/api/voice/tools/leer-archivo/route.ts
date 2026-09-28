import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireVapiAuth } from '@/lib/vapi/auth';
import { executeReadFile } from '@/lib/services/connector-tools';
import { traceVoiceCall } from '@/lib/observability/voice-trace';
import { extractToolCall, toolResponse } from '@/lib/voice/tool-response';

export const dynamic = 'force-dynamic';

const VOICE_MAX_CHARS = 4_000;

export async function POST(req: NextRequest) {
  if (!requireVapiAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const agent_id = searchParams.get('agent_id');

  const body = await req.json();
  const { toolCallId, args, sessionId } = extractToolCall(body);
  if (!agent_id) return toolResponse(toolCallId, 'Error: agent_id requerido.');

  const startedAt = Date.now();
  const trace = (result: unknown, ok = true) => traceVoiceCall({
    toolName: 'leer_archivo', agentId: agent_id, sessionId, input: args, result, ok, startedAt,
  });

  const file_id   = typeof args.file_id === 'string' ? args.file_id : '';
  const file_name = typeof args.file_name === 'string' ? args.file_name : '';
  const mime_type = typeof args.mime_type === 'string' ? args.mime_type : '';
  if (!file_id || !file_name) { trace({ error: 'missing_params' }, false); return toolResponse(toolCallId, 'Necesito el ID y el nombre del archivo.'); }

  const supabase = createAdminClient();
  const result   = await executeReadFile(agent_id, file_id, file_name, mime_type, supabase);

  if (!result.ok) { trace({ error: result.error }, false); return toolResponse(toolCallId, String(result.error)); }

  const content = (result.content as string).slice(0, VOICE_MAX_CHARS);
  const note    = result.truncated ? ' [Contenido parcial — el documento es más largo.]' : '';

  trace({ ok: true, file_name, chars: content.length, truncated: !!result.truncated });
  return toolResponse(toolCallId, `Contenido de "${file_name}":${note}\n\n${content}`);
}
