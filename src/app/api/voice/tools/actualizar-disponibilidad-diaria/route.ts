import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireVapiAuth } from '@/lib/vapi/auth';
import { validateDailyAvailability } from '@/lib/daily-availability';
import { getOrgIndustry, INDUSTRIES_WITH_DAILY_AVAILABILITY } from '@/lib/industry';
import { traceVoiceCall } from '@/lib/observability/voice-trace';

export async function POST(req: NextRequest) {
  if (!requireVapiAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const agent_id = searchParams.get('agent_id');

  const body = await req.json();
  const args = (body.message?.toolCallList ?? body.toolCallList)?.[0]?.function?.arguments ?? body;
  const startedAt = Date.now();
  const sessionId = (body.message?.call?.id as string) ?? null;

  const agentId = agent_id ?? (args.agent_id as string | undefined);
  if (!agentId) return NextResponse.json({ result: 'Error de configuracion.' });

  const supabase = createAdminClient();

  const { data: agent, error: agentErr } = await supabase
    .from('voice_agents')
    .select('id, portal_email')
    .eq('id', agentId)
    .single();
  if (agentErr || !agent) {
    return NextResponse.json({ result: 'Agente no encontrado.' }, { status: 404 });
  }

  // Defense in depth: validate industry via org (single source of truth).
  const { data: org } = agent.portal_email
    ? await supabase.from('organizations').select('industry').eq('portal_email', agent.portal_email).maybeSingle()
    : { data: null };
  const industry = getOrgIndustry(org);
  if (!industry || !INDUSTRIES_WITH_DAILY_AVAILABILITY.includes(industry)) {
    return NextResponse.json({ result: 'Esta funcion no esta disponible para este negocio.' }, { status: 400 });
  }

  let snapshot;
  try {
    snapshot = validateDailyAvailability({
      updated_at:  new Date().toISOString(),
      updated_by:  `agent:${agent.id}`,
      unavailable: args.unavailable ?? [],
      limited:     args.limited     ?? [],
      special:     args.special     ?? null,
      notes:       args.notes       ?? null,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Datos invalidos.';
    return NextResponse.json({ result: `No pude guardar la disponibilidad: ${msg}` }, { status: 400 });
  }

  const { error: updErr } = await supabase
    .from('organizations')
    .update({ daily_availability: snapshot })
    .eq('portal_email', agent.portal_email);

  if (updErr) {
    console.error('[actualizar-disponibilidad-diaria] update error:', updErr.message);
    return NextResponse.json({ result: 'Hubo un error al guardar la disponibilidad. Intentalo de nuevo.' }, { status: 500 });
  }

  traceVoiceCall({
    toolName: 'actualizar_disponibilidad_diaria',
    agentId:  agentId,
    sessionId,
    input:    args,
    result:   { ok: true, snapshot },
    startedAt,
  });

  return NextResponse.json({
    result: 'Disponibilidad actualizada. Todos los empleados del negocio veran este estado.',
  });
}
