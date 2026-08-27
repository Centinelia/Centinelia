import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getCurrentOnCall } from '@/lib/helpdesk/folio';
import type { DirectoryPerson, GuardiaSchedule, GuardiaArea } from '@/lib/helpdesk/folio';
import { getHelpdeskExperts } from '@/lib/portal/directory';
import { requireVapiAuth } from '@/lib/vapi/auth';

// Búsquedas por flag: cada key es un valor que el LLM puede pasar en el
// parámetro `tipo_contacto`, mapea a un campo booleano de DirectoryPerson.
// Genérico a propósito: sirve a tortillerías (contacto_operaciones para el
// encargado de envíos), agencias (autorizador de OC), etc.
const FLAG_LOOKUPS: Record<string, keyof DirectoryPerson> = {
  contacto_operaciones: 'is_operations_contact',
  autorizador_oc:       'is_oc_autorizador',
  encargado_pagos:      'is_oc_pagos',
  dueno:                'is_owner',
};

function personLine(p: DirectoryPerson): string {
  const parts: string[] = [p.name];
  if (p.role)      parts.push(`(${p.role})`);
  if (p.phone)     parts.push(`— ${p.phone}`);
  if (p.extension) parts.push(`ext. ${p.extension}`);
  return parts.join(' ');
}

export async function POST(req: NextRequest) {
  if (!requireVapiAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const agentId = req.nextUrl.searchParams.get('agent_id') ?? '';
  const body    = await req.json();
  const args    = (body.message?.toolCallList ?? body.toolCallList)?.[0]?.function?.arguments ?? body;
  const toolId  = (body.message?.toolCallList ?? body.toolCallList)?.[0]?.id ?? 'tool';

  const { tipo_problema, tipo_contacto } = args as { tipo_problema?: string; tipo_contacto?: string };
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

  const directory: DirectoryPerson[] = ((org as any)?.directory ?? []);
  const tz        = (agent?.timezone as string | null) ?? 'America/Monterrey';

  // Rama 1: búsqueda directa por flag (Noah para operaciones, Nala para OC).
  // Prioritaria sobre helpdesk: si el LLM pasó tipo_contacto explícitamente,
  // sabe exactamente a quién quiere y devolvemos sin ambigüedad.
  if (tipo_contacto) {
    const flagKey = FLAG_LOOKUPS[tipo_contacto];
    if (!flagKey) {
      return NextResponse.json({
        results: [{ toolCallId: toolId, result: `Tipo de contacto "${tipo_contacto}" no reconocido. Válidos: ${Object.keys(FLAG_LOOKUPS).join(', ')}.` }],
      });
    }
    const matches = directory.filter(p => !!(p as any)[flagKey]);
    if (matches.length === 0) {
      return NextResponse.json({
        results: [{ toolCallId: toolId, result: `No hay nadie marcado como ${tipo_contacto.replace('_', ' ')} en el directorio de la organización. El dueño lo configura en el portal.` }],
      });
    }
    const summary = matches.length === 1
      ? personLine(matches[0])
      : matches.map((p, i) => `${i + 1}. ${personLine(p)}`).join('\n');
    return NextResponse.json({ results: [{ toolCallId: toolId, result: summary }] });
  }

  // Rama 2: legacy helpdesk (Neo) — match por expertise/departamento + guardia.
  const experts = getHelpdeskExperts(directory);
  const guardia = (((org as any)?.guardia_schedule) as GuardiaSchedule | null)?.areas ?? [];
  const lines: string[] = [];

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
