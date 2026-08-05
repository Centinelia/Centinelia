import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireVapiAuth } from '@/lib/vapi/auth';
import { executeSearchFiles } from '@/lib/services/connector-tools';
import { traceVoiceCall } from '@/lib/observability/voice-trace';

export async function POST(req: NextRequest) {
  if (!requireVapiAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const agent_id = searchParams.get('agent_id');
  if (!agent_id) return NextResponse.json({ result: 'Error: agent_id requerido' });

  const body = await req.json();
  const args = (body.message?.toolCallList ?? body.toolCallList)?.[0]?.function?.arguments ?? body;
  const { busqueda } = args as { busqueda: string };
  if (!busqueda) return NextResponse.json({ result: 'Necesito que me indiques qué archivo buscar.' });

  const startedAt = Date.now();
  const sessionId = (((body.message as Record<string, unknown> | undefined)?.call as Record<string, unknown> | undefined)?.id as string) ?? null;
  const supabase  = createAdminClient();

  console.log('[buscar-archivo] agent='+agent_id+' q="'+busqueda+'"');
  const result   = await executeSearchFiles(agent_id, busqueda, supabase);
  console.log('[buscar-archivo] result:', JSON.stringify(result).slice(0, 500));

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
    result:   { ok: result.ok, files_count: files.length, files: files.slice(0, 5), message: result.message ?? null, error: result.error ?? null },
    startedAt,
  });

  return NextResponse.json({ result: resultMsg });
}
