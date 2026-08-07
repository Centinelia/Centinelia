import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getCurrentOnCall } from '@/lib/helpdesk/folio';
import type { GuardiaSchedule, GuardiaArea } from '@/lib/helpdesk/folio';
import { getHelpdeskExperts } from '@/lib/portal/directory';
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
    .select('portal_email, timezone')
    .eq('id', agentId)
    .single();

  const { data: org } = agent?.portal_email
    ? await supabase.from('organizations')
        .select('directory, guardia_schedule')
        .eq('portal_email', agent.portal_email)
        .single()
    : { data: null };

  const directory = ((org as any)?.directory ?? []);
  const experts   = getHelpdeskExperts(directory);
  const guardia   = (((org as any)?.guardia_schedule) as GuardiaSchedule | null)?.areas ?? [];
  const tz        = (agent?.timezone as string | null) ?? 'America/Monterrey';

  const lines: string[] = [];

  // Match desde el directorio
  if (experts.length > 0 && q) {
    const match = experts.find(p => {
      const expertise = (p.helpdesk_expertise ?? '').toLowerCase();
      const dept      = (p.department ?? '').toLowerCase();
      return expertise.split(/[\s,]+/).some(kw => kw.length > 3 && q.includes(kw))
          || dept.split(/\s+/).some(kw => q.includes(kw));
    });
    if (match) {
      const ext = match.extension ? ` (ext. ${match.extension})` : '';
      const tel = match.phone     ? `, ${match.phone}` : '';
      const dep = match.department ? ` se encarga de ${match.department}` : '';
      lines.push(`${match.name}${dep}${ext}${tel}.`);
    } else {
      lines.push('No encontré un especialista exacto para eso en el directorio.');
    }
  }

  // Quién está de guardia ahora para el área correspondiente
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
