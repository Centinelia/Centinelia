import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getCurrentOnCall } from '@/lib/helpdesk/folio';
import type { GuardiaSchedule, DirectorioContacto, GuardiaArea } from '@/lib/helpdesk/folio';
import { requireVapiAuth } from '@/lib/vapi/auth';

export async function POST(req: NextRequest) {
  if (!requireVapiAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const agentId = req.nextUrl.searchParams.get('agent_id') ?? '';
  const body    = await req.json();
  const args    = (body.message?.toolCallList ?? body.toolCallList)?.[0]?.function?.arguments ?? body;
  const toolId  = (body.message?.toolCallList ?? body.toolCallList)?.[0]?.id ?? 'tool';

  const { tipo_problema } = args as { tipo_problema?: string };
  const q = (tipo_problema ?? '').toLowerCase();

  const supabase = createAdminClient();
  const { data: agent } = await supabase
    .from('voice_agents')
    .select('directorio_interno, guardia_schedule, timezone')
    .eq('id', agentId)
    .single();

  const directorio = (agent?.directorio_interno ?? []) as DirectorioContacto[];
  const guardia    = (agent?.guardia_schedule as GuardiaSchedule | null)?.areas ?? [];
  const tz         = (agent?.timezone as string | null) ?? 'America/Monterrey';

  const lines: string[] = [];

  // Match from static directory
  if (directorio.length > 0 && q) {
    const match = directorio.find(c =>
      c.atiende.toLowerCase().split(/[\s,]+/).some(kw => kw.length > 3 && q.includes(kw)) ||
      c.area.toLowerCase().split(/\s+/).some(kw => q.includes(kw))
    );
    if (match) {
      const ext = match.extension ? ` (ext. ${match.extension})` : '';
      const tel = match.telefono  ? `, ${match.telefono}` : '';
      lines.push(`${match.nombre} se encarga de ${match.area}${ext}${tel}.`);
    } else if (directorio.length > 0) {
      lines.push('No encontré un especialista exacto para eso en el directorio.');
    }
  }

  // Who is on call right now for the matching area
  if (guardia.length > 0) {
    const area: GuardiaArea | undefined = q
      ? guardia.find(a => q.includes(a.nombre.toLowerCase().split(' ')[0].toLowerCase()))
      : undefined;
    const target = area ?? guardia[0];
    if (target) {
      const oncall = getCurrentOnCall(target, tz);
      if (oncall) {
        lines.push(`El técnico de guardia ahora en ${target.nombre} es ${oncall.tecnico}${oncall.telefono ? `, ${oncall.telefono}` : ''}.`);
      }
    }
  }

  if (lines.length === 0) {
    lines.push('No tengo configurado un directorio de especialistas para esta área todavía.');
  }

  return NextResponse.json({ results: [{ toolCallId: toolId, result: lines.join(' ') }] });
}
