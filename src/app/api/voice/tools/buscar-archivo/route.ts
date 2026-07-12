import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireVapiAuth } from '@/lib/vapi/auth';
import { executeSearchFiles } from '@/lib/services/connector-tools';

export async function POST(req: NextRequest) {
  if (!requireVapiAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const agent_id = searchParams.get('agent_id');
  if (!agent_id) return NextResponse.json({ result: 'Error: agent_id requerido' });

  const body = await req.json();
  const args = body.toolCallList?.[0]?.function?.arguments ?? body;
  const { busqueda } = args as { busqueda: string };
  if (!busqueda) return NextResponse.json({ result: 'Necesito que me indiques qué archivo buscar.' });

  const supabase = createAdminClient();
  const result   = await executeSearchFiles(agent_id, busqueda, supabase);

  if (!result.ok) return NextResponse.json({ result: result.error });

  const files = result.files as { id: string; name: string }[] | undefined ?? [];
  if (!files.length) return NextResponse.json({ result: `No encontré archivos que coincidan con "${busqueda}".` });

  const top  = files.slice(0, 5);
  const list = top.map(f => `${f.name} (ID: ${f.id})`).join(', ');
  return NextResponse.json({
    result: `Encontré ${files.length} archivo(s) relacionado(s) con "${busqueda}": ${list}.${top.length > 1 ? ' ¿Cuál necesitas?' : ''}`,
  });
}
