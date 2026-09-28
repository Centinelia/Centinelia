import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireVapiAuth } from '@/lib/vapi/auth';
import { executeSearchFiles } from '@/lib/services/connector-tools';
import { traceVoiceCall } from '@/lib/observability/voice-trace';
import { extractToolCall, toolResponse } from '@/lib/voice/tool-response';

export async function POST(req: NextRequest) {
  if (!requireVapiAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const agent_id = searchParams.get('agent_id');

  const body = await req.json();
  const { toolCallId, args, sessionId } = extractToolCall(body);
  if (!agent_id) return toolResponse(toolCallId, 'Error: agent_id requerido');

  const { busqueda } = args as { busqueda?: string };
  if (!busqueda) return toolResponse(toolCallId, 'Necesito que me indiques qué archivo buscar.');

  const startedAt = Date.now();
  const supabase  = createAdminClient();

  const result = await executeSearchFiles(agent_id, busqueda, supabase);

  const files = (result.files as { id: string; name: string }[] | undefined) ?? [];
  const resultMsg = !result.ok
    ? String(result.error)
    : (files.length === 0
      ? (result.message as string | undefined) ?? `No encontré archivos que coincidan con "${busqueda}".`
      : `Encontré ${files.length} archivo(s) relacionado(s) con "${busqueda}": ${files.slice(0, 5).map(f => `${f.name} (ID: ${f.id})`).join(', ')}.${files.length > 1 ? ' ¿Cuál necesitas?' : ''}`);

  traceVoiceCall({
    toolName: 'buscar_archivo',
    agentId:  agent_id,
    sessionId,
    input:    { busqueda },
    result:   {
      ok:          result.ok,
      files_count: files.length,
      files:       files.slice(0, 5),
      ...(result.message ? { message: result.message } : {}),
      ...(result.ok ? {} : { error: result.error ?? 'unknown' }),
    },
    startedAt,
  });

  return toolResponse(toolCallId, resultMsg);
}
