import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireVapiAuth } from '@/lib/vapi/auth';
import { validateDailyAvailability } from '@/lib/daily-availability';
import { getOrgIndustry, INDUSTRIES_WITH_DAILY_AVAILABILITY } from '@/lib/industry';
import { traceVoiceCall } from '@/lib/observability/voice-trace';
import { resyncPeerAgents } from '@/lib/vapi/sync';
import { extractToolCall, toolResponse } from '@/lib/voice/tool-response';

export async function POST(req: NextRequest) {
  if (!requireVapiAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const agent_id = searchParams.get('agent_id');

  const body = await req.json();
  const { toolCallId, args, sessionId } = extractToolCall(body);
  const startedAt = Date.now();

  const agentId = agent_id ?? (args.agent_id as string | undefined);
  if (!agentId) return toolResponse(toolCallId, 'Error de configuracion.');

  const supabase = createAdminClient();

  const { data: agent, error: agentErr } = await supabase
    .from('voice_agents')
    .select('id, portal_email')
    .eq('id', agentId)
    .single();
  if (agentErr || !agent) {
    return toolResponse(toolCallId, 'Agente no encontrado.');
  }

  // Defense in depth: validate industry via org (single source of truth).
  const { data: org } = agent.portal_email
    ? await supabase.from('organizations').select('industry').eq('portal_email', agent.portal_email).maybeSingle()
    : { data: null };
  const industry = getOrgIndustry(org);
  if (!industry || !INDUSTRIES_WITH_DAILY_AVAILABILITY.includes(industry)) {
    return toolResponse(toolCallId, 'Esta funcion no esta disponible para este negocio.');
  }

  let snapshot;
  try {
    snapshot = validateDailyAvailability({
      updated_at:  new Date().toISOString(),
      updated_by:  `agent:${agent.id}`,
      unavailable: (args.unavailable as any[]) ?? [],
      limited:     (args.limited     as any[]) ?? [],
      special:     (args.special     as any) ?? null,
      notes:       (args.notes       as string | null) ?? null,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Datos invalidos.';
    return toolResponse(toolCallId, `No pude guardar la disponibilidad: ${msg}`);
  }

  const { error: updErr } = await supabase
    .from('organizations')
    .update({ daily_availability: snapshot })
    .eq('portal_email', agent.portal_email);

  if (updErr) {
    console.error('[actualizar-disponibilidad-diaria] update error:', updErr.message);
    return toolResponse(toolCallId, 'Hubo un error al guardar la disponibilidad. Intentalo de nuevo.');
  }

  traceVoiceCall({
    toolName: 'actualizar_disponibilidad_diaria',
    agentId:  agentId,
    sessionId,
    input:    args,
    result:   { ok: true, snapshot },
    startedAt,
  });

  // Propagate to Vapi so future calls see the new prompt. In-flight calls keep
  // the assistant config they started with — this update only takes effect on
  // the next call, not the one that just wrote the change.
  if (agent.portal_email) {
    resyncPeerAgents(agent.portal_email, '').catch(err => {
      console.error('actualizar-disponibilidad-diaria: Vapi resync failed', err);
    });
  }

  return toolResponse(toolCallId, 'Disponibilidad actualizada. Todos los empleados del negocio veran este estado.');
}
