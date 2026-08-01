import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireVapiAuth } from '@/lib/vapi/auth';

export async function POST(req: NextRequest) {
  if (!requireVapiAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const agentId = req.nextUrl.searchParams.get('agent_id') ?? '';
  const body    = await req.json();
  const args    = (body.message?.toolCallList ?? body.toolCallList)?.[0]?.function?.arguments ?? body;
  const toolId  = (body.message?.toolCallList ?? body.toolCallList)?.[0]?.id ?? 'tool';

  const { tema } = args as { tema?: string };

  const supabase = createAdminClient();
  const { data: incidents } = await supabase
    .from('it_incidents')
    .select('titulo, descripcion, mensaje_voz, keywords')
    .eq('agent_id', agentId)
    .eq('activo', true)
    .order('created_at', { ascending: false });

  if (!incidents || incidents.length === 0) {
    return NextResponse.json({ results: [{ toolCallId: toolId, result: 'No hay incidentes activos en este momento.' }] });
  }

  // Match by keywords if tema provided
  const q = (tema ?? '').toLowerCase();
  const matches = q
    ? incidents.filter(i => {
        const all = [...(i.keywords as string[]), i.titulo, i.descripcion].join(' ').toLowerCase();
        return q.split(/\s+/).some(w => w.length > 3 && all.includes(w));
      })
    : incidents;

  const active = matches.length > 0 ? matches : incidents;

  const msg = active.map(i => i.mensaje_voz).join(' — ');
  return NextResponse.json({
    results: [{ toolCallId: toolId, result: msg }],
  });
}
